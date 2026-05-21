#!/bin/sh
set -e

echo "Waiting for database to be ready..."

if [ "$IS_CELERY_WORKER" != "1" ]; then
    echo "Running Alembic database migrations..."
    uv run alembic upgrade head
else
    echo "Starting Celery worker (skipping migrations)..."
fi

echo "Starting application..."
exec "$@"
