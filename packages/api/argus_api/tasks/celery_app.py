import os

from celery import Celery
from celery.signals import setup_logging as celery_setup_logging

from argus_api.config import settings
from argus_api.logger import setup_logging


@celery_setup_logging.connect
def config_loggers(*args, **kwds):
    is_prod = os.environ.get("ENV", "development") == "production"
    setup_logging(json_logs=is_prod)


celery_app = Celery(
    "argus",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["argus_api.tasks.review_task"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

from celery.signals import worker_ready
from argus_api.worker_health import start_health_server

@worker_ready.connect
def start_health_endpoint(**kwargs):
    # Render provides a PORT environment variable, defaulting to 10000
    port = int(os.environ.get("PORT", 10000))
    start_health_server(port)
