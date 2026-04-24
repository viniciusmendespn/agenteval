from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    Agent, Dataset, EvaluationProfile, Evaluation,
    TestResult, TestCase, DatasetResult, DatasetRecord,
)
from ..services.evaluator import LOWER_IS_BETTER
from ..workspace import WorkspaceContext, get_current_workspace

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


def _enrich(ev: Evaluation, agent_names: dict, dataset_names: dict, profile_names: dict) -> dict:
    return {
        "id": ev.id,
        "eval_type": ev.eval_type,
        "agent_id": ev.agent_id,
        "agent_name": agent_names.get(ev.agent_id) if ev.agent_id else None,
        "dataset_id": ev.dataset_id,
        "dataset_name": dataset_names.get(ev.dataset_id) if ev.dataset_id else None,
        "profile_id": ev.profile_id,
        "profile_name": profile_names.get(ev.profile_id),
        "source_run_id": ev.source_run_id,
        "source_eval_id": ev.source_eval_id,
        "status": ev.status,
        "overall_score": ev.overall_score,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
        "completed_at": ev.completed_at.isoformat() if ev.completed_at else None,
    }


@router.get("/")
def list_evaluations(
    eval_type: Optional[str] = None,
    agent_id: Optional[int] = None,
    dataset_id: Optional[int] = None,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    q = db.query(Evaluation).filter(Evaluation.workspace_id == workspace.workspace_id)
    if eval_type:
        q = q.filter(Evaluation.eval_type == eval_type)
    if agent_id:
        q = q.filter(Evaluation.agent_id == agent_id)
    if dataset_id:
        q = q.filter(Evaluation.dataset_id == dataset_id)
    evals = q.order_by(Evaluation.created_at.desc()).all()

    agent_names = {a.id: a.name for a in db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()}
    dataset_names = {d.id: d.name for d in db.query(Dataset).filter(Dataset.workspace_id == workspace.workspace_id).all()}
    profile_names = {p.id: p.name for p in db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace.workspace_id).all()}

    return [_enrich(ev, agent_names, dataset_names, profile_names) for ev in evals]


@router.get("/{eval_id}")
def get_evaluation(
    eval_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    ev = db.query(Evaluation).filter(
        Evaluation.id == eval_id,
        Evaluation.workspace_id == workspace.workspace_id,
    ).first()
    if not ev:
        raise HTTPException(404, "Avaliação não encontrada")

    agent_names = {a.id: a.name for a in db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()}
    dataset_names = {d.id: d.name for d in db.query(Dataset).filter(Dataset.workspace_id == workspace.workspace_id).all()}
    profile_names = {p.id: p.name for p in db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace.workspace_id).all()}

    return _enrich(ev, agent_names, dataset_names, profile_names)


@router.post("/compare")
def compare_evaluations(
    body: dict,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Compara duas avaliações (qualquer tipo). Item-level se mesmo tipo, métrica-only se cross-type."""
    eval_id_a = body.get("eval_id_a")
    eval_id_b = body.get("eval_id_b")

    ev_a = db.query(Evaluation).filter(
        Evaluation.id == eval_id_a, Evaluation.workspace_id == workspace.workspace_id
    ).first()
    ev_b = db.query(Evaluation).filter(
        Evaluation.id == eval_id_b, Evaluation.workspace_id == workspace.workspace_id
    ).first()
    if not ev_a or not ev_b:
        raise HTTPException(404, "Uma ou ambas avaliações não encontradas")

    def get_results(ev: Evaluation):
        if ev.eval_type == "run":
            rows = db.query(TestResult).filter(TestResult.run_id == ev.source_run_id).all()
            return {r.test_case_id: r for r in rows}
        else:
            rows = db.query(DatasetResult).filter(DatasetResult.evaluation_id == ev.source_eval_id).all()
            return {r.record_id: r for r in rows}

    results_a = get_results(ev_a)
    results_b = get_results(ev_b)

    # Comparação de métricas (sempre disponível)
    all_metrics: set[str] = set()
    for r in list(results_a.values()) + list(results_b.values()):
        all_metrics.update((r.scores or {}).keys())

    metric_comparison = []
    for metric in sorted(all_metrics):
        scores_a = [r.scores[metric] for r in results_a.values() if r.scores and metric in r.scores]
        scores_b = [r.scores[metric] for r in results_b.values() if r.scores and metric in r.scores]
        avg_a = sum(scores_a) / len(scores_a) if scores_a else None
        avg_b = sum(scores_b) / len(scores_b) if scores_b else None
        delta = round(avg_b - avg_a, 4) if avg_a is not None and avg_b is not None else None
        metric_comparison.append({
            "metric": metric,
            "score_a": round(avg_a, 4) if avg_a is not None else None,
            "score_b": round(avg_b, 4) if avg_b is not None else None,
            "delta": delta,
        })

    # Comparação por item (apenas quando mesmo tipo)
    can_compare_items = ev_a.eval_type == ev_b.eval_type
    items = []
    if can_compare_items:
        all_item_ids = set(results_a.keys()) | set(results_b.keys())
        for item_id in sorted(all_item_ids):
            ra = results_a.get(item_id)
            rb = results_b.get(item_id)
            status_a = ("passed" if ra.passed else "failed") if ra else "missing"
            status_b = ("passed" if rb.passed else "failed") if rb else "missing"

            if ev_a.eval_type == "run":
                tc = db.get(TestCase, item_id)
                label = tc.title if tc else f"Caso #{item_id}"
                input_preview = (tc.input[:120] if tc else "")
            else:
                rec = db.get(DatasetRecord, item_id)
                label = f"Registro #{item_id}"
                input_preview = (rec.input[:120] + "...") if rec and len(rec.input) > 120 else (rec.input or "")

            items.append({
                "item_id": item_id,
                "label": label,
                "input_preview": input_preview,
                "status_a": status_a,
                "status_b": status_b,
                "regression": status_a == "passed" and status_b == "failed",
                "improvement": status_a == "failed" and status_b == "passed",
                "scores_a": ra.scores if ra else {},
                "scores_b": rb.scores if rb else {},
            })

    def ev_info(ev: Evaluation, results: dict) -> dict:
        if ev.eval_type == "run":
            agent = db.get(Agent, ev.agent_id) if ev.agent_id else None
            name = agent.name if agent else f"Agente #{ev.agent_id}"
        else:
            dataset = db.get(Dataset, ev.dataset_id) if ev.dataset_id else None
            name = dataset.name if dataset else f"Dataset #{ev.dataset_id}"
        profile = db.get(EvaluationProfile, ev.profile_id)
        return {
            "id": ev.id,
            "eval_type": ev.eval_type,
            "name": name,
            "profile_name": profile.name if profile else f"Perfil #{ev.profile_id}",
            "score": ev.overall_score,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "total_items": len(results),
        }

    return {
        "eval_a": ev_info(ev_a, results_a),
        "eval_b": ev_info(ev_b, results_b),
        "metric_comparison": metric_comparison,
        "items": items if can_compare_items else None,
        "can_compare_items": can_compare_items,
        "summary": {
            "regressions": sum(1 for i in items if i["regression"]),
            "improvements": sum(1 for i in items if i["improvement"]),
            "unchanged": sum(1 for i in items if not i["regression"] and not i["improvement"]),
            "score_delta": round(
                (ev_b.overall_score or 0) - (ev_a.overall_score or 0), 4
            ) if ev_a.overall_score is not None and ev_b.overall_score is not None else None,
        },
    }
