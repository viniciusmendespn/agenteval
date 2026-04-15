import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Dataset, DatasetRecord
from ..workspace import WorkspaceContext, get_current_workspace, require_writer
from ..services.importer import (
    extract_all_paths,
    load_tmp,
    parse_file,
    resolve_path,
    save_tmp,
    to_str,
)
from ..services.field_mapper import suggest_mapping

router = APIRouter(prefix="/imports", tags=["imports"])


class MappingRequest(BaseModel):
    dataset_name: str
    dataset_description: Optional[str] = None
    file_ids: list[str]
    input_path: str
    output_path: Optional[str] = None
    context_paths: list[str] = Field(default_factory=list)
    manual_context: Optional[str] = None


class AppendRequest(BaseModel):
    dataset_id: int
    file_ids: list[str]
    input_path: str
    output_path: Optional[str] = None
    context_paths: list[str] = Field(default_factory=list)
    manual_context: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    """Analisa arquivo com IA e sugere mapeamento de campos."""
    content = await file.read()
    try:
        records = parse_file(content, file.filename or "upload.json")
    except Exception as e:
        raise HTTPException(400, f"Erro ao parsear arquivo: {e}")

    if not records:
        raise HTTPException(400, "Arquivo vazio ou sem registros válidos")

    all_paths = extract_all_paths(records)
    sample = records[:3]
    file_id = save_tmp(records)
    suggestion = suggest_mapping(sample, all_paths)

    return {
        "file_id": file_id,
        "record_count": len(records),
        "sample": sample,
        "all_paths": all_paths,
        "suggestion": suggestion,
    }


@router.post("/upload")
async def upload_extra_file(file: UploadFile = File(...)):
    """Upload de arquivo adicional sem chamar a IA — reutiliza mapeamento existente."""
    content = await file.read()
    try:
        records = parse_file(content, file.filename or "upload.json")
    except Exception as e:
        raise HTTPException(400, f"Erro ao parsear arquivo: {e}")

    if not records:
        raise HTTPException(400, "Arquivo vazio ou sem registros válidos")

    file_id = save_tmp(records)
    return {
        "file_id": file_id,
        "filename": file.filename,
        "record_count": len(records),
    }


@router.post("/preview")
def preview_mapping(data: MappingRequest):
    """Retorna os primeiros 5 registros mapeados sem salvar."""
    if not data.file_ids:
        raise HTTPException(400, "Nenhum arquivo informado")

    total = 0
    try:
        for fid in data.file_ids:
            total += len(load_tmp(fid))
    except FileNotFoundError:
        raise HTTPException(404, "Arquivo temporário não encontrado. Faça o upload novamente.")

    session_tag = uuid.uuid4().hex[:4]
    first_records = load_tmp(data.file_ids[0])
    previews = [_map_record(r, data, i, session_tag) for i, r in enumerate(first_records[:5])]

    return {"previews": previews, "record_count": total, "session_tag": session_tag}


@router.post("/confirm")
def confirm_import(
    data: MappingRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Cria um Dataset com todos os registros de todos os arquivos."""
    require_writer(workspace)
    if not data.file_ids:
        raise HTTPException(400, "Nenhum arquivo informado")

    ds = Dataset(
        name=data.dataset_name,
        description=data.dataset_description,
        workspace_id=workspace.workspace_id,
    )
    db.add(ds)
    db.flush()  # gera ds.id sem commitar

    session_tag = uuid.uuid4().hex[:4]
    records_to_add = []
    global_index = 0

    for fid in data.file_ids:
        try:
            file_records = load_tmp(fid)
        except FileNotFoundError:
            raise HTTPException(404, f"Arquivo {fid} não encontrado. Faça o upload novamente.")

        for record in file_records:
            mapped = _map_record(record, data, global_index, session_tag)
            global_index += 1
            if not mapped["input"]:
                continue
            records_to_add.append(DatasetRecord(
                dataset_id=ds.id,
                input=mapped["input"],
                actual_output=mapped["output"] or None,
                context=mapped["context"] or None,
            ))

    db.bulk_save_objects(records_to_add)
    db.commit()

    return {"dataset_id": ds.id, "created": len(records_to_add)}


@router.post("/append")
def append_to_dataset(
    data: AppendRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Adiciona registros a um dataset existente."""
    require_writer(workspace)
    ds = db.query(Dataset).filter(
        Dataset.id == data.dataset_id,
        Dataset.workspace_id == workspace.workspace_id,
    ).first()
    if not ds:
        raise HTTPException(404, "Dataset não encontrado")

    if not data.file_ids:
        raise HTTPException(400, "Nenhum arquivo informado")

    session_tag = uuid.uuid4().hex[:4]
    records_to_add = []
    global_index = 0

    for fid in data.file_ids:
        try:
            file_records = load_tmp(fid)
        except FileNotFoundError:
            raise HTTPException(404, f"Arquivo {fid} não encontrado. Faça o upload novamente.")

        mapping = MappingRequest(
            dataset_name=ds.name,
            file_ids=data.file_ids,
            input_path=data.input_path,
            output_path=data.output_path,
            context_paths=data.context_paths,
            manual_context=data.manual_context,
        )
        for record in file_records:
            mapped = _map_record(record, mapping, global_index, session_tag)
            global_index += 1
            if not mapped["input"]:
                continue
            records_to_add.append(DatasetRecord(
                dataset_id=ds.id,
                input=mapped["input"],
                actual_output=mapped["output"] or None,
                context=mapped["context"] or None,
            ))

    db.bulk_save_objects(records_to_add)
    db.commit()

    return {"dataset_id": ds.id, "appended": len(records_to_add)}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _map_record(record: dict, data: MappingRequest, index: int, session_tag: str = "") -> dict:
    input_val = to_str(resolve_path(record, data.input_path)) or ""
    output_val = to_str(resolve_path(record, data.output_path)) if data.output_path else None

    context: list[str] = []
    for cp in data.context_paths:
        val = to_str(resolve_path(record, cp))
        if val:
            context.append(val)
    if data.manual_context and data.manual_context.strip():
        context.append(data.manual_context.strip())

    return {
        "input": input_val,
        "output": output_val,
        "context": context if context else None,
    }
