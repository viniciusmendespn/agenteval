"""
Router /chat — assistente conversacional com function calling (Fusion API).
Permite criar agentes, perfis, casos de teste, iniciar runs e consultar o sistema.
"""
import json
import os
import threading
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from openai import AzureOpenAI
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Agent, EvaluationProfile, TestCase, TestRun
from .runs import _execute_run
from ..workspace import WorkspaceContext, get_current_workspace

router = APIRouter(prefix="/chat", tags=["chat"])

# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Você é o assistente do AgentEval. Responda SEMPRE em português, de forma direta e curta.

Regras:
- Respostas curtas. Sem introduções, sem resumos finais, sem listas longas desnecessárias.
- Se faltar informação para criar algo, assuma valores sensatos e execute sem perguntar.
- Defaults ao criar agente: connection_type=http, request_body={"message":"{{message}}"}, output_field=response, api_key="".
- Defaults ao criar perfil: relevancy ON (threshold 0.7), demais métricas OFF.
- Defaults ao criar caso de teste: expected_output e context vazios.
- hallucination/toxicity/bias: score 0 = ótimo, score 1 = péssimo.
"""

# ── Definição das tools ───────────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_overview",
            "description": "Retorna um resumo geral do sistema: totais de agentes, casos de teste, runs e datasets; score médio; taxa de aprovação; runs recentes.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_agents",
            "description": "Lista todos os agentes cadastrados.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_agent",
            "description": "Cria um novo agente no sistema.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Nome do agente"},
                    "url": {"type": "string", "description": "URL do endpoint do agente"},
                    "api_key": {"type": "string", "description": "Chave de API (pode ser string vazia)"},
                    "connection_type": {"type": "string", "enum": ["http", "sse"], "description": "Tipo de conexão: http (padrão) ou sse (streaming)"},
                    "request_body": {"type": "string", "description": "Template JSON do body da requisição. Use {{message}} onde a mensagem deve ir. Padrão: {\"message\": \"{{message}}\"}"},
                    "output_field": {"type": "string", "description": "Caminho para extrair a resposta do JSON (ex: response, data.text). Padrão: response"},
                },
                "required": ["name", "url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_profiles",
            "description": "Lista todos os perfis de avaliação cadastrados.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_profile",
            "description": "Cria um novo perfil de avaliação com as métricas desejadas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Nome do perfil"},
                    "use_relevancy": {"type": "boolean", "description": "Ativar métrica de relevância (padrão: true)"},
                    "relevancy_threshold": {"type": "number", "description": "Limiar de relevância 0-1 (padrão: 0.7)"},
                    "use_hallucination": {"type": "boolean", "description": "Ativar detecção de alucinação (lower-is-better)"},
                    "hallucination_threshold": {"type": "number", "description": "Limiar de alucinação 0-1 (padrão: 0.5)"},
                    "use_toxicity": {"type": "boolean", "description": "Ativar detecção de toxicidade (lower-is-better)"},
                    "toxicity_threshold": {"type": "number", "description": "Limiar de toxicidade 0-1 (padrão: 0.3)"},
                    "use_bias": {"type": "boolean", "description": "Ativar detecção de viés (lower-is-better)"},
                    "bias_threshold": {"type": "number", "description": "Limiar de viés 0-1 (padrão: 0.3)"},
                    "use_faithfulness": {"type": "boolean", "description": "Ativar métrica de fidelidade"},
                    "faithfulness_threshold": {"type": "number", "description": "Limiar de fidelidade 0-1 (padrão: 0.7)"},
                    "use_latency": {"type": "boolean", "description": "Ativar avaliação de latência"},
                    "latency_threshold_ms": {"type": "integer", "description": "Limiar de latência em milissegundos (padrão: 5000)"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_test_cases",
            "description": "Lista todos os casos de teste cadastrados.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_test_case",
            "description": "Cria um novo caso de teste.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Título do caso de teste"},
                    "input": {"type": "string", "description": "Mensagem que será enviada ao agente"},
                    "expected_output": {"type": "string", "description": "Resposta esperada (opcional, melhora a avaliação)"},
                    "context": {"type": "array", "items": {"type": "string"}, "description": "Lista de strings de contexto (opcional, usada para métricas como faithfulness)"},
                    "tags": {"type": "string", "description": "Tags separadas por vírgula (opcional)"},
                },
                "required": ["title", "input"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_run",
            "description": "Inicia uma execução de avaliação: aplica um perfil a um conjunto de casos de teste usando um agente específico.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "integer", "description": "ID do agente a ser avaliado"},
                    "profile_id": {"type": "integer", "description": "ID do perfil de avaliação a usar"},
                    "test_case_ids": {"type": "array", "items": {"type": "integer"}, "description": "Lista de IDs dos casos de teste. Se não informada, usa todos os casos disponíveis."},
                },
                "required": ["agent_id", "profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_runs",
            "description": "Lista as execuções mais recentes com status e score geral.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Quantidade de runs a retornar (padrão: 10)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_agent_timeline",
            "description": "Retorna a evolução de um agente ao longo do tempo: scores e métricas de todas as suas execuções concluídas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "integer", "description": "ID do agente"},
                },
                "required": ["agent_id"],
            },
        },
    },
]

# ── Implementação das tools ───────────────────────────────────────────────────

def _run_tool(name: str, args: dict, db: Session, workspace_id: int) -> str:
    try:
        if name == "get_overview":
            return _tool_get_overview(db, workspace_id)
        if name == "list_agents":
            return _tool_list_agents(db, workspace_id)
        if name == "create_agent":
            return _tool_create_agent(args, db, workspace_id)
        if name == "list_profiles":
            return _tool_list_profiles(db, workspace_id)
        if name == "create_profile":
            return _tool_create_profile(args, db, workspace_id)
        if name == "list_test_cases":
            return _tool_list_test_cases(db, workspace_id)
        if name == "create_test_case":
            return _tool_create_test_case(args, db, workspace_id)
        if name == "start_run":
            return _tool_start_run(args, db, workspace_id)
        if name == "list_runs":
            return _tool_list_runs(args, db, workspace_id)
        if name == "get_agent_timeline":
            return _tool_get_agent_timeline(args, db, workspace_id)
        return f"Tool desconhecida: {name}"
    except Exception as e:
        return f"Erro ao executar {name}: {str(e)}"


def _tool_get_overview(db: Session, workspace_id: int) -> str:
    from sqlalchemy import func
    from ..models import TestResult, Dataset
    agents = db.query(func.count(Agent.id)).filter(Agent.workspace_id == workspace_id).scalar()
    test_cases = db.query(func.count(TestCase.id)).filter(TestCase.workspace_id == workspace_id).scalar()
    runs = db.query(func.count(TestRun.id)).filter(TestRun.workspace_id == workspace_id).scalar()
    datasets = db.query(func.count(Dataset.id)).filter(Dataset.workspace_id == workspace_id).scalar()

    completed = db.query(TestRun).filter(
        TestRun.workspace_id == workspace_id, TestRun.status == "completed", TestRun.overall_score.isnot(None)
    ).order_by(TestRun.created_at.desc()).limit(5).all()

    scores = [r.overall_score for r in completed if r.overall_score is not None]
    avg = round(sum(scores) / len(scores), 4) if scores else None

    run_ids = [r.id for r in db.query(TestRun.id).filter(TestRun.workspace_id == workspace_id).all()]
    total_results = db.query(func.count(TestResult.id)).filter(TestResult.run_id.in_(run_ids)).scalar() or 0
    passed_results = db.query(func.count(TestResult.id)).filter(TestResult.run_id.in_(run_ids), TestResult.passed == True).scalar() or 0
    pass_rate = round(passed_results / total_results * 100, 1) if total_results > 0 else None

    agent_names = {a.id: a.name for a in db.query(Agent).filter(Agent.workspace_id == workspace_id).all()}
    recent = [
        f"Run #{r.id} — {agent_names.get(r.agent_id, '?')} — {r.status} — score: {r.overall_score}"
        for r in db.query(TestRun).filter(TestRun.workspace_id == workspace_id).order_by(TestRun.created_at.desc()).limit(3).all()
    ]

    return json.dumps({
        "totais": {"agentes": agents, "casos_de_teste": test_cases, "execucoes": runs, "datasets": datasets},
        "score_medio": avg,
        "taxa_aprovacao_pct": pass_rate,
        "runs_recentes": recent,
    }, ensure_ascii=False)


def _tool_list_agents(db: Session, workspace_id: int) -> str:
    agents = db.query(Agent).filter(Agent.workspace_id == workspace_id).all()
    if not agents:
        return "Nenhum agente cadastrado."
    return json.dumps(
        [{"id": a.id, "nome": a.name, "url": a.url, "tipo": a.connection_type} for a in agents],
        ensure_ascii=False,
    )


def _tool_create_agent(args: dict, db: Session, workspace_id: int) -> str:
    agent = Agent(
        name=args["name"],
        url=args["url"],
        api_key=args.get("api_key", ""),
        connection_type=args.get("connection_type", "http"),
        request_body=args.get("request_body", '{"message": "{{message}}"}'),
        output_field=args.get("output_field", "response"),
        workspace_id=workspace_id,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return json.dumps({"id": agent.id, "nome": agent.name, "url": agent.url}, ensure_ascii=False)


def _tool_list_profiles(db: Session, workspace_id: int) -> str:
    profiles = db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == workspace_id).all()
    if not profiles:
        return "Nenhum perfil cadastrado."
    result = []
    for p in profiles:
        metrics = []
        if p.use_relevancy: metrics.append(f"relevancy≥{p.relevancy_threshold}")
        if p.use_hallucination: metrics.append(f"hallucination≤{p.hallucination_threshold}")
        if p.use_toxicity: metrics.append(f"toxicity≤{p.toxicity_threshold}")
        if p.use_bias: metrics.append(f"bias≤{p.bias_threshold}")
        if p.use_faithfulness: metrics.append(f"faithfulness≥{p.faithfulness_threshold}")
        if p.use_latency: metrics.append(f"latency≤{p.latency_threshold_ms}ms")
        result.append({"id": p.id, "nome": p.name, "metricas": metrics})
    return json.dumps(result, ensure_ascii=False)


def _tool_create_profile(args: dict, db: Session, workspace_id: int) -> str:
    profile = EvaluationProfile(
        name=args["name"],
        use_relevancy=args.get("use_relevancy", True),
        relevancy_threshold=args.get("relevancy_threshold", 0.7),
        use_hallucination=args.get("use_hallucination", False),
        hallucination_threshold=args.get("hallucination_threshold", 0.5),
        use_toxicity=args.get("use_toxicity", False),
        toxicity_threshold=args.get("toxicity_threshold", 0.3),
        use_bias=args.get("use_bias", False),
        bias_threshold=args.get("bias_threshold", 0.3),
        use_faithfulness=args.get("use_faithfulness", False),
        faithfulness_threshold=args.get("faithfulness_threshold", 0.7),
        use_latency=args.get("use_latency", False),
        latency_threshold_ms=args.get("latency_threshold_ms", 5000),
        workspace_id=workspace_id,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return json.dumps({"id": profile.id, "nome": profile.name}, ensure_ascii=False)


def _tool_list_test_cases(db: Session, workspace_id: int) -> str:
    cases = db.query(TestCase).filter(TestCase.workspace_id == workspace_id).all()
    if not cases:
        return "Nenhum caso de teste cadastrado."
    return json.dumps(
        [{"id": tc.id, "titulo": tc.title, "input": tc.input[:80] + ("…" if len(tc.input) > 80 else "")} for tc in cases],
        ensure_ascii=False,
    )


def _tool_create_test_case(args: dict, db: Session, workspace_id: int) -> str:
    tc = TestCase(
        title=args["title"],
        input=args["input"],
        expected_output=args.get("expected_output"),
        context=args.get("context"),
        tags=args.get("tags"),
        workspace_id=workspace_id,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return json.dumps({"id": tc.id, "titulo": tc.title}, ensure_ascii=False)


def _tool_start_run(args: dict, db: Session, workspace_id: int) -> str:
    agent = db.query(Agent).filter(Agent.id == args["agent_id"], Agent.workspace_id == workspace_id).first()
    if not agent:
        return f"Agente ID {args['agent_id']} não encontrado."
    profile = db.query(EvaluationProfile).filter(
        EvaluationProfile.id == args["profile_id"],
        EvaluationProfile.workspace_id == workspace_id,
    ).first()
    if not profile:
        return f"Perfil ID {args['profile_id']} não encontrado."

    tc_ids = args.get("test_case_ids")
    if not tc_ids:
        tc_ids = [tc.id for tc in db.query(TestCase).filter(TestCase.workspace_id == workspace_id).all()]
    if not tc_ids:
        return "Nenhum caso de teste disponível para executar."
    found_case_ids = {
        tc.id for tc in db.query(TestCase).filter(
            TestCase.id.in_(tc_ids),
            TestCase.workspace_id == workspace_id,
        ).all()
    }
    if len(found_case_ids) != len(set(tc_ids)):
        return "Um ou mais casos de teste não existem neste workspace."

    run = TestRun(
        agent_id=args["agent_id"],
        profile_id=args["profile_id"],
        test_case_ids=tc_ids,
        status="running",
        workspace_id=workspace_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Executa em background via thread (sem depender do BackgroundTasks do FastAPI)
    t = threading.Thread(target=_execute_run, args=(run.id,), daemon=True)
    t.start()

    return json.dumps({
        "run_id": run.id,
        "agente": agent.name,
        "perfil": profile.name,
        "casos_de_teste": len(tc_ids),
        "status": "running",
        "mensagem": f"Execução #{run.id} iniciada em background. Acompanhe em /runs/{run.id}.",
    }, ensure_ascii=False)


def _tool_list_runs(args: dict, db: Session, workspace_id: int) -> str:
    limit = args.get("limit", 10)
    runs = db.query(TestRun).filter(TestRun.workspace_id == workspace_id).order_by(TestRun.created_at.desc()).limit(limit).all()
    if not runs:
        return "Nenhuma execução encontrada."
    agent_names = {a.id: a.name for a in db.query(Agent).filter(Agent.workspace_id == workspace_id).all()}
    return json.dumps(
        [
            {
                "id": r.id,
                "agente": agent_names.get(r.agent_id, f"#{r.agent_id}"),
                "status": r.status,
                "score": r.overall_score,
                "casos": len(r.test_case_ids or []),
                "criado_em": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ],
        ensure_ascii=False,
    )


def _tool_get_agent_timeline(args: dict, db: Session, workspace_id: int) -> str:
    from ..services.evaluator import LOWER_IS_BETTER
    agent = db.query(Agent).filter(Agent.id == args["agent_id"], Agent.workspace_id == workspace_id).first()
    if not agent:
        return f"Agente ID {args['agent_id']} não encontrado."

    from ..models import TestResult
    runs = (
        db.query(TestRun)
        .filter(TestRun.workspace_id == workspace_id, TestRun.agent_id == args["agent_id"], TestRun.status == "completed")
        .order_by(TestRun.created_at.asc())
        .all()
    )
    if not runs:
        return f"Agente '{agent.name}' ainda não tem execuções concluídas."

    points = []
    for run in runs:
        results = db.query(TestResult).filter(TestResult.run_id == run.id).all()
        metric_avgs: dict = {}
        for res in results:
            for m, s in (res.scores or {}).items():
                metric_avgs.setdefault(m, []).append(s)
        metrics = {}
        for m, vals in metric_avgs.items():
            avg = sum(vals) / len(vals)
            metrics[m] = round(1.0 - avg if m in LOWER_IS_BETTER else avg, 4)
        points.append({
            "run_id": run.id,
            "data": run.created_at.isoformat() if run.created_at else None,
            "score_geral": run.overall_score,
            "metricas": metrics,
            "aprovados": sum(1 for r in results if r.passed),
            "total": len(results),
        })

    return json.dumps({"agente": agent.name, "evolucao": points}, ensure_ascii=False)


# ── Endpoint principal ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


def _get_llm_client():
    return AzureOpenAI(
        azure_endpoint=os.getenv("JUDGE_BASE_URL"),
        api_key=os.getenv("JUDGE_API_KEY", ""),
        api_version=os.getenv("JUDGE_API_VERSION", "2025-03-01-preview"),
    )


@router.post("/", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    client = _get_llm_client()
    model = os.getenv("JUDGE_MODEL", "gpt-4")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages]

    # Loop de tool calling (máx 5 rodadas)
    for _ in range(5):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            # Adiciona a mensagem do assistente com os tool_calls
            messages.append(choice.message)

            # Executa cada tool e devolve os resultados
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                result = _run_tool(tc.function.name, args, db, workspace.workspace_id)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
        else:
            # Resposta final em texto
            return ChatResponse(reply=choice.message.content or "")

    return ChatResponse(reply="Não consegui completar a operação após várias tentativas.")
