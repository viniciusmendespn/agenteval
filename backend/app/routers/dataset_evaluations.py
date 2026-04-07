from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Dataset, DatasetRecord, DatasetEvaluation, DatasetResult, EvaluationProfile
from ..schemas import DatasetEvaluationCreate, DatasetEvaluationOut
from ..services.evaluator import evaluate_response, compute_passed

router = APIRouter(prefix="/datasets/{dataset_id}/evaluations", tags=["dataset-evaluations"])


@router.get("/", response_model=list[DatasetEvaluationOut])
def list_evaluations(dataset_id: int, db: Session = Depends(get_db)):
    return (
        db.query(DatasetEvaluation)
        .filter(DatasetEvaluation.dataset_id == dataset_id)
        .order_by(DatasetEvaluation.created_at.desc())
        .all()
    )


@router.get("/{eval_id}", response_model=DatasetEvaluationOut)
def get_evaluation(dataset_id: int, eval_id: int, db: Session = Depends(get_db)):
    ev = db.get(DatasetEvaluation, eval_id)
    if not ev or ev.dataset_id != dataset_id:
        raise HTTPException(404, "Avaliação não encontrada")
    return ev


@router.post("/", response_model=DatasetEvaluationOut, status_code=201)
def create_evaluation(
    dataset_id: int,
    data: DatasetEvaluationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")

    profile = db.get(EvaluationProfile, data.profile_id)
    if not profile:
        raise HTTPException(404, "Perfil de avaliação não encontrado")

    records = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == dataset_id).all()
    if not records:
        raise HTTPException(400, "Dataset não possui registros")

    ev = DatasetEvaluation(
        dataset_id=dataset_id,
        profile_id=data.profile_id,
        status="running",
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    background_tasks.add_task(_execute_evaluation, ev.id)
    return ev


def _execute_evaluation(eval_id: int):
    db: Session = SessionLocal()
    try:
        ev = db.get(DatasetEvaluation, eval_id)
        profile = db.get(EvaluationProfile, ev.profile_id)
        records = (
            db.query(DatasetRecord)
            .filter(DatasetRecord.dataset_id == ev.dataset_id)
            .all()
        )

        all_scores: list[float] = []
        for record in records:
            result = _evaluate_record(eval_id, record, profile)
            if result.scores:
                all_scores.extend(result.scores.values())
            db.add(result)
            db.commit()

        ev.status = "completed"
        ev.overall_score = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
        ev.completed_at = datetime.utcnow()
        db.commit()

    except Exception:
        try:
            ev = db.get(DatasetEvaluation, eval_id)
            if ev:
                ev.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _evaluate_record(eval_id: int, record: DatasetRecord, profile: EvaluationProfile) -> DatasetResult:
    try:
        if not record.actual_output:
            raise ValueError("Registro sem resposta — não é possível avaliar")

        scores, reasons = evaluate_response(
            input_text=record.input,
            actual_output=record.actual_output,
            expected_output=None,
            context=record.context,
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
        return DatasetResult(evaluation_id=eval_id, record_id=record.id, scores=scores, reasons=reasons, passed=passed)
    except Exception as e:
        return DatasetResult(evaluation_id=eval_id, record_id=record.id, passed=False, error=str(e))
