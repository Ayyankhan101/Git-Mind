## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Health Stack

- typecheck: mypy backend (needs a Python 3.11 venv — local interpreter is 3.13, mypy's numpy stubs need 3.11)
- lint: ruff check . && ruff format --check . && mypy . --ignore-missing-imports (backend/); npx prettier --check "src/**/*.{js,jsx,ts,tsx,css,json}" (frontend/) — CI's `lint` job runs both; forgetting the frontend prettier check has broken CI at least once
- test: pytest (backend/), react-scripts test --coverage --watchAll=false (frontend/)
- deadcode: skipped — knip not installed
- shell: shellcheck gitmind.sh start.sh stop.sh scripts/*.sh
- gbrain: skipped — not installed
