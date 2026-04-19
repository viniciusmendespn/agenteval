from abc import ABC, abstractmethod


class TaskQueue(ABC):
    @abstractmethod
    def enqueue(self, task_name: str, payload: dict) -> str:
        """Enfileira a task e retorna um task_id opaco."""
        ...

    @abstractmethod
    def cancel(self, task_id: str) -> None:
        """Tenta cancelar. Não lança exceção se já concluída."""
        ...
