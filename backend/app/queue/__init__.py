import os
from .base import TaskQueue


def get_task_queue() -> TaskQueue:
    backend = os.getenv("TASK_QUEUE_BACKEND", "inprocess")
    if backend == "celery":
        from .celery_queue import CeleryTaskQueue   # criar quando precisar
        return CeleryTaskQueue()
    if backend == "sqs":
        from .sqs_queue import SQSTaskQueue         # criar quando precisar
        return SQSTaskQueue()
    from .inprocess import InProcessTaskQueue
    return InProcessTaskQueue()
