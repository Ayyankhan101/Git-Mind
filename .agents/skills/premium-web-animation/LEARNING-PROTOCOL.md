# Self-Learning Protocol

## Overview

This skill improves over time through structured feedback, pattern accumulation, and periodic review. Every use is a learning opportunity. The system captures what works, what fails, and what's missing — then feeds those insights back into the skill.

## Architecture

```
premium-web-animation/
├── SKILL.md                    # Core skill (what Claude reads)
├── learning/
│   ├── protocol.md             # This file — how learning works
│   ├── patterns-library.json   # Accumulated knowledge (patterns, anti-patterns, recipes)
│   ├── feedback-log.json       # Raw feedback from skill usage
│   ├── review-queue.json       # Pending improvements for next version
│   └── version-history.json    # Version tracking
├── evals/
│   └── evals.json              # Test cases for validation
└── trigger-evals/
    └── trigger_evals.json      # Trigger accuracy tests
```

## Learning Cycle

### Phase 1: Capture (Every Use)

After every skill invocation, the agent appends a structured entry to `feedback-log.json`. This is automatic — no user action needed.

**What gets captured:**
- The user's original prompt (anonymized if needed)
- Which libraries were recommended
- Whether the output was accepted, modified, or rejected
- Any user feedback (explicit or implicit)
- The composition pattern used
- Whether any anti-patterns were caught

**Entry format:**
```json
{
  "id": "uuid",
  "timestamp": "2026-08-19T21:00:00Z",
  "prompt_summary": "Landing page with scroll animations, Next.js",
  "libraries_used": ["GSAP", "Lenis", "ScrollTrigger"],
  "composition_pattern": "scroll-choreography",
  "outcome": "accepted",
  "user_feedback": null,
  "notes": "User asked for Framer Motion but redirected to GSAP — accepted",
  "new_pattern_detected": false,
  "anti_pattern_caught": false
}
```

**Outcome values:**
- `accepted` — User used the output as-is
- `modified` — User made changes (log what changed)
- `rejected` — User didn't use the output (log why if known)
- `partial` — Part was accepted, part was changed

### Phase 2: Extract (Weekly / Every 10 Uses)

After accumulating 10 new feedback entries (or weekly, whichever comes first), extract patterns:

**From accepted outputs:**
- Which composition patterns work reliably?
- Which library combinations get positive feedback?
- Are there new use cases not covered by existing patterns?

**From modified outputs:**
- What did the user change? Why?
- Was there a missing pattern the skill should have suggested?
- Did the user need a library combination not in the decision framework?

**From rejected outputs:**
- Why was it rejected? (if known)
- Was the wrong library recommended?
- Was the animation approach too complex / too simple?
- Did the skill trigger when it shouldn't have (or vice versa)?

**Output:** Add new entries to `patterns-library.json` and `review-queue.json`.

### Phase 3: Accumulate (Ongoing)

The `patterns-library.json` grows over time with three types of knowledge:

#### 1. Composition Recipes
Proven library combinations for specific use cases:

```json
{
  "type": "composition_recipe",
  "name": "E-commerce product page with 3D",
  "use_case": "Product page with scroll-linked 3D rotation and colorway reveals",
  "libraries": ["Three.js", "GSAP ScrollTrigger", "Lenis"],
  "success_rate": 0.95,
  "times_used": 12,
  "last_updated": "2026-08-19",
  "notes": "Works best with dynamic import of Three.js for bundle size",
  "learned_from": ["eval-6", "user-feedback-2026-08-15"]
}
```

#### 2. Anti-Patterns
Mistakes to avoid, discovered through failures:

```json
{
  "type": "anti_pattern",
  "name": "Animate width/height for modals",
  "description": "Animating layout properties causes reflows. Use transform + opacity.",
  "severity": "high",
  "detection_signal": "User asks about janky modal animations",
  "fix": "Use scale + opacity instead of width + height",
  "times_detected": 5,
  "first_detected": "2026-08-19"
}
```

#### 3. Trigger Insights
Understanding of when the skill should and shouldn't trigger:

```json
{
  "type": "trigger_insight",
  "pattern": "User mentions 'simple CSS animation' with 'nothing fancy'",
  "should_trigger": false,
  "reasoning": "Simple CSS transitions are not premium animation. Skill adds no value.",
  "confidence": 0.98,
  "validated": true
}
```

### Phase 4: Review (Periodic)

The `review-queue.json` accumulates proposed improvements. During review:

1. **Read the queue** — What improvements are pending?
2. **Prioritize** — Which have the highest impact?
3. **Validate** — Do they pass the eval suite?
4. **Apply** — Update SKILL.md with approved changes
5. **Repackage** — Create new .skill file
6. **Clear queue** — Mark reviewed items as applied

