from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import EvaluationProfile
from ..schemas import EvaluationProfileCreate, EvaluationProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/", response_model=list[EvaluationProfileOut])
def list_profiles(db: Session = Depends(get_db)):
    return db.query(EvaluationProfile).all()


@router.post("/", response_model=EvaluationProfileOut, status_code=201)
def create_profile(data: EvaluationProfileCreate, db: Session = Depends(get_db)):
    profile = EvaluationProfile(**data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=EvaluationProfileOut)
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(EvaluationProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    return profile


@router.put("/{profile_id}", response_model=EvaluationProfileOut)
def update_profile(profile_id: int, data: EvaluationProfileCreate, db: Session = Depends(get_db)):
    profile = db.get(EvaluationProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    for field, value in data.model_dump().items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(EvaluationProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    db.delete(profile)
    db.commit()
