from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Workspace, WorkspaceMember
from ..schemas import WorkspaceCreate, WorkspaceOut
from ..workspace import (
    LEGACY_DEFAULT_WORKSPACE_SLUG,
    WorkspaceContext,
    ensure_user,
    get_current_workspace,
    remove_legacy_default_workspace,
    require_writer,
    slugify,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _to_out(member: WorkspaceMember) -> WorkspaceOut:
    workspace = member.workspace
    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        role=member.role,
        created_at=workspace.created_at,
    )


@router.get("/", response_model=list[WorkspaceOut])
def list_workspaces(
    db: Session = Depends(get_db),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
):
    user = ensure_user(db, x_user_email)
    remove_legacy_default_workspace(db)
    db.commit()
    memberships = (
        db.query(WorkspaceMember)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user.id)
        .filter(Workspace.slug != LEGACY_DEFAULT_WORKSPACE_SLUG)
        .order_by(WorkspaceMember.created_at.asc())
        .all()
    )
    return [_to_out(m) for m in memberships]


@router.get("/current", response_model=WorkspaceOut)
def current_workspace(ctx: WorkspaceContext = Depends(get_current_workspace)):
    return WorkspaceOut(
        id=ctx.workspace.id,
        name=ctx.workspace.name,
        slug=ctx.workspace.slug,
        role=ctx.role,
        created_at=ctx.workspace.created_at,
    )


@router.post("/", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    data: WorkspaceCreate,
    db: Session = Depends(get_db),
    ctx: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(ctx)
    base_slug = slugify(data.slug or data.name)
    slug = base_slug
    suffix = 2
    while db.query(Workspace).filter(Workspace.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    workspace = Workspace(name=data.name, slug=slug)
    db.add(workspace)
    db.flush()
    member = WorkspaceMember(workspace_id=workspace.id, user_id=ctx.user.id, role="owner")
    db.add(member)
    db.commit()
    db.refresh(member)
    return _to_out(member)


@router.post("/{workspace_id}/members", status_code=201)
def add_workspace_member(
    workspace_id: int,
    email: str,
    role: str = "member",
    db: Session = Depends(get_db),
    ctx: WorkspaceContext = Depends(get_current_workspace),
):
    if ctx.workspace_id != workspace_id or ctx.role not in {"owner", "admin"}:
        raise HTTPException(403, "Sem permissao para gerenciar membros")
    if role not in {"owner", "admin", "member", "viewer"}:
        raise HTTPException(400, "Role invalida")

    user = ensure_user(db, email)
    member = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
        .first()
    )
    if member:
        member.role = role
    else:
        member = WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=role)
        db.add(member)
    db.commit()
    return {"workspace_id": workspace_id, "user_id": user.id, "email": user.email, "role": role}
