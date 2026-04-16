import time
import uuid
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Agent, EvaluationProfile, TestCase, TestRun, TestResult
from ..schemas import TestRunCreate, TestRunOut
from ..services.agent_caller import call_agent
from ..services.evaluator import evaluate_response, compute_passed, LOWER_IS_BETTER
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/runs", tags=["runs"])

# IDs de runs solicitadas para cancelamento (thread-safe via GIL para set ops)
_CANCEL_REQUESTS: set[int] = set()


def _enrich_run(run: TestRun, db: Session) -> dict:
    data = {c.name: getattr(run, c.name) for c in TestRun.__table__.columns}
    agent = db.get(Agent, run.agent_id)
    profile = db.get(EvaluationProfile, run.profile_id)
    data["agent_name"] = agent.name if agent else None
    data["profile_name"] = profile.name if profile else None
    data["results"] = run.results
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
    _CANCEL_REQUESTS.add(run_id)
    return {"ok": True, "message": "Cancelamento solicitado."}


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.workspace_id == workspace.workspace_id).first()
    if not run:
        raise HTTPException(404, "Execução não encontrada")
    db.query(TestResult).filter(TestResult.run_id == run_id).delete()
    db.delete(run)
    db.commit()


@router.post("/", response_model=TestRunOut, status_code=201)
def create_run(
    data: TestRunCreate,
    background_tasks: BackgroundTasks,
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

    run = TestRun(
        agent_id=data.agent_id,
        profile_id=data.profile_id,
        test_case_ids=data.test_case_ids,
        status="running",
        workspace_id=workspace.workspace_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(_execute_run, run.id)
    return run


def _execute_run(run_id: int):
    db: Session = SessionLocal()
    try:
        run = db.get(TestRun, run_id)
        agent = db.get(Agent, run.agent_id)
        profile = db.get(EvaluationProfile, run.profile_id)
        test_cases = db.query(TestCase).filter(TestCase.id.in_(run.test_case_ids)).all()
        tc_map = {tc.id: tc for tc in test_cases}
        ordered = [tc_map[i] for i in run.test_case_ids if i in tc_map]

        all_scores: list[float] = []
        cancelled = False
        for tc in ordered:
            if run_id in _CANCEL_REQUESTS:
                _CANCEL_REQUESTS.discard(run_id)
                cancelled = True
                break
            result = _evaluate_case(run_id, tc, agent, profile)
            if result.scores:
                for metric_name, score in result.scores.items():
                    normalized = (1.0 - score) if metric_name in LOWER_IS_BETTER else score
                    all_scores.append(normalized)
            db.add(result)
            db.commit()

        run.status = "cancelled" if cancelled else "completed"
        run.overall_score = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
        run.completed_at = datetime.utcnow()
        db.commit()

    except Exception:
        try:
            run = db.get(TestRun, run_id)
            if run:
                run.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _build_thresholds(profile: EvaluationProfile) -> dict:
    return {
        "relevancy":      profile.relevancy_threshold,
        "hallucination":  profile.hallucination_threshold,
        "toxicity":       getattr(profile, "toxicity_threshold", 0.5),
        "bias":           getattr(profile, "bias_threshold", 0.5),
        "faithfulness":   getattr(profile, "faithfulness_threshold", 0.5),
        "latency":        0.5,
        "non_advice":     getattr(profile, "non_advice_threshold", 0.5),
        "role_violation": getattr(profile, "role_violation_threshold", 0.5),
        **{f"criterion_{i}": 0.5 for i in range(len(profile.criteria or []))},
    }


def _call_evaluate(input_text, actual_output, expected_output, context, response_time_ms, profile):
    return evaluate_response(
        input_text=input_text,
        actual_output=actual_output,
        expected_output=expected_output,
        context=context,
        response_time_ms=response_time_ms,
        use_relevancy=profile.use_relevancy,
        relevancy_threshold=profile.relevancy_threshold,
        use_hallucination=profile.use_hallucination,
        hallucination_threshold=profile.hallucination_threshold,
        use_toxicity=getattr(profile, "use_toxicity", False),
        toxicity_threshold=getattr(profile, "toxicity_threshold", 0.5),
        use_bias=getattr(profile, "use_bias", False),
        bias_threshold=getattr(profile, "bias_threshold", 0.5),
        use_faithfulness=getattr(profile, "use_faithfulness", False),
        faithfulness_threshold=getattr(profile, "faithfulness_threshold", 0.5),
        use_latency=getattr(profile, "use_latency", False),
        latency_threshold_ms=getattr(profile, "latency_threshold_ms", 5000),
        criteria=profile.criteria or [],
        use_non_advice=getattr(profile, "use_non_advice", False),
        non_advice_threshold=getattr(profile, "non_advice_threshold", 0.5),
        non_advice_types=getattr(profile, "non_advice_types", None) or [],
        use_role_violation=getattr(profile, "use_role_violation", False),
        role_violation_threshold=getattr(profile, "role_violation_threshold", 0.5),
        role_violation_role=getattr(profile, "role_violation_role", None) or "",
    )


def _evaluate_case(run_id: int, tc: TestCase, agent: Agent, profile: EvaluationProfile) -> TestResult:
    session_id = str(uuid.uuid4())
    turns = tc.turns if (tc.turns and len(tc.turns) > 0) else None

    try:
        if turns is None:
            # ── Single-turn (comportamento atual preservado) ──
            t0 = time.time()
            actual_output = call_agent(
                url=agent.url,
                api_key=agent.api_key,
                message=tc.input,
                request_body=agent.request_body or '{"message": "{{message}}"}',
                output_field=agent.output_field,
                connection_type=agent.connection_type,
                session_id=session_id,
                variables=tc.variables or {},
                token_url=getattr(agent, "token_url", None),
                token_request_body=getattr(agent, "token_request_body", None),
                token_output_field=getattr(agent, "token_output_field", None),
                token_header_name=getattr(agent, "token_header_name", None),
            )
            response_time_ms = (time.time() - t0) * 1000
            scores, reasons = _call_evaluate(tc.input, actual_output, tc.expected_output, tc.context, response_time_ms, profile)
            thresholds = _build_thresholds(profile)
            passed = compute_passed(scores, thresholds) if scores else True
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=actual_output,
                              scores=scores, reasons=reasons, passed=passed, turns_executed=1)
        else:
            # ── Multi-turn: cada turno envia o mesmo session_id ao agente ──
            last_output = last_input = last_expected = None
            total_time_ms = 0.0
            turn_outputs_list: list[dict] = []
            for i, turn in enumerate(turns):
                t0 = time.time()
                try:
                    output = call_agent(
                        url=agent.url,
                        api_key=agent.api_key,
                        message=turn["input"],
                        request_body=agent.request_body or '{"message": "{{message}}"}',
                        output_field=agent.output_field,
                        connection_type=agent.connection_type,
                        session_id=session_id,
                        variables=tc.variables or {},
                        token_url=getattr(agent, "token_url", None),
                        token_request_body=getattr(agent, "token_request_body", None),
                        token_output_field=getattr(agent, "token_output_field", None),
                        token_header_name=getattr(agent, "token_header_name", None),
                    )
                except Exception as e:
                    return TestResult(run_id=run_id, test_case_id=tc.id,
                                      passed=False, error=f"Turno {i + 1}: {e}",
                                      turns_executed=i + 1,
                                      turn_outputs=turn_outputs_list or None)
                total_time_ms += (time.time() - t0) * 1000
                turn_outputs_list.append({"input": turn["input"], "output": output})
                last_output = output
                last_input = turn["input"]
                last_expected = turn.get("expected_output")

            # Avalia apenas o último turno (sinal de qualidade final)
            scores, reasons = _call_evaluate(last_input, last_output, last_expected, tc.context, total_time_ms, profile)
            thresholds = _build_thresholds(profile)
            passed = compute_passed(scores, thresholds) if scores else True
            return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=last_output,
                              scores=scores, reasons=reasons, passed=passed,
                              turns_executed=len(turns), turn_outputs=turn_outputs_list)

    except Exception as e:
        return TestResult(run_id=run_id, test_case_id=tc.id, passed=False, error=str(e))
