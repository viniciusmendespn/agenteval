from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Agent, AgentPromptVersion, Dataset, DatasetEvaluation, DatasetRecord,
    DatasetResult, Evaluation, EvaluationProfile, Guardrail, PromptVersionComparison,
    TestCase, TestResult, TestRun, Workspace, WorkspaceMember,
)
from ..schemas import WorkspaceCreate, WorkspaceOut, WorkspaceSettingsOut, WorkspaceSettingsPatch
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


@router.get("/settings", response_model=WorkspaceSettingsOut)
def get_workspace_settings(ctx: WorkspaceContext = Depends(get_current_workspace)):
    return WorkspaceSettingsOut(chat_llm_provider_id=ctx.workspace.chat_llm_provider_id)


@router.patch("/settings", response_model=WorkspaceSettingsOut)
def update_workspace_settings(
    data: WorkspaceSettingsPatch,
    db: Session = Depends(get_db),
    ctx: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(ctx)
    ws = db.get(Workspace, ctx.workspace_id)
    ws.chat_llm_provider_id = data.chat_llm_provider_id
    db.commit()
    db.refresh(ws)
    return WorkspaceSettingsOut(chat_llm_provider_id=ws.chat_llm_provider_id)


@router.post("/", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    data: WorkspaceCreate,
    db: Session = Depends(get_db),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
):
    user = ensure_user(db, x_user_email)
    base_slug = slugify(data.slug or data.name)
    slug = base_slug
    suffix = 2
    while db.query(Workspace).filter(Workspace.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    workspace = Workspace(name=data.name, slug=slug)
    db.add(workspace)
    db.flush()
    member = WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner")
    db.add(member)
    db.commit()
    db.refresh(member)
    return _to_out(member)


@router.delete("/{workspace_id}")
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
):
    user = ensure_user(db, x_user_email)
    membership = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
        .first()
    )
    if not membership or membership.role != "owner":
        raise HTTPException(403, "Apenas owners podem excluir workspaces")
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace não encontrado")

    # 1. TestResults (FK → TestRun)
    run_ids = [r[0] for r in db.query(TestRun.id).filter(TestRun.workspace_id == workspace_id)]
    if run_ids:
        db.query(TestResult).filter(TestResult.run_id.in_(run_ids)).delete(synchronize_session=False)

    # 2. DatasetResults (FK → DatasetEvaluation)
    eval_ids = [r[0] for r in db.query(DatasetEvaluation.id).filter(DatasetEvaluation.workspace_id == workspace_id)]
    if eval_ids:
        db.query(DatasetResult).filter(DatasetResult.evaluation_id.in_(eval_ids)).delete(synchronize_session=False)

    # 3. DatasetRecords (FK → Dataset)
    ds_ids = [r[0] for r in db.query(Dataset.id).filter(Dataset.workspace_id == workspace_id)]
    if ds_ids:
        db.query(DatasetRecord).filter(DatasetRecord.dataset_id.in_(ds_ids)).delete(synchronize_session=False)

    # 4. PromptVersionComparisons (FK → AgentPromptVersion)
    apv_ids = [r[0] for r in db.query(AgentPromptVersion.id).filter(AgentPromptVersion.workspace_id == workspace_id)]
    if apv_ids:
        db.query(PromptVersionComparison).filter(
            PromptVersionComparison.v1_id.in_(apv_ids) | PromptVersionComparison.v2_id.in_(apv_ids)
        ).delete(synchronize_session=False)

    # 5-11. Remaining tables by workspace_id, then the workspace itself
    for model in (
        Evaluation, AgentPromptVersion, Guardrail,
        DatasetEvaluation, Dataset, TestRun,
        TestCase, EvaluationProfile, Agent,
        WorkspaceMember,
    ):
        db.query(model).filter(model.workspace_id == workspace_id).delete(synchronize_session=False)

    db.delete(ws)
    db.commit()
    return {"ok": True}


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
