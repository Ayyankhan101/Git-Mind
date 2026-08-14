# PDF Export + Share Links Design

Date: 2026-08-14
Status: Approved (user)
Scope: Brutalist print redesign of PDF exports (matching web aesthetic with embedded Geist fonts) + resilient share links (error states, token recovery, canonical link format)

## Current state

**PDF export** (`frontend/src/pdfBuilder.js`, pdfmake):
- Three builders exist — `buildAnalysisPdf` (wired to Command Palette "Export report" → `handleExport` in `App.jsx`), plus `buildSummaryPdf` and `buildIncidentPdf` which are **never called anywhere** (dead code)
- Generic light palette (`#6366f1` indigo, Roboto from the stock pdfmake vfs) — does not match the web app's brutalist industrial aesthetic
- Bugs:
  - `_NUM_RE` has the `/g` flag and is used with `.test()` — `lastIndex` carries over between calls, so numbers are inconsistently highlighted in `highlightCode`
  - Long unbroken strings (CVE URLs, file paths) overflow fixed-width table cells
  - Emoji / unsupported glyphs render as boxes (Roboto coverage)
  - `downloadPdf` receives no `cacheKey` from `handleExport` — the built-in PDF cache is dead code
  - Filename built from `repoName` un-sanitized (may contain `/`)

**Link system** (share-by-URL):
- Share URL: `?share=${SESSION_ID}` where `SESSION_ID` is a `sessionStorage` UUID (App.jsx:32)
- `handleShare` (App.jsx:612) copies `${origin}${pathname}?share=<id>`; MonitoringTab links use `/?share=<id>` — two different shapes
- `loadSharedAnalysis(...).catch(() => {})` (App.jsx:158) silently swallows every failure (404 expired/never saved, 401 locked after the 24h hybrid-auth cutoff, 429 rate limit, network)
- `_apiFetch` throws plain `Error(msg)` without an HTTP status — callers cannot classify failures

## Section 1 — PDF: brutalist print refactor

### Fonts — embed Geist + Geist Mono
- Download static TTFs (Geist-Regular, Geist-Bold, GeistMono-Regular, GeistMono-Bold) from the official `vercel/geist-font` release (SIL OFL 1.1 — embeddable)
- Commit TTFs to `frontend/src/fonts/`; add `scripts/build-pdf-fonts.js` (Node) that base64-encodes them into checked-in `frontend/src/pdfFonts.js` (regenerable)
- `pdfBuilder.js`: `pdfMake.vfs = pdfFonts` (replaces stock Roboto vfs) + declare `pdfMake.fonts = { Geist: {…}, GeistMono: {…} }`
- Body/headings → Geist; kickers, labels, code, numerals → GeistMono (exact brand match)
- Bundle cost ~300–800KB base64, but only inside the already-lazy `import("./pdfBuilder")` — initial load unaffected
- Fallback: if the font download is unavailable at setup time, ship the Roboto baseline (PDF still renders)

### Shared primitives (internal helpers, all 3 builders)
- `BRAND` palette: ink `#08090e`, indigo accent `#7c6fe0`, paper `#ffffff`, mid-gray text tones, severity set (critical `#dc2626`, high `#ea580c`, medium `#ca8a04`, low `#6b7280`, info `#2563eb`)
- `mono(text, opts)` — GeistMono uppercase, letter-spaced kicker/label
- `sectionHeader(num, title)` — numbered kicker (`01 · ARCHITECTURE`) + 1pt hard rule
- `chip(severity)` — solid severity block, 1pt border, uppercase
- `dataTable(headers, rows)` — 1pt black-bordered grid, black header row with white text
- `safeText(s)` — XML-entity escape (`& < >`) + strip emoji/control/unsupported glyphs
- `wrapLong(s)` — chunk unbroken strings every ~40 chars so tables never overflow

### Bug fixes
- `_NUM_RE`: make stateless (per-call regex or `part.match(/^\d+(\.\d+)?$/)`) in `highlightCode`
- Filename sanitize: strip `/ \ : * ? " < > |` and control chars, spaces → `-`
- `handleExport` passes `cacheKey` (`gm:<SESSION_ID>:analysis`); re-export reuses `getCachedPdf`

### Redesign coverage (analysis report)
- Cover: oversized mono wordmark, heavy repo name, thick rule bars, mono meta table (date / duration / sections), severity summary strip
- Architecture: mermaid diagram as bordered mono code block
- API Endpoints: method chips (colored, bordered) + route/description table
- Security Findings: severity chips + rule + details; file:line in mono
- CVE: package header in mono, per-vuln table
- Git Audit: 4-up stat tiles (thick borders, big mono numerals), secret findings + sensitive files tables
- Solidity + Code Audit: per-language tables with severity chips
- Health: big grade numeral + breakdown bars (restyled)

### Wiring dead builders
- `SummaryTab`: "Export PDF" button in header → `buildSummaryPdf` (uses already-loaded `data.summary`/`data.stats` + `health`, `repoName`, `elapsedSec`)
- `CrisisChat`: "Export PDF" button beside copy-report → `buildIncidentPdf({ report, finding, outcome, repoName })`; thread `repoName` prop from `SecurityTab`

### Testing
- New `frontend/src/pdfBuilder.test.js`: number-highlight regression, `safeText`, `wrapLong`, filename sanitize, cache key behavior
- Existing gates pass: frontend jest, lint, prettier

## Section 2 — Link system: resilient share links

### Status propagation (`frontend/src/api.js`)
- `_apiFetch`: attach `err.status = res.status` on all non-ok paths; `err.status = 0` for network/timeout failures
- `loadSharedAnalysis` propagates the classified error

### Share-load flow (`frontend/src/App.jsx`)
- Replace silent `.catch(() => {})` with classification:
  - `404` → "expired or never saved"
  - `401` → "locked — add your GitHub token to unlock" → token-input overlay (reuses `tokenManager`) → retry automatically on submit
  - `429` → rate-limit message
  - `status 0` → backend unreachable
  - else → generic message with Retry
- New reducer state `shareError` in `uiReducer` + `SET_SHARE_ERROR`/`CLEAR_SHARE_ERROR` actions
- Error renders as an App-level overlay (message + Retry / Unlock actions); cleared on success

### Canonical link format
- `handleShare`: `${origin}/?share=<id>` (root, route-agnostic) — matches MonitoringTab's existing shape; one format everywhere

### Testing
- `api.test.js`: `loadSharedAnalysis` propagates status
- `App.test.jsx` / overlay component tests: 404, 401 (unlock flow), 429, network states

## Target files
- `frontend/src/pdfBuilder.js` (refactor), `frontend/src/pdfFonts.js` (new, generated), `frontend/src/fonts/*.ttf` (new, checked in), `scripts/build-pdf-fonts.js` (new)
- `frontend/src/pdfBuilder.test.js` (new)
- `frontend/src/components/SummaryTab.jsx`, `frontend/src/components/CrisisChat.jsx`, `frontend/src/components/SecurityTab.jsx` (export buttons + prop threading)
- `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/reducers/uiReducer.js`, `frontend/src/appReducer.js`
- New share-error overlay component (App-level)
- `frontend/src/api.test.js`, `frontend/src/App.test.jsx`

## Out of scope
- No backend changes (Link option B — expiry metadata — deferred)
- No changes to the web UI aesthetic itself; PDF only
