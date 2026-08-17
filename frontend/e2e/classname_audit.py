#!/usr/bin/env python3
"""Style audit: dead classes, inline-style token drift, duplicate selectors.

Three independent checks over the frontend source (pure static analysis —
no build or browser needed):

  1. Dead classes      every className in src must resolve to a CSS rule
                       (catches orphaned classes / dropped Tailwind).
  2. Inline-style drift
                       fontFamily must use var(--font-sans)/var(--font-mono);
                       fontSize must use the fs.* type scale (typeScale.js)
                       instead of raw pixels.
  3. Duplicate selectors
                       a simple class selector defined in 2+ rule blocks
                       whose declarations overlap is a redefinition — the
                       later rule silently overrides the earlier one. The
                       intentional animation-layer pattern (re-declaring a
                       selector with only `animation`) does not overlap and
                       is not flagged.

  default       prints all reports (exit 0)
  --check       CI gate: exits 1 if any check fails
  --verbose     also print counts

Run:  cd frontend && python3 e2e/classname_audit.py [--check]
"""

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
SRC = FRONTEND / "src"

# All CSS that ends up in the built app:
#   index.css + design-tokens.css  (imported by index.jsx)
#   components/LandingPage.css     (imported by LandingPage.jsx)
#   themes/*.css                   (lazy chunks loaded by themeLoader.js)
CSS_GLOBS = [
    "index.css",
    "design-tokens.css",
    "components/LandingPage.css",
    "themes/*.css",
]

CLASS_RE = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*)")
STATIC_CLASSNAME_RE = re.compile(r'className="([^"]+)"')
SIMPLE_CLASS = re.compile(r"\.[A-Za-z_][A-Za-z0-9_-]*")
PROP_RE = re.compile(r"([a-zA-Z-]+)\s*:")

# Inline-style drift patterns (applied to style={{...}} object bodies)
FONT_FAMILY_RE = re.compile(r'fontFamily\s*:\s*["\']([^"\']+)["\']')
FONT_SIZE_RE = re.compile(r"fontSize\s*:\s*([^,}\n]+)")


def css_files():
    files = []
    for g in CSS_GLOBS:
        files.extend(SRC.glob(g))
    return sorted(files)


def _css_text():
    return "\n".join(f.read_text(encoding="utf-8") for f in css_files())


def defined_classes():
    text = re.sub(r"/\*.*?\*/", "", _css_text(), flags=re.S)
    return set(CLASS_RE.findall(text))


def _template_bodies(line):
    """Yield the raw bodies of `className={`...`}` template literals on a
    line. Tracks ${...} expressions and nested template literals with a
    small stack so multi-level classNames (e.g. ToastSystem's nested
    ternary) are covered instead of silently skipped."""
    pos = 0
    while True:
        idx = line.find("className={`", pos)
        if idx < 0:
            return
        i = idx + len("className={`")
        stack = []  # frames: "expr" (inside ${...}) or "tpl" (nested `...`)
        body = []
        while i < len(line):
            c = line[i]
            if not stack:
                if c == "`":
                    yield "".join(body)
                    pos = i + 1
                    break
                if c == "$" and i + 1 < len(line) and line[i + 1] == "{":
                    stack.append("expr")
                    i += 2
                    continue
                body.append(c)
            elif stack[-1] == "tpl":
                if c == "$" and i + 1 < len(line) and line[i + 1] == "{":
                    stack.append("expr")
                    i += 2
                    continue
                if c == "`":
                    stack.pop()
            else:  # "expr"
                if c == "`":
                    stack.append("tpl")
                elif c == "{":
                    stack.append("expr")
                elif c == "}":
                    stack.pop()
            i += 1
        else:
            return


def _strip_expressions(tpl):
    """Remove ${...} blocks (handles nested template literals) from a
    template-literal className, keeping only the static text."""
    out = []
    depth = 0
    i = 0
    while i < len(tpl):
        if tpl.startswith("${", i):
            depth += 1
            i += 2
            continue
        if depth and tpl[i] == "}":
            depth -= 1
            i += 1
            continue
        if not depth:
            out.append(tpl[i])
        i += 1
    return "".join(out)


def static_tokens(line):
    """Yield class tokens from static and template-literal className props."""
    for m in STATIC_CLASSNAME_RE.finditer(line):
        yield from m.group(1).split()
    for body in _template_bodies(line):
        # Drop ${...} expressions (dynamic state tokens are composed at
        # runtime), then tokenize the remaining static text. Strip trailing
        # '-' so `cls--${x}` yields `cls--` -> dropped instead of a phantom
        # `cls--` token.
        for frag in _strip_expressions(body).split():
            frag = frag.rstrip("-")
            if frag:
                yield frag


def used_classes():
    used = {}
    for jsx in sorted(SRC.rglob("*.jsx")) + sorted(SRC.rglob("*.js")):
        for i, line in enumerate(
            jsx.read_text(encoding="utf-8").splitlines(), start=1
        ):
            for tok in static_tokens(line):
                if tok.startswith(("-", "@", "#", ":")):
                    continue
                used.setdefault(tok, []).append(f"{jsx.relative_to(SRC)}:{i}")
    return used


def dead_classes():
    defined = defined_classes()
    used = used_classes()
    return {
        tok: locs for tok, locs in sorted(used.items()) if tok not in defined
    }


