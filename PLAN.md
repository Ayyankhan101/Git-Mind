# Plan: Restyle Tab Components for Professional Dashboard Redesign

## Objective
Replace glassmorphism, gradient, and decorative CSS with clean, solid, professional styles using the new token system across 17 tab components.

## Token Mapping Clarification Needed
The user's token reference doesn't match existing CSS variables. Need clarification:

**User's tokens:**
- Backgrounds: `--bg`, `--surface`, `--elevated`, `--hover`
- Borders: `--border-s`, `--border-m`, `--border-h`
- Text: `--text-1`, `--text-2`, `--text-3`
- Accent: `--accent`, `--accent-hover`, `--accent-dim`

**Existing tokens in index.css:**
- Backgrounds: `--bg`, `--surface-0` through `--surface-4`, `--surface-hover`, `--surface-active`
- Borders: `--border`, `--border-2`, `--border-subtle`, `--border-default`, `--border-strong`, `--border-accent`, `--border-medium`
- Text: `--text-1`, `--text-2`, `--text-3` (already exist)
- Accent: `--primary`, `--primary-hover`, `--primary-dim`

**Questions:**
1. Should I use existing tokens or create new aliases?
2. What is the mapping for `--elevated`, `--hover`, `--border-s`, `--border-m`, `--border-h`?
3. Should `--accent` map to `--primary`?

## Files to Restyle (17 total)
1. SecurityTab.jsx
2. CodeAuditTab.jsx
3. PRReviewTab.jsx
4. CveTab.jsx
5. CrisisChat.jsx
6. DiagramTab.jsx
7. ChatTab.jsx
8. SummaryTab.jsx
9. GitAuditTab.jsx
10. SolidityTab.jsx
11. MonitoringTab.jsx
12. DocsTab.jsx
13. KeyboardHelp.jsx
14. FilePreviewDrawer.jsx
15. OrgAuditModal.jsx
16. CommandPalette.jsx
17. ToastSystem.jsx

## Approach
For each file:
1. Read the file
2. Identify all hardcoded colors (rgba, hex), glass effects (backdrop-filter), gradients
3. Replace with appropriate CSS variable references based on token mapping
4. Keep ALL functionality exactly the same
5. Write the updated file

## Changes to Make
- Replace `rgba(124,111,224,...)` with `var(--primary)` or `var(--accent)`
- Replace `rgba(34,197,94,...)` with `var(--success)`
- Replace `rgba(248,113,113,...)` with `var(--danger)`
- Replace `rgba(251,191,36,...)` with `var(--warning)`
- Replace `rgba(96,165,250,...)` with `var(--info)`
- Replace glass/gradient backgrounds with solid `var(--surface)` or `var(--elevated)`
- Remove `backdrop-filter` and `-webkit-backdrop-filter` properties
- Replace hardcoded hex colors with token references
- Keep severity border colors using border-left-color with severity tokens

## Verification
After each file edit, verify:
- No syntax errors
- All imports remain correct
- Functionality unchanged (only visual styles modified)
- CSS variables are properly referenced

## Dependencies
- Need clarification on token mapping before proceeding
- Must ensure new tokens are defined in CSS if they don't exist

## Questions for User
1. Should I use the existing CSS tokens from index.css or create new token aliases?
2. What is the mapping for `--elevated`, `--hover`, `--border-s`, `--border-m`, `--border-h`?
3. Should `--accent` map to `--primary`?
4. Should I add these new tokens to index.css or use existing ones?