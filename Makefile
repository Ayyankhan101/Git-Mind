.PHONY: dev prod stop stop-prod restart restart-prod status logs logs-prod build build-prod clean start bare-stop bare-restart smoke smoke-frontend

# ── Docker shortcuts ───────────────────────────────────────────────────────────
dev:
	./gitmind.sh start dev

prod:
	./gitmind.sh start prod

stop:
	./gitmind.sh stop dev

stop-prod:
	./gitmind.sh stop prod

restart:
	./gitmind.sh restart dev

restart-prod:
	./gitmind.sh restart prod

status:
	./gitmind.sh status dev

logs:
	./gitmind.sh logs dev

logs-prod:
	./gitmind.sh logs prod

build:
	./gitmind.sh build dev

build-prod:
	./gitmind.sh build prod

clean:
	./gitmind.sh clean dev

# ── Bare-metal shortcuts ───────────────────────────────────────────────────────
start:
	./start.sh

bare-stop:
	./stop.sh

bare-restart:
	./stop.sh restart

# ── Dev tooling ────────────────────────────────────────────────────────────────
smoke:
	cd backend && venv/bin/python3 smoke_test.py

smoke-frontend:
	cd frontend && python3 e2e/smoke_test.py --browser auto