def _style_object_bodies(text):
    """Yield (start_line, body) for each `style={{...}}` object in a file's
    text. Scans past the opening braces with brace matching so multi-line
    inline styles are captured whole, and skips quoted strings (so braces
    inside e.g. a data-URL or content string can't corrupt the scan)."""
    i = 0
    n = len(text)
    bodies = []
    quote = None  # current string delimiter, or None outside a string
    while i < n:
        idx = text.find("style={{", i)
        if idx < 0:
            break
        start_line = text.count("\n", 0, idx) + 1
        depth = 2
        j = idx + len("style={{")
        body = []
        while j < n and depth > 0:
            c = text[j]
            if quote is not None:
                if c == "\\":
                    j += 2
                    continue
                if c == quote:
                    quote = None
                if depth > 0:
                    body.append(c)
                j += 1
                continue
            if c in ('"', "'", "`"):
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            if depth > 0:
                body.append(c)
            j += 1
        bodies.append((start_line, "".join(body)))
        i = j
    return bodies


def inline_style_drift():
    """Flag fontFamily/fontSize inside React style={{...}} objects that
    bypass the design tokens (var(--font-*) / the fs.* type scale). Only
    real inline styles are checked — pdfmake document config in
    pdfBuilder.js and SVG attribute fontSize="N" are untouched."""
    issues = []
    for jsx in sorted(SRC.rglob("*.jsx")):
        rel = str(jsx.relative_to(SRC))
        text = jsx.read_text(encoding="utf-8")
        for start_line, body in _style_object_bodies(text):
            for m in FONT_FAMILY_RE.finditer(body):
                val = m.group(1)
                # Any bare generic stack word (even after a token, e.g.
                # "var(--font-mono), monospace") means a raw stack slipped in.
                if re.search(
                    r"(^|[,\s])(monospace|sans-serif|serif|system-ui|ui-monospace)",
                    val,
                ):
                    issues.append(
                        (f"{rel}:{start_line}",
                         f'fontFamily "{val}" — use var(--font-sans)/var(--font-mono)')
                    )
            for m in FONT_SIZE_RE.finditer(body):
                val = m.group(1).strip().strip('"\'')
                if re.fullmatch(r"\d+(\.\d+)?(px)?", val):
                    issues.append(
                        (f"{rel}:{start_line}",
                         f'fontSize "{val}" — use the fs.* type scale (typeScale.js)')
                    )
    return issues


def _parse_css_rules(text, media_depth=0):
    """Recursively parse CSS into (selector, declaration_body, media_depth)
    tuples. @media blocks recurse with depth+1; @keyframes are skipped."""
    rules = []
    i = 0
    n = len(text)
    while i < n:
        j = text.find("{", i)
        if j < 0:
            break
        sel = text[i:j].strip()
        depth = 1
        k = j + 1
        while k < n and depth:
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
            k += 1
        body = text[j + 1 : k - 1]
        if sel.startswith("@media"):
            rules.extend(_parse_css_rules(body, media_depth + 1))
        elif sel.startswith("@keyframes"):
            pass
        elif not sel.startswith("@"):
            rules.append((sel, body, media_depth))
        i = k
    return rules


# `transition` is the one property the codebase intentionally layers: a
# shared base block (index.css:145) sets a default transition on many
# components and individual blocks override it with faster per-component
# values. Any OTHER overlapping property means a later block silently
# redefines an earlier declaration — genuine drift.
OVERLAP_IGNORE = {"transition"}


def duplicate_selector_overlap():
    """Flag simple class selectors defined 2+ times (top level, outside
    @media) whose declaration property sets overlap on anything other than
    `transition` — a true redefinition where the later rule silently wins."""
    text = re.sub(r"/\*.*?\*/", "", _css_text(), flags=re.S)
    by_sel = defaultdict(list)
    for sel, body, media_depth in _parse_css_rules(text):
        if media_depth != 0:
            continue
        for part in sel.split(","):
            part = part.strip()
            if re.fullmatch(r"\.[A-Za-z_][A-Za-z0-9_-]*", part):
                props = set(PROP_RE.findall(body)) - OVERLAP_IGNORE
                by_sel[part].append(props)
    issues = []
    for sel, prop_sets in sorted(by_sel.items()):
        for a in range(len(prop_sets)):
            for b in range(a + 1, len(prop_sets)):
                overlap = prop_sets[a] & prop_sets[b]
                if overlap:
                    issues.append((sel, sorted(overlap)))
                    break  # one report per duplicated selector
    return issues


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="CI gate: exit 1 if any check fails",
    )
    ap.add_argument("--verbose", action="store_true", help="print counts")
    args = ap.parse_args()

    dead = dead_classes()
    drift = inline_style_drift()
    dups = duplicate_selector_overlap()

    if args.verbose:
        print(f"CSS files scanned : {len(css_files())}")
        print(f"CSS classes defined: {len(defined_classes())}")
        print(f"className tokens used: {len(used_classes())}")

    failures = 0

    if dead:
        failures += 1
        print("DEAD CLASSES — className used but never defined in CSS:")
        for tok, locs in dead.items():
            shown = ", ".join(locs[:4])
            more = f" (+{len(locs) - 4} more)" if len(locs) > 4 else ""
            print(f"  ✗ .{tok:<32s} {shown}{more}")

    if drift:
        failures += 1
        print("INLINE-STYLE DRIFT — style props that bypass design tokens:")
        for loc, msg in drift:
            print(f"  ✗ {loc}: {msg}")

    if dups:
        failures += 1
        print("DUPLICATE SELECTORS — class redefined with overlapping props:")
        for sel, overlap in dups:
            print(
                f"  ✗ .{sel:<32s} redefined; overlapping props: {', '.join(overlap)}"
            )

    if failures:
        print(
            "\nStyle drift fails the build. Fix the issues above, then re-run: "
            "python3 e2e/classname_audit.py --check"
        )
        return 1

    print(
        "STYLE AUDIT PASSED — no dead classes, token drift, or duplicate "
        "selectors" if args.check else "No style drift found."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
