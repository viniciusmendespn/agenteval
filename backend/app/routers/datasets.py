from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Dataset, DatasetRecord, DatasetResult, Agent
from ..schemas import DatasetCreate, DatasetOut, DatasetDetailOut
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _agent_name(db: Session, agent_id: Optional[int]) -> Optional[str]:
    if not agent_id:
        return None
    a = db.get(Agent, agent_id)
    return a.name if a else None


@router.get("/", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    datasets = (
        db.query(Dataset)
        .filter(Dataset.workspace_id == workspace.workspace_id)
        .order_by(Dataset.created_at.desc())
        .all()
    )
    result = []
    for ds in datasets:
        count = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == ds.id).count()
        out = DatasetOut(
            id=ds.id,
            name=ds.name,
            description=ds.description,
            system_prompt=ds.system_prompt,
            agent_id=ds.agent_id,
            agent_name=_agent_name(db, ds.agent_id),
            created_at=ds.created_at,
            record_count=count,
        )
        result.append(out)
    return result


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    # Enrich com agent_name
    return DatasetDetailOut(
        id=ds.id,
        name=ds.name,
        description=ds.description,
        system_prompt=ds.system_prompt,
        agent_id=ds.agent_id,
        agent_name=_agent_name(db, ds.agent_id),
        created_at=ds.created_at,
        records=ds.records,
    )


@router.post("/", response_model=DatasetOut, status_code=201)
def create_dataset(
    data: DatasetCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    system_prompt = data.system_prompt
    if data.agent_id and not system_prompt:
        agent = db.get(Agent, data.agent_id)
        if agent and agent.system_prompt:
            system_prompt = agent.system_prompt
    ds = Dataset(
        name=data.name, description=data.description,
        system_prompt=system_prompt, agent_id=data.agent_id,
        workspace_id=workspace.workspace_id,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return DatasetOut(id=ds.id, name=ds.name, description=ds.description,
                      system_prompt=ds.system_prompt, agent_id=ds.agent_id,
                      agent_name=_agent_name(db, ds.agent_id),
                      created_at=ds.created_at, record_count=0)


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    agent_id: Optional[int] = None


@router.patch("/{dataset_id}", response_model=DatasetOut)
def update_dataset(
    dataset_id: int,
    data: DatasetUpdate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ds, field, value)
    db.commit()
    db.refresh(ds)
    count = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == ds.id).count()
    return DatasetOut(id=ds.id, name=ds.name, description=ds.description,
                      system_prompt=ds.system_prompt, agent_id=ds.agent_id,
                      agent_name=_agent_name(db, ds.agent_id),
                      created_at=ds.created_at, record_count=count)


@router.post("/{dataset_id}/sync-prompt", response_model=DatasetOut)
def sync_agent_prompt(
    dataset_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Copia o system_prompt atual do agente vinculado para o dataset."""
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    if not ds.agent_id:
        raise HTTPException(400, "Dataset não está vinculado a nenhum agente")
    agent = db.get(Agent, ds.agent_id)
    if not agent:
        raise HTTPException(404, "Agente vinculado não encontrado")
    ds.system_prompt = agent.system_prompt
    db.commit()
    db.refresh(ds)
    count = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == ds.id).count()
    return DatasetOut(id=ds.id, name=ds.name, description=ds.description,
                      system_prompt=ds.system_prompt, agent_id=ds.agent_id,
                      agent_name=agent.name, created_at=ds.created_at, record_count=count)


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    db.delete(ds)
    db.commit()


@router.delete("/{dataset_id}/records/{record_id}", status_code=204)
def delete_record(
    dataset_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset nÃ£o encontrado")
    record = db.query(DatasetRecord).filter(
        DatasetRecord.id == record_id,
        DatasetRecord.dataset_id == dataset_id,
    ).first()
    if not record:
        raise HTTPException(404, "Registro não encontrado")
    db.query(DatasetResult).filter(DatasetResult.record_id == record_id).delete()
    db.delete(record)
    db.commit()


class BulkDeleteRequest(BaseModel):
    record_ids: list[int]


@router.post("/{dataset_id}/records/bulk-delete", status_code=200)
def bulk_delete_records(
    dataset_id: int,
    data: BulkDeleteRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.workspace_id == workspace.workspace_id).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    if not data.record_ids:
        return {"deleted": 0}
    scoped_record_ids = [
        r.id for r in db.query(DatasetRecord.id).filter(
            DatasetRecord.dataset_id == dataset_id,
            DatasetRecord.id.in_(data.record_ids),
        ).all()
    ]
    if not scoped_record_ids:
        return {"deleted": 0}
    # Delete associated results first
    db.query(DatasetResult).filter(DatasetResult.record_id.in_(scoped_record_ids)).delete(synchronize_session=False)
    deleted = db.query(DatasetRecord).filter(
        DatasetRecord.dataset_id == dataset_id,
        DatasetRecord.id.in_(scoped_record_ids),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
