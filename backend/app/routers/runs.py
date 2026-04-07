import time
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Agent, EvaluationProfile, TestCase, TestRun, TestResult
from ..schemas import TestRunCreate, TestRunOut
from ..services.agent_caller import call_agent
from ..services.evaluator import evaluate_response, compute_passed

router = APIRouter(prefix="/runs", tags=["runs"])


def _enrich_run(run: TestRun, db: Session) -> dict:
    data = {c.name: getattr(run, c.name) for c in TestRun.__table__.columns}
    agent = db.get(Agent, run.agent_id)
    profile = db.get(EvaluationProfile, run.profile_id)
    data["agent_name"] = agent.name if agent else None
    data["profile_name"] = profile.name if profile else None
    data["results"] = run.results
    return data


@router.get("/", response_model=list[TestRunOut])
def list_runs(db: Session = Depends(get_db)):
    runs = db.query(TestRun).order_by(TestRun.created_at.desc()).all()
    return [_enrich_run(r, db) for r in runs]


@router.get("/{run_id}", response_model=TestRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(TestRun, run_id)
    if not run:
        raise HTTPException(404, "Execução não encontrada")
    return _enrich_run(run, db)


@router.post("/", response_model=TestRunOut, status_code=201)
def create_run(data: TestRunCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    agent = db.get(Agent, data.agent_id)
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    profile = db.get(EvaluationProfile, data.profile_id)
    if not profile:
        raise HTTPException(404, "Perfil de avaliação não encontrado")

    test_cases = db.query(TestCase).filter(TestCase.id.in_(data.test_case_ids)).all()
    if not test_cases:
        raise HTTPException(400, "Nenhum caso de teste encontrado")

    run = TestRun(
        agent_id=data.agent_id,
        profile_id=data.profile_id,
        test_case_ids=data.test_case_ids,
        status="running",
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
        for tc in ordered:
            result = _evaluate_case(run_id, tc, agent, profile)
            if result.scores:
                all_scores.extend(result.scores.values())
            db.add(result)
            db.commit()

        run.status = "completed"
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


def _evaluate_case(run_id: int, tc: TestCase, agent: Agent, profile: EvaluationProfile) -> TestResult:
    try:
        t0 = time.time()
        actual_output = call_agent(
            url=agent.url,
            api_key=agent.api_key,
            message=tc.input,
            request_body=agent.request_body or '{"message": "{{message}}"}',
            output_field=agent.output_field,
            connection_type=agent.connection_type,
        )
        response_time_ms = (time.time() - t0) * 1000

        scores, reasons = evaluate_response(
            input_text=tc.input,
            actual_output=actual_output,
            expected_output=tc.expected_output,
            context=tc.context,
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
        )
        thresholds = {
            "relevancy":    profile.relevancy_threshold,
            "hallucination": profile.hallucination_threshold,
            "toxicity":     getattr(profile, "toxicity_threshold", 0.5),
            "bias":         getattr(profile, "bias_threshold", 0.5),
            "faithfulness": getattr(profile, "faithfulness_threshold", 0.5),
            "latency":      0.5,
            **{f"criterion_{i}": 0.5 for i in range(len(profile.criteria or []))},
        }
        passed = compute_passed(scores, thresholds) if scores else True
        return TestResult(run_id=run_id, test_case_id=tc.id, actual_output=actual_output, scores=scores, reasons=reasons, passed=passed)
    except Exception as e:
        return TestResult(run_id=run_id, test_case_id=tc.id, passed=False, error=str(e))
