from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Dataset, DatasetRecord, DatasetResult
from ..schemas import DatasetCreate, DatasetOut, DatasetDetailOut

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    datasets = db.query(Dataset).order_by(Dataset.created_at.desc()).all()
    result = []
    for ds in datasets:
        count = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == ds.id).count()
        out = DatasetOut(
            id=ds.id,
            name=ds.name,
            description=ds.description,
            created_at=ds.created_at,
            record_count=count,
        )
        result.append(out)
    return result


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    return ds


@router.post("/", response_model=DatasetOut, status_code=201)
def create_dataset(data: DatasetCreate, db: Session = Depends(get_db)):
    ds = Dataset(name=data.name, description=data.description)
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return DatasetOut(id=ds.id, name=ds.name, description=ds.description,
                      created_at=ds.created_at, record_count=0)


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    db.delete(ds)
    db.commit()


@router.delete("/{dataset_id}/records/{record_id}", status_code=204)
def delete_record(dataset_id: int, record_id: int, db: Session = Depends(get_db)):
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
def bulk_delete_records(dataset_id: int, data: BulkDeleteRequest, db: Session = Depends(get_db)):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")
    if not data.record_ids:
        return {"deleted": 0}
    # Delete associated results first
    db.query(DatasetResult).filter(DatasetResult.record_id.in_(data.record_ids)).delete(synchronize_session=False)
    deleted = db.query(DatasetRecord).filter(
        DatasetRecord.dataset_id == dataset_id,
        DatasetRecord.id.in_(data.record_ids),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
