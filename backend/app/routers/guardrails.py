from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Guardrail
from ..schemas import GuardrailCreate, GuardrailOut
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/guardrails", tags=["guardrails"])


@router.get("/", response_model=list[GuardrailOut])
def list_guardrails(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Lista presets de sistema + guardrails customizados do workspace."""
    return (
        db.query(Guardrail)
        .filter(
            (Guardrail.is_system == True) | (Guardrail.workspace_id == workspace.workspace_id)
        )
        .order_by(Guardrail.is_system.desc(), Guardrail.name)
        .all()
    )


@router.post("/", response_model=GuardrailOut, status_code=201)
def create_guardrail(
    data: GuardrailCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    guardrail = Guardrail(
        workspace_id=workspace.workspace_id,
        name=data.name,
        description=data.description,
        mode=data.mode,
        criterion=data.criterion,
        preset_key=None,
        is_system=False,
        created_at=datetime.utcnow(),
    )
    db.add(guardrail)
    db.commit()
    db.refresh(guardrail)
    return guardrail


@router.get("/{guardrail_id}", response_model=GuardrailOut)
def get_guardrail(
    guardrail_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    g = db.query(Guardrail).filter(
        Guardrail.id == guardrail_id,
        (Guardrail.is_system == True) | (Guardrail.workspace_id == workspace.workspace_id),
    ).first()
    if not g:
        raise HTTPException(404, "Guardrail não encontrado")
    return g


@router.put("/{guardrail_id}", response_model=GuardrailOut)
def update_guardrail(
    guardrail_id: int,
    data: GuardrailCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    g = db.query(Guardrail).filter(
        Guardrail.id == guardrail_id,
        Guardrail.workspace_id == workspace.workspace_id,
        Guardrail.is_system == False,
    ).first()
    if not g:
        raise HTTPException(404, "Guardrail não encontrado ou não pode ser editado (presets são somente leitura)")
    g.name = data.name
    g.description = data.description
    g.mode = data.mode
    g.criterion = data.criterion
    db.commit()
    db.refresh(g)
    return g


@router.delete("/{guardrail_id}", status_code=204)
def delete_guardrail(
    guardrail_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    g = db.query(Guardrail).filter(
        Guardrail.id == guardrail_id,
        Guardrail.workspace_id == workspace.workspace_id,
        Guardrail.is_system == False,
    ).first()
    if not g:
        raise HTTPException(404, "Guardrail não encontrado ou não pode ser excluído (presets são somente leitura)")
    db.delete(g)
    db.commit()
