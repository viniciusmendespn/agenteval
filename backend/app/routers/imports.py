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
from ..services.judge_llm import resolve_system_judge

router = APIRouter(prefix="/imports", tags=["imports"])


class MappingRequest(BaseModel):
    dataset_name: str
    dataset_description: Optional[str] = None
    dataset_system_prompt: Optional[str] = None
    agent_id: Optional[int] = None         # agente vinculado: copia system_prompt se não informado
    file_ids: list[str]
    input_path: str
    output_path: Optional[str] = None
    context_paths: list[str] = Field(default_factory=list)
    manual_context: Optional[str] = None
    session_id_path: Optional[str] = None  # campo que identifica a sessão/conversa
    order_path: Optional[str] = None       # campo que ordena mensagens dentro da sessão


class AppendRequest(BaseModel):
    dataset_id: int
    file_ids: list[str]
    input_path: str
    output_path: Optional[str] = None
    context_paths: list[str] = Field(default_factory=list)
    manual_context: Optional[str] = None
    session_id_path: Optional[str] = None
    order_path: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
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
    judge = resolve_system_judge(db, workspace.workspace_id)
    suggestion = suggest_mapping(sample, all_paths, judge=judge)

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

    session_tag = uuid.uuid4().hex[:4]
    previews: list[dict] = []
    total_in_files = 0
    mapped_count = 0
    global_index = 0

    try:
        for fid in data.file_ids:
            file_records = load_tmp(fid)
            total_in_files += len(file_records)
            for record in file_records:
                mapped = _map_record(record, data, global_index, session_tag)
                global_index += 1
                if mapped["input"]:
                    mapped_count += 1
                    if len(previews) < 5:
                        previews.append(mapped)
    except FileNotFoundError:
        raise HTTPException(404, "Arquivo temporário não encontrado. Faça o upload novamente.")

    skipped = total_in_files - mapped_count
    return {
        "previews": previews,
        "record_count": mapped_count,
        "total_in_files": total_in_files,
        "skipped": skipped,
        "session_tag": session_tag,
    }


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

    # Se agent_id fornecido e system_prompt não, copiar do agente
    system_prompt = data.dataset_system_prompt
    if data.agent_id and not system_prompt:
        from ..models import Agent as _Agent
        agent = db.get(_Agent, data.agent_id)
        if agent and agent.system_prompt:
            system_prompt = agent.system_prompt

    ds = Dataset(
        name=data.dataset_name,
        description=data.dataset_description,
        system_prompt=system_prompt,
        agent_id=data.agent_id,
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
                session_id=mapped["session_id"],
                turn_order=mapped["turn_order"],
            ))

    _rerank_sessions(records_to_add)
    db.bulk_save_objects(records_to_add)
    db.commit()

    return {"dataset_id": ds.id, "created": len(records_to_add), "skipped": global_index - len(records_to_add)}


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
            session_id_path=data.session_id_path,
            order_path=data.order_path,
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
                session_id=mapped["session_id"],
                turn_order=mapped["turn_order"],
            ))

    _rerank_sessions(records_to_add)
    db.bulk_save_objects(records_to_add)
    db.commit()

    return {"dataset_id": ds.id, "appended": len(records_to_add)}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _parse_order(val) -> Optional[int]:
    """Converte número, string numérica ou ISO datetime para int (para re-ranking posterior)."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    if isinstance(val, str):
        try:
            return int(val)
        except ValueError:
            pass
        try:
            from datetime import datetime as dt
            parsed = dt.fromisoformat(val.replace("Z", "+00:00"))
            return int(parsed.timestamp())
        except Exception:
            pass
    return None


def _rerank_sessions(records: list) -> None:
    """Re-rankeia turn_order para posições 1-based por grupo session_id."""
    sessions: dict[str, list[tuple[int, int]]] = {}
    for idx, rec in enumerate(records):
        sid = rec.session_id
        if sid and rec.turn_order is not None:
            sessions.setdefault(sid, []).append((rec.turn_order, idx))
    for sid, entries in sessions.items():
        entries.sort(key=lambda x: x[0])
        for rank, (_, rec_idx) in enumerate(entries, start=1):
            records[rec_idx].turn_order = rank


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

    session_id_val = None
    if data.session_id_path:
        raw = resolve_path(record, data.session_id_path)
        if raw is not None:
            session_id_val = to_str(raw)

    order_val = None
    if data.order_path:
        order_val = _parse_order(resolve_path(record, data.order_path))

    return {
        "input": input_val,
        "output": output_val,
        "context": context if context else None,
        "session_id": session_id_val,
        "turn_order": order_val,
    }
