#!/bin/bash

PORTS=(8002 80 3002)

echo "Checking for occupied ports..."

for PORT in "${PORTS[@]}"; do
    if lsof -i :$PORT >/dev/null 2>&1; then
        echo "Port $PORT in use. Killing process..."
        lsof -i :$PORT | awk 'NR>1 {print $2}' | xargs -r kill -9
        echo "Port $PORT freed."
    else
        echo "Port $PORT free."
    fi
done

if [ "$1" = "dev" ]; then
    echo "Starting development mode..."
    docker compose -f docker-compose.dev.yml up
else
    echo "Starting production mode..."
    docker compose up
fi