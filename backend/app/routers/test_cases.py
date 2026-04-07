from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import TestCase
from ..schemas import TestCaseCreate, TestCaseOut

router = APIRouter(prefix="/test-cases", tags=["test_cases"])


@router.get("/", response_model=list[TestCaseOut])
def list_test_cases(db: Session = Depends(get_db)):
    return db.query(TestCase).all()


@router.post("/", response_model=TestCaseOut, status_code=201)
def create_test_case(data: TestCaseCreate, db: Session = Depends(get_db)):
    tc = TestCase(**data.model_dump())
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@router.get("/{tc_id}", response_model=TestCaseOut)
def get_test_case(tc_id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    return tc


@router.put("/{tc_id}", response_model=TestCaseOut)
def update_test_case(tc_id: int, data: TestCaseCreate, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    for field, value in data.model_dump().items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@router.delete("/{tc_id}", status_code=204)
def delete_test_case(tc_id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(404, "Caso de teste não encontrado")
    db.delete(tc)
    db.commit()
