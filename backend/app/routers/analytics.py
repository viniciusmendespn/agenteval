from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import (
    Agent, TestCase, TestRun, TestResult,
    Dataset, DatasetEvaluation, DatasetResult, DatasetRecord,
    EvaluationProfile,
)
from ..services.evaluator import LOWER_IS_BETTER
from ..workspace import WorkspaceContext, get_current_workspace

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dataset-evaluations")
def list_all_dataset_evaluations(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Lista todas as avaliações de dataset de todos os datasets."""
    evs = (
        db.query(DatasetEvaluation)
        .filter(DatasetEvaluation.workspace_id == workspace.workspace_id)
        .order_by(DatasetEvaluation.created_at.desc())
        .all()
    )
    dataset_names = {
        d.id: d.name
        for d in db.query(Dataset).filter(Dataset.workspace_id == workspace.workspace_id).all()
    }
    profile_names = {
        p.id: p.name
        for p in db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace.workspace_id).all()
    }

    return [
        {
            "id": ev.id,
            "dataset_id": ev.dataset_id,
            "dataset_name": dataset_names.get(ev.dataset_id, f"Dataset #{ev.dataset_id}"),
            "profile_id": ev.profile_id,
            "profile_name": profile_names.get(ev.profile_id, f"Perfil #{ev.profile_id}"),
            "status": ev.status,
            "overall_score": ev.overall_score,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "completed_at": ev.completed_at.isoformat() if ev.completed_at else None,
        }
        for ev in evs
    ]


@router.get("/overview")
def get_overview(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Resumo geral do sistema: totais, tendência de score e runs recentes."""
    totals = {
        "agents": db.query(func.count(Agent.id)).filter(Agent.workspace_id == workspace.workspace_id).scalar(),
        "test_cases": db.query(func.count(TestCase.id)).filter(TestCase.workspace_id == workspace.workspace_id).scalar(),
        "runs": db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace.workspace_id).scalar(),
        "datasets": db.query(func.count(Dataset.id)).filter(Dataset.workspace_id == workspace.workspace_id).scalar(),
    }

    completed_runs = (
        db.query(TestRun)
        .filter(
            TestRun.workspace_id == workspace.workspace_id,
            TestRun.status == "completed",
            TestRun.overall_score.isnot(None),
        )
        .order_by(TestRun.created_at.desc())
        .all()
    )

    avg_score = None
    pass_rate = None
    if completed_runs:
        scores = [r.overall_score for r in completed_runs if r.overall_score is not None]
        avg_score = round(sum(scores) / len(scores), 4) if scores else None

        # Taxa de aprovação baseada nos resultados individuais
        run_ids = [r.id for r in completed_runs]
        total_results = db.query(func.count(TestResult.id)).filter(TestResult.run_id.in_(run_ids)).scalar() or 0
        passed_results = db.query(func.count(TestResult.id)).filter(
            TestResult.run_id.in_(run_ids),
            TestResult.passed == True,
        ).scalar() or 0
        pass_rate = round(passed_results / total_results, 4) if total_results > 0 else None

    runs_by_status = {
        "completed": db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace.workspace_id, TestRun.status == "completed").scalar(),
        "running": db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace.workspace_id, TestRun.status == "running").scalar(),
        "failed": db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace.workspace_id, TestRun.status == "failed").scalar(),
        "pending": db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace.workspace_id, TestRun.status == "pending").scalar(),
    }

    # Tendência: últimas 15 execuções concluídas
    score_trend = [
        {
            "run_id": r.id,
            "score": r.overall_score,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reversed(completed_runs[:15])
    ]

    # Últimas 5 runs (qualquer status)
    recent_runs_raw = (
        db.query(TestRun)
        .filter(TestRun.workspace_id == workspace.workspace_id)
        .order_by(TestRun.created_at.desc())
        .limit(5)
        .all()
    )
    agent_names = {
        a.id: a.name
        for a in db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()
    }
    recent_runs = [
        {
            "id": r.id,
            "agent_name": agent_names.get(r.agent_id, f"Agente #{r.agent_id}"),
            "score": r.overall_score,
            "status": r.status,
            "cases": len(r.test_case_ids) if r.test_case_ids else 0,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent_runs_raw
    ]

    return {
        "totals": totals,
        "avg_score": avg_score,
        "pass_rate": pass_rate,
        "runs_by_status": runs_by_status,
        "score_trend": score_trend,
        "recent_runs": recent_runs,
    }


@router.get("/runs/{run_id}/breakdown")
def get_run_breakdown(
    run_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Breakdown detalhado de uma execução por métrica."""
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.workspace_id == workspace.workspace_id).first()
    if not run:
        raise HTTPException(404, "Execução não encontrada")

    results = db.query(TestResult).filter(TestResult.run_id == run_id).all()

    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    # Agregar scores por métrica
    metric_data: dict[str, list[float]] = {}
    for result in results:
        for metric_name, score in (result.scores or {}).items():
            metric_data.setdefault(metric_name, []).append(score)

    metric_breakdown = {}
    for metric_name, metric_scores in metric_data.items():
        avg = sum(metric_scores) / len(metric_scores) if metric_scores else 0
        if metric_name in LOWER_IS_BETTER:
            passed_count = sum(1 for s in metric_scores if s <= 0.5)
        else:
            passed_count = sum(1 for s in metric_scores if s >= 0.5)
        metric_breakdown[metric_name] = {
            "avg": round(avg, 4),
            "min": round(min(metric_scores), 4),
            "max": round(max(metric_scores), 4),
            "passed_count": passed_count,
            "total_count": len(metric_scores),
        }

    return {
        "run_id": run_id,
        "overall_score": run.overall_score,
        "total": total,
        "passed": passed,
        "failed": failed,
        "metric_breakdown": metric_breakdown,
    }


@router.post("/runs/compare")
def compare_runs(
    body: dict,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Compara duas execuções — identifica regressões e melhorias."""
    run_id_a = body.get("run_id_a")
    run_id_b = body.get("run_id_b")

    run_a = db.query(TestRun).filter(TestRun.id == run_id_a, TestRun.workspace_id == workspace.workspace_id).first()
    run_b = db.query(TestRun).filter(TestRun.id == run_id_b, TestRun.workspace_id == workspace.workspace_id).first()

    if not run_a or not run_b:
        raise HTTPException(404, "Uma ou ambas execuções não encontradas")

    agent_names = {
        a.id: a.name
        for a in db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()
    }

    results_a = {r.test_case_id: r for r in db.query(TestResult).filter(TestResult.run_id == run_id_a).all()}
    results_b = {r.test_case_id: r for r in db.query(TestResult).filter(TestResult.run_id == run_id_b).all()}

    # Métricas em comum
    all_metrics: set[str] = set()
    for r in list(results_a.values()) + list(results_b.values()):
        all_metrics.update((r.scores or {}).keys())

    metric_comparison = []
    for metric in sorted(all_metrics):
        scores_a = [r.scores.get(metric) for r in results_a.values() if r.scores and metric in r.scores]
        scores_b = [r.scores.get(metric) for r in results_b.values() if r.scores and metric in r.scores]
        avg_a = sum(scores_a) / len(scores_a) if scores_a else None
        avg_b = sum(scores_b) / len(scores_b) if scores_b else None
        delta = round(avg_b - avg_a, 4) if (avg_a is not None and avg_b is not None) else None
        metric_comparison.append({
            "metric": metric,
            "score_a": round(avg_a, 4) if avg_a is not None else None,
            "score_b": round(avg_b, 4) if avg_b is not None else None,
            "delta": delta,
        })

    # Casos em comum
    tc_ids = set(results_a.keys()) | set(results_b.keys())
    tc_map = {
        tc.id: tc.title
        for tc in db.query(TestCase).filter(
            TestCase.id.in_(tc_ids),
            TestCase.workspace_id == workspace.workspace_id,
        ).all()
    }

    cases = []
    for tc_id in sorted(tc_ids):
        ra = results_a.get(tc_id)
        rb = results_b.get(tc_id)
        status_a = ("passed" if ra.passed else "failed") if ra else "missing"
        status_b = ("passed" if rb.passed else "failed") if rb else "missing"
        regression  = status_a == "passed" and status_b == "failed"
        improvement = status_a == "failed" and status_b == "passed"
        cases.append({
            "test_case_id": tc_id,
            "title": tc_map.get(tc_id, f"Caso #{tc_id}"),
            "status_a": status_a,
            "status_b": status_b,
            "regression": regression,
            "improvement": improvement,
            "scores_a": ra.scores if ra else {},
            "scores_b": rb.scores if rb else {},
        })

    return {
        "run_a": {
            "id": run_a.id,
            "agent_name": agent_names.get(run_a.agent_id, f"Agente #{run_a.agent_id}"),
            "score": run_a.overall_score,
            "created_at": run_a.created_at.isoformat() if run_a.created_at else None,
            "total_cases": len(run_a.test_case_ids or []),
        },
        "run_b": {
            "id": run_b.id,
            "agent_name": agent_names.get(run_b.agent_id, f"Agente #{run_b.agent_id}"),
            "score": run_b.overall_score,
            "created_at": run_b.created_at.isoformat() if run_b.created_at else None,
            "total_cases": len(run_b.test_case_ids or []),
        },
        "metric_comparison": metric_comparison,
        "cases": cases,
        "summary": {
            "regressions": sum(1 for c in cases if c["regression"]),
            "improvements": sum(1 for c in cases if c["improvement"]),
            "unchanged": sum(1 for c in cases if not c["regression"] and not c["improvement"]),
            "score_delta": round(
                (run_b.overall_score or 0) - (run_a.overall_score or 0), 4
            ) if run_a.overall_score is not None and run_b.overall_score is not None else None,
        },
    }


@router.get("/timeline/agents/{agent_id}")
def agent_timeline(
    agent_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Timeline de evolução de um agente: todos os runs completos com breakdown de métricas."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    runs = (
        db.query(TestRun)
        .filter(
            TestRun.workspace_id == workspace.workspace_id,
            TestRun.agent_id == agent_id,
            TestRun.status == "completed",
        )
        .order_by(TestRun.created_at.asc())
        .all()
    )

    points = []
    for run in runs:
        results = db.query(TestResult).filter(TestResult.run_id == run.id).all()
        metric_avgs: dict[str, float] = {}
        for result in results:
            for metric_name, score in (result.scores or {}).items():
                metric_avgs.setdefault(metric_name, []).append(score)

        metrics = {}
        for metric_name, scores_list in metric_avgs.items():
            raw_avg = sum(scores_list) / len(scores_list)
            # Normalizar: inverter lower-is-better para que 1.0 = ótimo
            if metric_name in LOWER_IS_BETTER:
                metrics[metric_name] = round(1.0 - raw_avg, 4)
            else:
                metrics[metric_name] = round(raw_avg, 4)

        total = len(results)
        passed = sum(1 for r in results if r.passed)

        points.append({
            "id": run.id,
            "type": "run",
            "date": run.created_at.isoformat() if run.created_at else None,
            "overall_score": run.overall_score,
            "metrics": metrics,
            "total": total,
            "passed": passed,
            "profile_id": run.profile_id,
        })

    profile_names = {
        p.id: p.name
        for p in db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace.workspace_id).all()
    }

    return {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "points": points,
        "profile_names": profile_names,
    }


@router.get("/timeline/datasets/{dataset_id}")
def dataset_timeline(
    dataset_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Timeline de evolução de um dataset: todas as avaliações completas com breakdown de métricas."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")

    evals = (
        db.query(DatasetEvaluation)
        .filter(
            DatasetEvaluation.workspace_id == workspace.workspace_id,
            DatasetEvaluation.dataset_id == dataset_id,
            DatasetEvaluation.status == "completed",
        )
        .order_by(DatasetEvaluation.created_at.asc())
        .all()
    )

    points = []
    for ev in evals:
        results = db.query(DatasetResult).filter(DatasetResult.evaluation_id == ev.id).all()
        metric_avgs: dict[str, list] = {}
        for result in results:
            for metric_name, score in (result.scores or {}).items():
                metric_avgs.setdefault(metric_name, []).append(score)

        metrics = {}
        for metric_name, scores_list in metric_avgs.items():
            raw_avg = sum(scores_list) / len(scores_list)
            if metric_name in LOWER_IS_BETTER:
                metrics[metric_name] = round(1.0 - raw_avg, 4)
            else:
                metrics[metric_name] = round(raw_avg, 4)

        total = len(results)
        passed = sum(1 for r in results if r.passed)

        points.append({
            "id": ev.id,
            "type": "dataset_eval",
            "date": ev.created_at.isoformat() if ev.created_at else None,
            "overall_score": ev.overall_score,
            "metrics": metrics,
            "total": total,
            "passed": passed,
            "profile_id": ev.profile_id,
        })

    profile_names = {
        p.id: p.name
        for p in db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace.workspace_id).all()
    }

    return {
        "dataset_id": dataset_id,
        "dataset_name": ds.name,
        "points": points,
        "profile_names": profile_names,
    }
