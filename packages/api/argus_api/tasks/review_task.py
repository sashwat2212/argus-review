# Review task placeholder
from argus_api.tasks.celery_app import celery_app

@celery_app.task
def run_review_task(**kwargs):
    pass
