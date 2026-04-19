"""
Router /chat — assistente conversacional com function calling (Fusion API).
Permite criar agentes, perfis, casos de teste, iniciar runs e consultar o sistema.
"""
import json
import os
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from openai import AzureOpenAI
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Agent, EvaluationProfile, TestCase, TestRun
from ..queue import get_task_queue
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
- Para testar um agente (tool test_agent): SEMPRE peça o contexto do agente (o que ele faz, como deve se comportar) se a mensagem não o incluir. Não chame test_agent sem esse contexto.
- Ao usar test_agent sem profile_id, o perfil é selecionado ou criado automaticamente.
- Após test_agent retornar, NÃO diga que a execução foi iniciada. Os cenários foram criados mas a execução ainda não começou. Apresente o link retornado como [Revisar e executar](/runs/new?...) para que o usuário revise antes de disparar.
- Ao mencionar páginas do sistema, use SEMPRE links markdown clicáveis. Exemplos: [Ver execução #20](/runs/20), [Agentes](/agents), [Datasets](/datasets). Nunca escreva o caminho como texto simples.
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
            "description": "Cria um novo caso de teste. Para multi-turn, forneça o campo turns em vez de input.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Título do caso de teste"},
                    "input": {"type": "string", "description": "Mensagem que será enviada ao agente (single-turn). Omitir se usar turns."},
                    "expected_output": {"type": "string", "description": "Resposta esperada (opcional, melhora a avaliação)"},
                    "context": {"type": "array", "items": {"type": "string"}, "description": "Lista de strings de contexto (opcional, usada para métricas como faithfulness)"},
                    "tags": {"type": "string", "description": "Tags separadas por vírgula (opcional)"},
                    "turns": {
                        "type": "array",
                        "description": "Sequência de turnos para caso multi-turn (substitui input).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "string", "description": "Mensagem do usuário neste turno"},
                                "expected_output": {"type": "string", "description": "Resposta esperada neste turno (opcional)"},
                            },
                            "required": ["input"],
                        },
                    },
                },
                "required": ["title"],
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
    {
        "type": "function",
        "function": {
            "name": "test_agent",
            "description": "Gera automaticamente cenários de teste multi-turn para um agente, cria os casos de teste no sistema e inicia uma execução de avaliação. Use quando o usuário pedir para testar um agente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "integer", "description": "ID do agente a ser testado"},
                    "agent_context": {"type": "string", "description": "Descrição do agente: o que faz, como deve se comportar, restrições e casos de uso esperados."},
                    "profile_id": {"type": "integer", "description": "ID do perfil de avaliação a usar (opcional — se omitido, usa o primeiro disponível ou cria um padrão)."},
                    "n_scenarios": {"type": "integer", "description": "Número de cenários de teste a gerar (padrão: 5)."},
                },
                "required": ["agent_id", "agent_context"],
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
        if name == "test_agent":
            return _tool_test_agent(args, db, workspace_id)
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
    turns = args.get("turns")
    input_text = args.get("input") or (turns[0]["input"] if turns else "")
    tc = TestCase(
        title=args["title"],
        input=input_text,
        expected_output=args.get("expected_output"),
        context=args.get("context"),
        tags=args.get("tags"),
        turns=turns,
        workspace_id=workspace_id,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return json.dumps({"id": tc.id, "titulo": tc.title, "turnos": len(turns) if turns else None}, ensure_ascii=False)


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

    get_task_queue().enqueue("execute_run", {"run_id": run.id})

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


def _generate_test_scenarios(agent_name: str, context: str, n: int) -> list:
    """Chama o LLM para gerar n cenários de teste multi-turn para o agente."""
    import re as _re
    client = _get_llm_client()
    model = os.getenv("JUDGE_MODEL", "gpt-4")
    prompt = (
        f'Crie {n} cenários de teste multi-turn para o agente "{agent_name}".\n\n'
        f"Contexto do agente:\n{context}\n\n"
        f'Retorne JSON com chave "scenarios": array de {n} objetos, cada um com:\n'
        '- "title": título descritivo do cenário\n'
        '- "tags": tags separadas por vírgula\n'
        '- "turns": array de 2 a 4 objetos {"input": string, "expected_output": string ou null}\n\n'
        "Cubra cenários de: fluxo feliz, caso extremo, ambiguidade, informação incompleta, comportamento inesperado.\n"
        "Retorne apenas o JSON, sem explicações."
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        content = resp.choices[0].message.content.strip()
        m = _re.search(r'\{.*\}', content, _re.DOTALL)
        if m:
            data = json.loads(m.group())
            return data.get("scenarios", [])[:n]
    except Exception:
        pass
    return []


def _tool_test_agent(args: dict, db: Session, workspace_id: int) -> str:
    agent = db.query(Agent).filter(Agent.id == args["agent_id"], Agent.workspace_id == workspace_id).first()
    if not agent:
        return f"Agente ID {args['agent_id']} não encontrado."

    n = args.get("n_scenarios", 5)
    context = args["agent_context"]
    if agent.system_prompt:
        context = f"System prompt do agente:\n{agent.system_prompt}\n\nContexto adicional:\n{context}"
    scenarios = _generate_test_scenarios(agent.name, context, n)
    if not scenarios:
        return "Não foi possível gerar cenários. Tente detalhar mais o contexto do agente."

    # Criar casos de teste com turns
    tc_ids = []
    for s in scenarios:
        turns = s.get("turns") or []
        tc = TestCase(
            title=s.get("title", f"Cenário auto-gerado {len(tc_ids) + 1}"),
            input=turns[0]["input"] if turns else s.get("title", ""),
            turns=turns if turns else None,
            tags=s.get("tags", "auto-gerado,multi-turn"),
            workspace_id=workspace_id,
        )
        db.add(tc)
        db.commit()
        db.refresh(tc)
        tc_ids.append(tc.id)

    # Selecionar ou criar perfil de avaliação
    profile_id = args.get("profile_id")
    if profile_id:
        profile = db.query(EvaluationProfile).filter(
            EvaluationProfile.id == profile_id,
            EvaluationProfile.workspace_id == workspace_id,
        ).first()
        if not profile:
            return f"Perfil ID {profile_id} não encontrado."
    else:
        profile = db.query(EvaluationProfile).filter(
            EvaluationProfile.workspace_id == workspace_id,
        ).first()
        if not profile:
            profile = EvaluationProfile(
                name="Padrão (auto)",
                use_relevancy=True,
                relevancy_threshold=0.7,
                use_hallucination=True,
                hallucination_threshold=0.5,
                workspace_id=workspace_id,
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)

    cases_param = ",".join(str(i) for i in tc_ids)
    link = f"/runs/new?agent={agent.id}&profile={profile.id}&cases={cases_param}"

    return json.dumps({
        "agente": agent.name,
        "perfil": profile.name,
        "cenarios_criados": len(tc_ids),
        "link": link,
        "mensagem": f"Criei {len(tc_ids)} cenários de teste. Acesse o link para revisar e disparar a execução.",
        "cenarios": [{"id": tc_ids[i], "titulo": s.get("title", "")} for i, s in enumerate(scenarios)],
    }, ensure_ascii=False)


# ── Endpoint principal ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    tokens: int = 0


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

    total_tokens = 0

    # Loop de tool calling (máx 5 rodadas)
    for _ in range(5):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        if response.usage:
            total_tokens += response.usage.total_tokens
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
            return ChatResponse(reply=choice.message.content or "", tokens=total_tokens)

    return ChatResponse(reply="Não consegui completar a operação após várias tentativas.", tokens=total_tokens)
