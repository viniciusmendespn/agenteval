import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Agent, TestRun, TestResult
from ..schemas import AgentCreate, AgentOut
from ..services.judge_llm import resolve_judge
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/agents", tags=["agents"])


# ── Rotas estáticas primeiro (antes das dinâmicas com /{agent_id}) ──────────

@router.get("/", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    return db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()


@router.post("/", response_model=AgentOut, status_code=201)
def create_agent(
    data: AgentCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    agent = Agent(**data.model_dump(), workspace_id=workspace.workspace_id)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


class TestConnectionRequest(BaseModel):
    url: str
    api_key: str


@router.post("/test-connection")
def test_connection(data: TestConnectionRequest):
    """Testa conectividade com um endpoint sem criar o agente."""
    try:
        headers = {"Authorization": f"Bearer {data.api_key}", "Content-Type": "application/json"}
        response = httpx.post(data.url, json={}, headers=headers, timeout=10)
        return {"ok": True, "status_code": response.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class PreviewRequest(BaseModel):
    url: str
    api_key: str
    connection_type: str = "http"
    request_body: str = '{"message": "{{message}}"}'
    output_field: str = ""
    message: str = "Olá, tudo bem?"
    session_id: str = ""


@router.post("/preview")
def preview_response(data: PreviewRequest):
    """
    Chama o agente com uma mensagem de teste e retorna a resposta bruta,
    para o usuário identificar o formato e configurar o output_field corretamente.
    """
    headers = {
        "Authorization": f"Bearer {data.api_key}",
        "Content-Type": "application/json",
    }
    from ..services.agent_caller import _build_payload
    payload = _build_payload(data.request_body, data.message, data.session_id)

    try:
        if data.connection_type == "sse":
            headers["Accept"] = "text/event-stream"
            events = []
            current_event = None
            with httpx.stream("POST", data.url, json=payload, headers=headers, timeout=30) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    line = line.strip()
                    if not line:
                        current_event = None
                        continue
                    if line.startswith(":"):
                        continue
                    if line.startswith("event:"):
                        current_event = line[6:].strip()
                        continue
                    if line.startswith("data:"):
                        raw = line[5:].strip()
                        entry: dict = {"event": current_event or "(sem nome)"}
                        try:
                            entry["data"] = json.loads(raw)
                        except json.JSONDecodeError:
                            entry["data"] = raw
                        events.append(entry)
                        if len(events) >= 8:
                            events.append({"info": "... (preview limitado a 8 eventos)"})
                            break
            # Tenta montar o texto capturado igual ao agent_caller faria
            from ..services.agent_caller import _resolve_path, _SKIP_EVENTS
            chunks = []
            for ev in events:
                if isinstance(ev, dict) and "info" not in ev:
                    if ev.get("event", "(sem nome)") in _SKIP_EVENTS:
                        continue
                    raw_data = ev.get("data", "")
                    if data.output_field:
                        if isinstance(raw_data, dict):
                            try:
                                chunk = _resolve_path(raw_data, data.output_field)
                                if chunk:
                                    chunks.append(chunk)
                            except Exception:
                                pass
                        elif isinstance(raw_data, str) and raw_data:
                            chunks.append(raw_data)
                    elif isinstance(raw_data, str) and raw_data:
                        chunks.append(raw_data)
            extracted = "".join(chunks) or None
            return {"connection_type": "sse", "sample_events": events, "extracted": extracted}
        else:
            response = httpx.post(data.url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            raw = response.json()
            extracted = None
            extract_error = None
            if data.output_field:
                try:
                    from ..services.agent_caller import _resolve_path
                    extracted = _resolve_path(raw, data.output_field)
                except Exception as ex:
                    extract_error = str(ex)
            return {"connection_type": "http", "raw_response": raw, "extracted": extracted, "extract_error": extract_error}

    except Exception as e:
        return {"error": str(e)}


# ── Rotas dinâmicas por ID (depois das estáticas) ───────────────────────────

@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
def update_agent(
    agent_id: int,
    data: AgentCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    for field, value in data.model_dump().items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: int, db: Session = Depends(get_db), workspace: WorkspaceContext = Depends(get_current_workspace)):
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    db.delete(agent)
    db.commit()


@router.post("/{agent_id}/optimize-prompt")
def optimize_prompt(
    agent_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    if not agent.system_prompt:
        raise HTTPException(400, "Agente não possui system prompt cadastrado")

    # Busca as últimas 5 runs desse agente no workspace
    runs = (
        db.query(TestRun)
        .filter(TestRun.agent_id == agent_id, TestRun.workspace_id == workspace.workspace_id, TestRun.status == "completed")
        .order_by(TestRun.created_at.desc())
        .limit(5)
        .all()
    )
    if not runs:
        raise HTTPException(400, "Nenhuma execução completada encontrada para este agente. Execute ao menos uma avaliação antes de otimizar.")

    # Coleta casos que falharam
    from ..models import TestCase
    failed_cases = []
    for run in runs:
        results = db.query(TestResult).filter(TestResult.run_id == run.id, TestResult.passed == False).all()
        for r in results:
            if r.actual_output:
                tc = db.get(TestCase, r.test_case_id)
                failed_cases.append({
                    "input_text": tc.input if tc else "(desconhecido)",
                    "output": r.actual_output,
                    "scores": r.scores or {},
                    "reasons": r.reasons or {},
                })
            if len(failed_cases) >= 10:
                break
        if len(failed_cases) >= 10:
            break

    # Monta contexto para o LLM
    cases_text = ""
    for i, c in enumerate(failed_cases[:8], 1):
        reasons_text = "; ".join(f"{k}: {v}" for k, v in c["reasons"].items() if v) or "sem motivo"
        scores_text = ", ".join(f"{k}={round(v*100)}%" for k, v in c["scores"].items()) or ""
        cases_text += f"\n--- Caso {i} ---\nEntrada: {c['input_text']}\nResposta: {c['output']}\nScores: {scores_text}\nMotivos: {reasons_text}\n"

    prompt = (
        "Você é um especialista em engenharia de prompts para agentes de IA.\n\n"
        f"System prompt atual do agente:\n{agent.system_prompt}\n\n"
        f"Casos de teste que falharam nas avaliações recentes:{cases_text}\n\n"
        "Com base nos problemas identificados, sugira uma versão melhorada do system prompt que:\n"
        "1. Corrija as deficiências apontadas nos motivos de falha\n"
        "2. Mantenha o objetivo e tom originais\n"
        "3. Seja claro e específico nas instruções\n\n"
        "Responda APENAS com JSON no formato:\n"
        '{"suggested_prompt": "...", "reasoning": "explicação das mudanças em 2-3 frases"}'
    )

    judge = resolve_judge(db)
    if judge is None:
        raise HTTPException(503, "Nenhum provedor LLM configurado. Adicione um em Configurações → Provedores LLM.")

    try:
        result_text, _ = judge.generate(prompt)
        import re
        json_match = re.search(r'\{.*\}', str(result_text), re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
        else:
            data = json.loads(str(result_text))
    except Exception as e:
        raise HTTPException(500, f"Erro ao gerar sugestão: {e}")

    return {
        "current_prompt": agent.system_prompt,
        "suggested_prompt": data.get("suggested_prompt", ""),
        "reasoning": data.get("reasoning", ""),
        "failed_cases_analyzed": len(failed_cases),
    }
