FROM python:3.11-slim

WORKDIR /app

RUN pip install uv --no-cache-dir

COPY pyproject.toml .
COPY packages/core/pyproject.toml packages/core/
COPY packages/api/pyproject.toml packages/api/

RUN uv sync --no-dev --package argus-api

COPY packages/core packages/core
COPY packages/api packages/api

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "argus_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
