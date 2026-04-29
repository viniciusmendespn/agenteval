import json
from datetime import datetime
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Agent, TestRun, TestResult, AgentPromptVersion, PromptVersionComparison
from ..schemas import AgentCreate, AgentOut, AgentPromptVersionOut
from ..services.judge_llm import resolve_task_judge
from ..workspace import WorkspaceContext, get_current_workspace, require_writer

router = APIRouter(prefix="/agents", tags=["agents"])


def _generate_change_summary(version_id: int, prev_prompt: str, new_prompt: str, workspace_id: int = None):
    """Background task: gera resumo LLM das diferenças entre duas versões do prompt."""
    db = SessionLocal()
    try:
        judge = resolve_task_judge(db, workspace_id, "analysis")
        if judge is None:
            return
        prompt = (
            "Você é um especialista em prompts de IA. Compare as duas versões do system prompt abaixo "
            "e resuma em 1-2 frases em português quais foram as principais alterações funcionais. "
            "Seja objetivo e direto. Responda apenas com o resumo, sem introduções.\n\n"
            f"VERSÃO ANTERIOR:\n{prev_prompt}\n\n"
            f"NOVA VERSÃO:\n{new_prompt}"
        )
        summary, _ = judge.generate(prompt)
        ver = db.get(AgentPromptVersion, version_id)
        if ver:
            ver.change_summary = str(summary).strip()
            db.commit()
    except Exception:
        pass
    finally:
        db.close()


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
    db.flush()

    if agent.system_prompt:
        db.add(AgentPromptVersion(
            agent_id=agent.id,
            workspace_id=workspace.workspace_id,
            system_prompt=agent.system_prompt,
            version_num=1,
            status="active",
            created_at=datetime.utcnow(),
        ))

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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    new_prompt = data.system_prompt
    if agent.system_prompt and new_prompt != agent.system_prompt:
        prev_prompt = agent.system_prompt

        current_active = db.query(AgentPromptVersion).filter(
            AgentPromptVersion.agent_id == agent_id,
            AgentPromptVersion.status == "active",
        ).first()
        if current_active:
            current_active.status = "archived"

        max_v = db.query(func.max(AgentPromptVersion.version_num)).filter(
            AgentPromptVersion.agent_id == agent_id
        ).scalar() or 0
        new_ver = AgentPromptVersion(
            agent_id=agent_id,
            workspace_id=workspace.workspace_id,
            system_prompt=new_prompt,
            version_num=max_v + 1,
            status="active",
            created_at=datetime.utcnow(),
        )
        db.add(new_ver)
        db.flush()
        new_ver_id = new_ver.id
        background_tasks.add_task(_generate_change_summary, new_ver_id, prev_prompt, new_prompt, workspace.workspace_id)
    elif new_prompt and not agent.system_prompt:
        new_ver = AgentPromptVersion(
            agent_id=agent_id,
            workspace_id=workspace.workspace_id,
            system_prompt=new_prompt,
            version_num=1,
            status="active",
            created_at=datetime.utcnow(),
        )
        db.add(new_ver)

    for field, value in data.model_dump().items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/{agent_id}/prompt-versions", response_model=list[AgentPromptVersionOut])
