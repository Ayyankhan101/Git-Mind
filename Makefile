.PHONY: up dev build logs restart ps down clean

up:
	@echo "Checking ports..."
	@for port in 8002 80 3002; do \
		if lsof -i :$$port >/dev/null 2>&1; then \
			echo "Killing process on port $$port"; \
			lsof -ti :$$port | xargs -r kill -9; \
		fi; \
	done
	docker compose up

dev:
	@echo "Checking ports..."
	@for port in 8002 80 3002; do \
		if lsof -i :$$port >/dev/null 2>&1; then \
			echo "Killing process on port $$port"; \
			lsof -ti :$$port | xargs -r kill -9; \
		fi; \
	done
	docker compose -f docker-compose.dev.yml up

build:
	docker compose build
	docker compose -f docker-compose.dev.yml build

logs:
	docker compose logs -f
	docker compose -f docker-compose.dev.yml logs -f

restart:
	docker compose restart
	docker compose -f docker-compose.dev.yml restart

ps:
	docker compose ps
	docker compose -f docker-compose.dev.yml ps

down:
	docker compose down
	docker compose -f docker-compose.dev.yml down

clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	docker system prune -f