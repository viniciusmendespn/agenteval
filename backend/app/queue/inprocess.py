from concurrent.futures import ThreadPoolExecutor
from .base import TaskQueue


class InProcessTaskQueue(TaskQueue):
    _pool = ThreadPoolExecutor(max_workers=4)

    def enqueue(self, task_name: str, payload: dict) -> str:
        from app.tasks.registry import TASK_REGISTRY
        fn = TASK_REGISTRY[task_name]
        future = self._pool.submit(fn, **payload)
        return str(id(future))

    def cancel(self, task_id: str) -> None:
        # Threads não são canceláveis — cancela via status no DB (cheque no loop do executor)
        pass
