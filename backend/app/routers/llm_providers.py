from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import LLMProvider
from ..schemas import LLMProviderCreate, LLMProviderOut
from ..services.judge_llm import get_judge_from_provider

router = APIRouter(prefix="/llm-providers", tags=["llm-providers"])


@router.get("/", response_model=list[LLMProviderOut])
def list_providers(db: Session = Depends(get_db)):
    return db.query(LLMProvider).order_by(LLMProvider.created_at.desc()).all()


@router.post("/", response_model=LLMProviderOut, status_code=201)
def create_provider(data: LLMProviderCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    payload["api_key"] = payload.get("api_key") or ""
    provider = LLMProvider(**payload)
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.get("/{provider_id}", response_model=LLMProviderOut)
def get_provider(provider_id: int, db: Session = Depends(get_db)):
    provider = db.get(LLMProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Provedor LLM não encontrado")
    return provider


@router.put("/{provider_id}", response_model=LLMProviderOut)
def update_provider(provider_id: int, data: LLMProviderCreate, db: Session = Depends(get_db)):
    provider = db.get(LLMProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Provedor LLM não encontrado")
    payload = data.model_dump()
    payload["api_key"] = payload.get("api_key") or ""
    for k, v in payload.items():
        setattr(provider, k, v)
    db.commit()
    db.refresh(provider)
    return provider


@router.delete("/{provider_id}", status_code=204)
def delete_provider(provider_id: int, db: Session = Depends(get_db)):
    provider = db.get(LLMProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Provedor LLM não encontrado")
    db.delete(provider)
    db.commit()


@router.post("/{provider_id}/test")
def test_provider(provider_id: int, db: Session = Depends(get_db)):
    provider = db.get(LLMProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Provedor LLM não encontrado")
    judge = get_judge_from_provider(provider)
    try:
        reply, _ = judge.generate("Responda apenas: ok")
        return {"ok": True, "model": provider.model_name, "reply": str(reply)[:200]}
    except Exception as e:
        return {"ok": False, "model": provider.model_name, "error": str(e)}