**Review triggers:**
- Every 20 feedback entries
- Monthly (whichever comes first)
- When user explicitly asks to improve the skill

### Phase 5: Optimize (Description)

The description triggers are refined based on actual usage:

1. **Track trigger accuracy** — Did the skill trigger correctly for each use?
2. **Identify gaps** — Queries that should have triggered but didn't (or vice versa)
3. **Propose description updates** — Add new trigger phrases
4. **Validate with evals** — Run trigger evals to check for regressions
5. **Apply if passing** — Update description in SKILL.md

## Feedback Entry Template

When capturing feedback, use this template:

```json
{
  "id": "<uuid>",
  "timestamp": "<ISO-8601>",
  "prompt_summary": "<one-line summary of what user asked>",
  "libraries_recommended": ["<list of libraries suggested>"],
  "libraries_used_by_user": ["<list user actually used, if known>"],
  "composition_pattern": "<pattern name from decision framework>",
  "outcome": "accepted|modified|rejected|partial",
  "user_feedback": "<explicit feedback if any, null otherwise>",
  "what_worked": "<what was good about the output>",
  "what_missed": "<what was missing or wrong>",
  "new_use_case": false,
  "new_use_case_description": null,
  "anti_pattern_caught": false,
  "anti_pattern_description": null,
  "trigger_correct": true,
  "trigger_notes": null
}
```

## Anti-Pattern Detection

The skill learns new anti-patterns from failures. When a user modifies or rejects an output:

1. **Identify the gap** — What was wrong?
2. **Generalize** — Is this a one-off or a recurring pattern?
3. **Add to library** — If recurring, add to anti-patterns in patterns-library.json
4. **Add detection signal** — How to catch this earlier next time
5. **Update SKILL.md** — If the anti-pattern is common enough, add it to the Common Anti-Patterns section

## Composition Learning

The skill learns which library combinations work best:

1. **Track outcomes by composition** — Which combos get accepted vs rejected?
2. **Identify winners** — Compositions with >80% acceptance rate
3. **Identify losers** — Compositions with <50% acceptance rate
4. **Update decision framework** — Add new winning combos, remove losers
5. **Add to patterns library** — Document proven recipes

## Version Control

Version format: `v<major>.<minor>.<patch>`

- **Major** — Breaking changes to skill structure or behavior
- **Minor** — New patterns, anti-patterns, or significant improvements
- **Patch** — Small fixes, typo corrections, description tweaks

Version history is tracked in `version-history.json`:

```json
{
  "versions": [
    {
      "version": "1.0.0",
      "date": "2026-08-19",
      "changes": "Initial skill with 8 libraries, decision framework, code patterns",
      "trigger_accuracy": 1.0,
      "eval_pass_rate": 1.0
    },
    {
      "version": "1.1.0",
      "date": "2026-08-19",
      "changes": "Added accessibility, mobile, anti-patterns, bundle budgets, React Spring vs Motion",
      "trigger_accuracy": 1.0,
      "eval_pass_rate": 1.0
    },
    {
      "version": "1.2.0",
      "date": "2026-08-19",
      "changes": "Optimized description with accessibility, mobile, gesture triggers. 28 eval queries.",
      "trigger_accuracy": 1.0,
      "eval_pass_rate": 1.0
    }
  ]
}
```

## How the Agent Uses This

When the skill is invoked:

1. **Before generating** — Read patterns-library.json for relevant recipes
2. **During generation** — Apply proven patterns, avoid known anti-patterns
3. **After generation** — Log the outcome to feedback-log.json
4. **If user gives feedback** — Update feedback-log.json with details
5. **If pattern is new** — Add to review-queue.json for next review cycle

## Success Metrics

Track these over time:

| Metric | Target | How to Measure |
|---|---|---|
| Trigger accuracy | >95% | % of queries that correctly trigger/skip |
| User acceptance rate | >85% | % of outputs accepted without modification |
| Anti-pattern detection | >90% | % of anti-patterns caught before user notices |
| Composition success rate | >80% | % of recommended compositions that work |
| Time to value | <30s | Time from query to useful output |

## Emergency Overrides

If the skill is consistently failing for a category of queries:

1. **Log the failure** — Add to feedback-log.json with severity: "critical"
2. **Add to review-queue.json** — Priority: "high"
3. **If pattern is clear** — Apply fix immediately without waiting for review cycle
4. **If pattern is unclear** — Run evals to understand the failure mode
5. **Update SKILL.md** — Add guidance for the failing category

## File Maintenance

- `feedback-log.json` — Append-only, rotate monthly (keep last 100 entries)
- `patterns-library.json` — Growing, deduplicate on review
- `review-queue.json` — Clear items after applying
- `version-history.json` — Append-only, never delete