def list_prompt_versions(
    agent_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    return (
        db.query(AgentPromptVersion)
        .filter(AgentPromptVersion.agent_id == agent_id)
        .order_by(AgentPromptVersion.created_at.desc())
        .all()
    )


@router.post("/{agent_id}/prompt-versions/{ver_id}/restore", response_model=AgentOut)
def restore_prompt_version(
    agent_id: int,
    ver_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Restaura uma versão histórica: cria nova versão ativa com o conteúdo da versão alvo."""
    require_writer(workspace)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    version = db.query(AgentPromptVersion).filter(
        AgentPromptVersion.id == ver_id,
        AgentPromptVersion.agent_id == agent_id,
    ).first()
    if not version:
        raise HTTPException(404, "Versão não encontrada")

    prev_prompt = agent.system_prompt or ""

    current_active = db.query(AgentPromptVersion).filter(
        AgentPromptVersion.agent_id == agent_id,
        AgentPromptVersion.status == "active",
    ).first()
    if current_active:
        current_active.status = "archived"

    max_v = db.query(func.max(AgentPromptVersion.version_num)).filter(
        AgentPromptVersion.agent_id == agent_id
    ).scalar() or 0
    new_ver = AgentPromptVersion(
        agent_id=agent_id,
        workspace_id=workspace.workspace_id,
        system_prompt=version.system_prompt,
        version_num=max_v + 1,
        status="active",
        label=f"Restaurado da v{version.version_num}",
        created_at=datetime.utcnow(),
    )
    db.add(new_ver)
    db.flush()
    new_ver_id = new_ver.id
    agent.system_prompt = version.system_prompt
    db.commit()
    db.refresh(agent)
    if prev_prompt:
        background_tasks.add_task(_generate_change_summary, new_ver_id, prev_prompt, version.system_prompt, workspace.workspace_id)
    return agent


@router.get("/{agent_id}/prompt-versions/compare")
def compare_prompt_versions(
    agent_id: int,
    v1: int,
    v2: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    """Retorna duas versões e um resumo LLM das diferenças. O resumo é cacheado no banco."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")

    ver_a = db.query(AgentPromptVersion).filter(
        AgentPromptVersion.id == v1, AgentPromptVersion.agent_id == agent_id
    ).first()
    ver_b = db.query(AgentPromptVersion).filter(
        AgentPromptVersion.id == v2, AgentPromptVersion.agent_id == agent_id
    ).first()
    if not ver_a or not ver_b:
        raise HTTPException(404, "Uma ou ambas as versões não foram encontradas")

    # Verifica cache (ordem canônica: menor id primeiro)
    lo, hi = min(v1, v2), max(v1, v2)
    cached = db.query(PromptVersionComparison).filter(
        PromptVersionComparison.v1_id == lo,
        PromptVersionComparison.v2_id == hi,
    ).first()

    summary = cached.summary if cached else None

    if summary is None:
        judge = resolve_task_judge(db, workspace.workspace_id, "analysis")
        if judge:
            try:
                prompt = (
                    "Você é um especialista em prompts de IA. Compare as duas versões do system prompt abaixo "
                    "e resuma em 1-2 frases em português quais foram as principais diferenças funcionais. "
                    "Seja objetivo e direto. Responda apenas com o resumo, sem introduções.\n\n"
                    f"VERSÃO A (v{ver_a.version_num}):\n{ver_a.system_prompt}\n\n"
                    f"VERSÃO B (v{ver_b.version_num}):\n{ver_b.system_prompt}"
                )
                result, _ = judge.generate(prompt)
                summary = str(result).strip()
                db.add(PromptVersionComparison(
                    v1_id=lo, v2_id=hi, summary=summary,
                    created_at=datetime.utcnow(),
                ))
                db.commit()
            except Exception:
                pass

    return {
        "version_a": AgentPromptVersionOut.model_validate(ver_a),
        "version_b": AgentPromptVersionOut.model_validate(ver_b),
        "summary": summary,
    }


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

    judge = resolve_task_judge(db, workspace.workspace_id, "analysis")
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


class PlaygroundChatRequest(BaseModel):
    message: str
    session_id: str = ""


@router.post("/{agent_id}/chat")
def playground_chat(
    agent_id: int,
    req: PlaygroundChatRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.workspace_id == workspace.workspace_id).first()
    if not agent:
        raise HTTPException(404, "Agente não encontrado")
    from ..services.agent_caller import call_agent
    reply = call_agent(
        url=agent.url,
        api_key=agent.api_key,
        message=req.message,
        request_body=agent.request_body,
        output_field=agent.output_field,
        connection_type=agent.connection_type,
        session_id=req.session_id,
        token_url=agent.token_url,
        token_request_body=agent.token_request_body,
        token_output_field=agent.token_output_field,
        token_header_name=agent.token_header_name,
        ssl_verify=agent.ssl_verify or False,
    )
    return {"reply": reply, "session_id": req.session_id}
