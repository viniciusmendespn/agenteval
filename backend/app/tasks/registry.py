from .executors import execute_run_core, execute_evaluation_core

TASK_REGISTRY: dict = {
    "execute_run": execute_run_core,
    "execute_evaluation": execute_evaluation_core,
}
