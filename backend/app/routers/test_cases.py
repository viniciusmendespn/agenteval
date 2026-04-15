from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import TestCase
from ..schemas import TestCaseCreate, TestCaseOut
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/test-cases", tags=["test_cases"])


@router.get("/", response_model=list[TestCaseOut])
def list_test_cases(db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    return db.query(TestCase).filter(TestCase.workspace_id == workspace.workspace_id).all()


@router.post("/", response_model=TestCaseOut, status_code=201)
def create_test_case(
    data: TestCaseCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    tc = TestCase(**data.model_dump(), workspace_id=workspace.workspace_id)
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@router.get("/{tc_id}", response_model=TestCaseOut)
def get_test_case(tc_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    tc = db.query(TestCase).filter(TestCase.id == tc_id, TestCase.workspace_id == workspace.workspace_id).first()
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    return tc


@router.put("/{tc_id}", response_model=TestCaseOut)
def update_test_case(
    tc_id: int,
    data: TestCaseCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    tc = db.query(TestCase).filter(TestCase.id == tc_id, TestCase.workspace_id == workspace.workspace_id).first()
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    for field, value in data.model_dump().items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@router.delete("/{tc_id}", status_code=204)
def delete_test_case(tc_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    tc = db.query(TestCase).filter(TestCase.id == tc_id, TestCase.workspace_id == workspace.workspace_id).first()
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    db.delete(tc)
    db.commit()
