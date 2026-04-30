FROM python:3.11-slim

WORKDIR /app

RUN pip install uv --no-cache-dir

COPY pyproject.toml .
COPY packages/core/pyproject.toml packages/core/
COPY packages/api/pyproject.toml packages/api/
COPY packages/api/alembic.ini .
COPY packages/api/alembic alembic

RUN uv sync --no-dev

COPY packages/core packages/core
COPY packages/api packages/api

ENV PYTHONPATH=/app:/app/packages/core:/app/packages/api
ENV PYTHONUNBUFFERED=1
ENV VIRTUAL_ENV=/app/.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "argus_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-reload"]
