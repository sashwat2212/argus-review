from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from argus_api.config import settings
from argus_api.database import init_db
from argus_api.limiter import limiter
from argus_api.logger import setup_logging
from argus_api.routers.analytics import router as analytics_router
from argus_api.routers.auth import router as auth_router
from argus_api.routers.health import router as health_router
from argus_api.routers.repositories import router as repos_router
from argus_api.routers.reviews import router as reviews_router
from argus_api.routers.webhooks import router as webhooks_router

# Setup structlog
is_prod = os.environ.get("ENV", "development") == "production"
setup_logging(json_logs=is_prod)
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Initializing database...")
    await init_db()
    logger.info("Application startup complete.")
    yield
    logger.info("Application shutdown.")


app = FastAPI(title="Argus API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(webhooks_router)
app.include_router(reviews_router)
app.include_router(repos_router)
app.include_router(analytics_router)

# Instrument the FastAPI app for Prometheus metrics
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
