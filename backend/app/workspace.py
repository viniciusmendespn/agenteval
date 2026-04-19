import re
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, Workspace, WorkspaceMember


DEFAULT_USER_EMAIL = "local@agenteval.dev"
LEGACY_DEFAULT_WORKSPACE_SLUG = "default"


@dataclass(frozen=True)
class WorkspaceContext:
    user: User
    workspace: Workspace
    membership: WorkspaceMember

    @property
    def workspace_id(self) -> int:
        return int(self.workspace.id)

    @property
    def role(self) -> str:
        return self.membership.role


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "workspace"


def ensure_user(db: Session, email: str | None = None) -> User:
    normalized = (email or DEFAULT_USER_EMAIL).strip().lower() or DEFAULT_USER_EMAIL
    user = db.query(User).filter(User.email == normalized).first()
    if user:
        return user
    user = User(email=normalized, name=normalized.split("@")[0])
    db.add(user)
    db.flush()
    return user


def ensure_workspace(db: Session, slug: str, name: str, user: User | None = None) -> Workspace:
    workspace = db.query(Workspace).filter(Workspace.slug == slug).first()
    if not workspace:
        workspace = Workspace(name=name, slug=slug)
        db.add(workspace)
        db.flush()

    if user is None:
        return workspace

    owner = user
    membership = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == owner.id,
        )
        .first()
    )
    if not membership:
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="owner"))
        db.flush()
    return workspace


def remove_legacy_default_workspace(db: Session) -> None:
    workspace = db.query(Workspace).filter(Workspace.slug == LEGACY_DEFAULT_WORKSPACE_SLUG).first()
    if not workspace:
        return
    db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace.id).delete()
    db.delete(workspace)
    db.flush()


def get_current_workspace(
    db: Session = Depends(get_db),
    x_workspace_id: int | None = Header(default=None, alias="X-Workspace-Id"),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
) -> WorkspaceContext:
    user = ensure_user(db, x_user_email)
    remove_legacy_default_workspace(db)
    if x_workspace_id is None:
        db.commit()
        raise HTTPException(status_code=428, detail="Selecione um workspace")

    query = (
        db.query(WorkspaceMember)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user.id)
        .filter(Workspace.slug != LEGACY_DEFAULT_WORKSPACE_SLUG)
        .filter(WorkspaceMember.workspace_id == x_workspace_id)
    )

    membership = query.order_by(WorkspaceMember.created_at.asc()).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Sem acesso a este workspace")

    db.commit()
    return WorkspaceContext(user=user, workspace=membership.workspace, membership=membership)


def require_writer(ctx: WorkspaceContext) -> None:
    if ctx.role not in {"owner", "admin", "member"}:
        raise HTTPException(status_code=403, detail="Sem permissao de escrita neste workspace")
