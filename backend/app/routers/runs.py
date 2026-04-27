from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Agent, EvaluationProfile, TestCase, TestRun, TestResult, Evaluation
from ..schemas import TestRunCreate, TestRunOut
from ..queue import get_task_queue
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/runs", tags=["runs"])


def _enrich_run(run: TestRun, db: Session) -> dict:
    data = {c.name: getattr(run, c.name) for c in TestRun.__table__.columns}
    agent = db.get(Agent, run.agent_id)
    profile = db.get(EvaluationProfile, run.profile_id)
    data["agent_name"] = agent.name if agent else None
    data["profile_name"] = profile.name if profile else None

    # Deduplica: mantém apenas o resultado mais recente (maior id) por test_case_id
    latest: dict[int, TestResult] = {}
    for r in sorted(run.results, key=lambda x: x.id):
        latest[r.test_case_id] = r
    deduped = list(latest.values())
    data["results"] = deduped
    data["error_count"] = sum(1 for r in deduped if r.error)
    return data


@router.get("/", response_model=list[TestRunOut])
def list_runs(db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    runs = (
        db.query(TestRun)
        .filter(TestRun.workspace_id == workspace.workspace_id)
        .order_by(TestRun.created_at.desc())
        .all()
    )
    return [_enrich_run(r, db) for r in runs]


@router.get("/{run_id}", response_model=TestRunOut)
def get_run(run_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.workspace_id == workspace.workspace_id).first()
    if not run:
        raise HTTPException(404, "Execução não encontrada")
    return _enrich_run(run, db)


@router.post("/{run_id}/cancel", status_code=200)
def cancel_run(run_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.workspace_id == workspace.workspace_id).first()
    if not run:
        raise HTTPException(404, "Execução não encontrada")
    if run.status != "running":
        raise HTTPException(400, f"Execução não está em andamento (status: {run.status})")
    get_task_queue().cancel(run.task_id or "")
    run.status = "cancelled"
    db.commit()
    ev = db.query(Evaluation).filter(Evaluation.source_run_id == run_id).first()
    if ev:
        ev.status = "cancelled"
        db.commit()
    return {"ok": True, "message": "Cancelamento solicitado."}


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.workspace_id == workspace.workspace_id).first()
    if not run:
        raise HTTPException(404, "Execução não encontrada")
    db.query(Evaluation).filter(Evaluation.source_run_id == run_id).delete()
    db.query(TestResult).filter(TestResult.run_id == run_id).delete()
    db.delete(run)
    db.commit()


@router.post("/", response_model=TestRunOut, status_code=201)
def create_run(
    data: TestRunCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == data.agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    profile = db.query(EvaluationProfile).filter(
        EvaluationProfile.id == data.profile_id,
        EvaluationProfile.workspace_id == workspace.workspace_id,
    ).first()
    if not profile:
        raise HTTPException(404, "Perfil de avaliação não encontrado")

    test_cases = db.query(TestCase).filter(
        TestCase.id.in_(data.test_case_ids),
        TestCase.workspace_id == workspace.workspace_id,
    ).all()
    if len(test_cases) != len(set(data.test_case_ids)):
        raise HTTPException(400, "Um ou mais casos de teste nÃ£o existem neste workspace")

    from ..tasks.executors import _agent_metadata_snapshot
    metadata_snapshot = _agent_metadata_snapshot(agent)

    run = TestRun(
        name=data.name,
        agent_id=data.agent_id,
        profile_id=data.profile_id,
        test_case_ids=data.test_case_ids,
        status="running",
        workspace_id=workspace.workspace_id,
        agent_metadata_snapshot=metadata_snapshot,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    task_id = get_task_queue().enqueue("execute_run", {"run_id": run.id})
    run.task_id = task_id
    db.commit()

    # Cria espelho na tabela unificada de avaliações
    unified = Evaluation(
        workspace_id=workspace.workspace_id,
        name=data.name,
        profile_id=data.profile_id,
        eval_type="run",
        source_run_id=run.id,
        agent_id=data.agent_id,
        status="running",
        created_at=run.created_at,
    )
    db.add(unified)
    db.commit()

    return _enrich_run(run, db)
