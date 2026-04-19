from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Dataset, DatasetRecord, DatasetEvaluation, DatasetResult, EvaluationProfile
from ..schemas import DatasetEvaluationCreate, DatasetEvaluationOut
from ..queue import get_task_queue
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/datasets/{dataset_id}/evaluations", tags=["dataset-evaluations"])


@router.get("/", response_model=list[DatasetEvaluationOut])
def list_evaluations(dataset_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset nÃ£o encontrado")
    return (
        db.query(DatasetEvaluation)
        .filter(DatasetEvaluation.dataset_id == dataset_id, DatasetEvaluation.workspace_id == workspace.workspace_id)
        .order_by(DatasetEvaluation.created_at.desc())
        .all()
    )


@router.get("/{eval_id}", response_model=DatasetEvaluationOut)
def get_evaluation(
    dataset_id: int,
    eval_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    ev = db.query(DatasetEvaluation).filter(
        DatasetEvaluation.id == eval_id,
        DatasetEvaluation.dataset_id == dataset_id,
        DatasetEvaluation.workspace_id == workspace.workspace_id,
    ).first()
    if not ev or ev.dataset_id != dataset_id:
        raise HTTPException(404, "Avaliação não encontrada")
    return ev


@router.post("/", response_model=DatasetEvaluationOut, status_code=201)
def create_evaluation(
    dataset_id: int,
    data: DatasetEvaluationCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")

    profile = db.query(EvaluationProfile).filter(
        EvaluationProfile.id == data.profile_id,
        EvaluationProfile.workspace_id == workspace.workspace_id,
    ).first()
    if not profile:
        raise HTTPException(404, "Perfil de avaliação não encontrado")

    records = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == dataset_id).all()
    if not records:
        raise HTTPException(400, "Dataset não possui registros")

    ev = DatasetEvaluation(
        dataset_id=dataset_id,
        profile_id=data.profile_id,
        status="running",
        workspace_id=workspace.workspace_id,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    get_task_queue().enqueue("execute_evaluation", {"eval_id": ev.id})
    return ev
