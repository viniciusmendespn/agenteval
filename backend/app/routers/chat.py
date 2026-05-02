"""
Router /chat — assistente conversacional com function calling (Fusion API).
Permite criar agentes, perfis, casos de teste, simulações, iniciar runs e consultar o sistema.
"""
import json
import re as _re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import AzureOpenAI, OpenAI
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Agent, EvaluationProfile, LLMProvider, TestCase, TestRun
from ..queue import get_task_queue
from ..workspace import WorkspaceContext, get_current_workspace

router = APIRouter(prefix="/chat", tags=["chat"])

# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT_BASE = """Você é um assistente de QA no Santander AgentEval.

Regras INEGOCIÁVEIS de resposta:
- SEMPRE em português.
- MÁXIMO 2 frases por resposta de texto. Sem introduções, sem resumos, sem "claro!", sem "ótimo!".
- Links markdown para páginas: [Casos de Teste](/test-cases), [Simulações](/simulations), [Runs](/runs).
- hallucination/toxicity/bias: score 0 = ótimo (lower-is-better).

AGENTES CADASTRADOS (use diretamente — NÃO chame list_agents):
{agents_list}

FOCO EM REGRAS DE NEGÓCIO (obrigatório ao gerar cenários):
Pense em: fluxos de aprovação/recusa, portabilidade, cancelamento, perfis reais de cliente (idoso,
negativado, primeiro emprego), casos de borda nos processos (prazo vencido, documentação incompleta),
escapes de escopo. NUNCA gere cenários sobre: formato inválido, campo vazio, validação de CPF/dados.

REGRA CRÍTICA: Use SEMPRE `suggest_test_cases` ou `suggest_simulations`. Nunca gere cenários em texto livre.
- Se o usuário pedir casos de teste via texto: identifique o agente e chame `suggest_test_cases`.
- Se o usuário pedir simulações via texto: identifique o agente e chame `suggest_simulations`.
- Após a tool retornar cenários, inclua o JSON no formato:
  ```json
  {"__type":"test_case_suggestions","agent_id":<id>,"cases":[...]}
  ```
  ou
  ```json
  {"__type":"simulation_suggestions","agent_id":<id>,"cases":[...]}
  ```
- NÃO crie nada automaticamente. Use `create_test_case` SOMENTE quando o usuário pedir explicitamente.

Defaults ao criar agente: connection_type=http, request_body={"message":"{{message}}"}, output_field=response.
"""


def _build_system_prompt(db: Session, workspace_id: int) -> str:
    agents = db.query(Agent).filter(Agent.workspace_id == workspace_id).all()
    if agents:
        lines = [f"- ID {a.id}: {a.name}" for a in agents]
        agents_list = "\n".join(lines)
    else:
        agents_list = "(nenhum agente cadastrado ainda)"
    return SYSTEM_PROMPT_BASE.replace("{agents_list}", agents_list)

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
            "name": "suggest_test_cases",
            "description": "Gera sugestões de casos de teste para um agente usando IA. Retorna os casos SEM criar nada — o usuário escolhe quais criar. Use quando o usuário pedir sugestões ou quiser testar um agente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "integer", "description": "ID do agente"},
                    "agent_context": {"type": "string", "description": "Contexto ou instruções do agente (opcional se ele tiver system prompt cadastrado)."},
                    "n_scenarios": {"type": "integer", "description": "Número de sugestões a gerar (padrão: 5)."},
                },
                "required": ["agent_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_simulations",
            "description": "Gera sugestões de cenários de simulação de conversa para um agente, focados em regras de negócio. Cada cenário vira uma simulação onde uma IA age como usuário real. Use quando o usuário quiser simular conversas com o agente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "integer", "description": "ID do agente"},
                    "agent_context": {"type": "string", "description": "Contexto adicional se o agente não tiver system prompt cadastrado."},
                    "n_scenarios": {"type": "integer", "description": "Número de cenários a gerar (padrão: 5)."},
                },
                "required": ["agent_id"],
            },
        },
    },
]

# ── Implementação das tools ───────────────────────────────────────────────────

def _run_tool(name: str, args: dict, db: Session, workspace_id: int, client, model: str) -> str:
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
        if name == "suggest_test_cases":
            return _tool_suggest_test_cases(args, db, workspace_id, client, model)
        if name == "suggest_simulations":
            return _tool_suggest_simulations(args, db, workspace_id, client, model)
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


def _generate_test_scenarios(agent_name: str, context: str, n: int, client, model: str) -> list:
    """Chama o LLM para gerar n casos de teste ricos para o agente."""
    prompt = (
        f'Crie {n} casos de teste para o agente "{agent_name}".\n\n'
        f"Contexto/instruções do agente:\n{context}\n\n"
        "FOCO OBRIGATÓRIO em regras de negócio: fluxos de aprovação/recusa, portabilidade, cancelamento, "
        "perfis reais de cliente (idoso, negativado, primeiro emprego), prazos, documentação incompleta, escapes de escopo.\n"
        "NUNCA crie cenários sobre: formato inválido, campo obrigatório vazio, validação técnica de CPF/dados.\n\n"
        f'Retorne JSON com chave "scenarios": array de exatamente {n} objetos, cada um com:\n'
        '- "title": título descritivo do caso\n'
        '- "type": "happy_path" | "edge_case" | "scope_escape" | "ambiguity" | "error"\n'
        '- "input": mensagem do usuário (string) — para single-turn\n'
        '- "expected_output": resposta esperada pelo agente (string realista baseada no contexto)\n'
        '- "context": array de 2-3 strings com fatos do contexto relevantes para avaliar este caso\n'
        '- "tags": string com tags separadas por vírgula\n'
        '- "turns": null para single-turn, ou array de 2-4 objetos {"input": string, "expected_output": string} para multi-turn\n\n'
        f"Distribua os tipos equilibradamente entre happy_path, edge_case, scope_escape e ambiguity para {n} casos.\n"
        "expected_output deve ser uma resposta realista e detalhada que o agente ideal daria.\n"
        "Para scope_escape, o usuário tenta fazer o agente sair do seu papel/escopo.\n"
        "Retorne APENAS o JSON válido, sem explicações ou markdown."
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


def _tool_suggest_test_cases(args: dict, db: Session, workspace_id: int, client, model: str) -> str:
    agent = db.query(Agent).filter(Agent.id == args["agent_id"], Agent.workspace_id == workspace_id).first()
    if not agent:
        return json.dumps({"error": f"Agente ID {args['agent_id']} não encontrado."}, ensure_ascii=False)

    agent_context = args.get("agent_context", "")
    context = ""
    if agent.system_prompt:
        context = agent.system_prompt
        if agent_context:
            context += f"\n\nContexto adicional:\n{agent_context}"
    elif agent_context:
        context = agent_context
    else:
        return json.dumps({
            "needs_context": True,
            "agent_id": agent.id,
            "agent_name": agent.name,
            "message": f"O agente '{agent.name}' não tem system prompt cadastrado. Peça ao usuário o contexto ou instruções do agente antes de gerar sugestões.",
        }, ensure_ascii=False)

    n = args.get("n_scenarios", 5)
    scenarios = _generate_test_scenarios(agent.name, context, n, client, model)
    if not scenarios:
        return json.dumps({"error": "Não foi possível gerar sugestões. Verifique se o LLM judge está configurado."}, ensure_ascii=False)

    return json.dumps({
        "agent_id": agent.id,
        "agent_name": agent.name,
        "cases": scenarios,
    }, ensure_ascii=False)


def _generate_simulation_scenarios(agent_name: str, context: str, n: int, client, model: str) -> list:
    """Chama o LLM para gerar n cenários de simulação com personas e instruções."""
    prompt = (
        f'Crie {n} cenários de simulação de conversa para o agente "{agent_name}".\n\n'
        f"Instruções/sistema do agente:\n{context}\n\n"
        "FOCO EXCLUSIVO em regras de negócio: aprovação/recusa, portabilidade, cancelamento, "
        "perfis reais de cliente com situações distintas (idoso sem letramento digital, cliente negativado, "
        "recém-admitido, urgência alta, documentação incompleta, recusa parcial).\n"
        "NUNCA crie cenários sobre: formato inválido, campo vazio, validação técnica.\n\n"
        f'Retorne JSON com chave "scenarios": array de exatamente {n} objetos, cada um com:\n'
        '- "title": título curto e descritivo do cenário\n'
        '- "persona": nome fictício, idade, perfil e contexto em 1 frase (ex: "Maria, 68 anos, aposentada do INSS, baixo letramento digital")\n'
        '- "scenario": situação de negócio sendo testada em 1 frase\n'
        '- "business_rule": qual regra de negócio específica este cenário valida\n'
        '- "instructions": instruções completas em pt-BR para o simulador agir como essa persona. '
        'Deve incluir: quem é, o que quer, como age emocionalmente, quais perguntas faz, como reage a respostas do agente. Mínimo 3 frases.\n'
        '- "tags": tags separadas por vírgula\n\n'
        "Varie personas em: idade, grau de letramento digital, estado emocional, nível de urgência.\n"
        "Retorne APENAS o JSON válido, sem markdown."
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


def _tool_suggest_simulations(args: dict, db: Session, workspace_id: int, client, model: str) -> str:
    agent = db.query(Agent).filter(Agent.id == args["agent_id"], Agent.workspace_id == workspace_id).first()
    if not agent:
        return json.dumps({"error": f"Agente ID {args['agent_id']} não encontrado."}, ensure_ascii=False)

    agent_context = args.get("agent_context", "")
    context = ""
    if agent.system_prompt:
        context = agent.system_prompt
        if agent_context:
            context += f"\n\nContexto adicional:\n{agent_context}"
    elif agent_context:
        context = agent_context
    else:
        return json.dumps({
            "needs_context": True,
            "agent_id": agent.id,
            "agent_name": agent.name,
        }, ensure_ascii=False)

    n = args.get("n_scenarios", 5)
    scenarios = _generate_simulation_scenarios(agent.name, context, n, client, model)
    if not scenarios:
        return json.dumps({"error": "Não foi possível gerar cenários. Verifique se o LLM judge está configurado."}, ensure_ascii=False)

    return json.dumps({
        "agent_id": agent.id,
        "agent_name": agent.name,
        "cases": scenarios,
    }, ensure_ascii=False)


# ── Fast path helpers ─────────────────────────────────────────────────────────

def _parse_agent_selection(msg: str):
    """Detecta 'Agente selecionado: X (ID: Y)' → (agent_id, agent_name) ou None."""
    m = _re.match(r'Agente selecionado: (.+?) \(ID: (\d+)\)', msg)
    return (int(m.group(2)), m.group(1)) if m else None


def _parse_mode_choice(msg: str):
    """Detecta 'Criar X para Y (ID: Z)' → ('test_cases'|'simulations', agent_id, agent_name) ou None."""
    m = _re.match(r'Criar casos de teste para (.+?) \(ID: (\d+)\)', msg)
    if m:
        return ('test_cases', int(m.group(2)), m.group(1))
    m = _re.match(r'Criar simulacoes para (.+?) \(ID: (\d+)\)', msg)
    if m:
        return ('simulations', int(m.group(2)), m.group(1))
    return None


# ── Endpoint principal ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    tokens: int = 0


# ── AWS Bedrock compatibility wrapper ─────────────────────────────────────────

class _BFakeToolCall:
    """Simula ChatCompletionMessageToolCall do OpenAI."""
    def __init__(self, tool_use_id: str, name: str, arguments: str):
        self.id = tool_use_id
        self.type = "function"
        self.function = type("F", (), {"name": name, "arguments": arguments})()

class _BFakeMessage:
    """Simula ChatCompletionMessage do OpenAI."""
    def __init__(self, role: str, content, tool_calls=None, bedrock_content=None):
        self.role = role
        self.content = content
        self.tool_calls = tool_calls
        self._bedrock_content = bedrock_content  # blocos originais para reenvio

class _BFakeChoice:
    def __init__(self, message, finish_reason: str):
        self.message = message
        self.finish_reason = finish_reason

class _BFakeUsage:
    def __init__(self, total_tokens: int):
        self.total_tokens = total_tokens

class _BFakeResponse:
    def __init__(self, resp: dict):
        output_msg = resp["output"]["message"]
        stop_reason = resp.get("stopReason", "end_turn")
        total = resp.get("usage", {}).get("totalTokens", 0)

        text_content = None
        tool_calls = None
        for block in output_msg.get("content", []):
            if "text" in block:
                text_content = block["text"]
            elif "toolUse" in block:
                tu = block["toolUse"]
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append(_BFakeToolCall(
                    tu["toolUseId"], tu["name"], json.dumps(tu["input"])
                ))

        finish = "tool_calls" if stop_reason == "tool_use" else "stop"
        msg = _BFakeMessage(
            role="assistant",
            content=text_content,
            tool_calls=tool_calls,
            bedrock_content=output_msg["content"],
        )
        self.choices = [_BFakeChoice(msg, finish)]
        self.usage = _BFakeUsage(total)


class BedrockCompat:
    """
    Wrapper boto3 que expõe client.chat.completions.create() compatível com OpenAI.
    Converte mensagens OpenAI ↔ Bedrock converse API automaticamente.
    """

    def __init__(self, provider):
        import boto3
        self._bc = boto3.client(
            "bedrock-runtime",
            region_name=provider.aws_region or "us-east-1",
            aws_access_key_id=provider.aws_access_key_id,
            aws_secret_access_key=provider.aws_secret_access_key,
            aws_session_token=provider.aws_session_token or None,
        )
        self._model = provider.model_name

        _self = self

        class _Completions:
            def create(self, model=None, messages=None, tools=None, **kw):
                return _self._create(messages=messages, tools=tools)

        class _Chat:
            completions = _Completions()

        self.chat = _Chat()

    def _create(self, messages, tools=None):
        bedrock_msgs = []
        system_text = None
        pending_tool_results = []

        for msg in messages:
            # suporta tanto dicts quanto objetos OpenAI/_BFakeMessage
            is_dict = isinstance(msg, dict)
            role    = msg["role"]    if is_dict else msg.role
            content = msg.get("content") if is_dict else msg.content

            if role == "system":
                system_text = content
                continue

            # flush resultados de tools antes de qualquer mensagem não-tool
            if pending_tool_results and role != "tool":
                bedrock_msgs.append({"role": "user", "content": pending_tool_results})
                pending_tool_results = []

            if role == "tool":
                tool_call_id = msg.get("tool_call_id") if is_dict else getattr(msg, "tool_call_id", None)
                pending_tool_results.append({
                    "toolResult": {
                        "toolUseId": tool_call_id,
                        "content": [{"text": content or ""}],
                    }
                })
                continue

            if role == "assistant":
                bedrock_content = getattr(msg, "_bedrock_content", None)
                if bedrock_content is not None:
                    # mensagem que veio de uma resposta Bedrock anterior — reusa os blocos originais
                    bedrock_msgs.append({"role": "assistant", "content": bedrock_content})
                else:
                    tool_calls = msg.get("tool_calls") if is_dict else getattr(msg, "tool_calls", None)
                    blocks = []
                    if content:
                        blocks.append({"text": content})
                    for tc in (tool_calls or []):
                        blocks.append({"toolUse": {
                            "toolUseId": tc.id,
                            "name": tc.function.name,
                            "input": json.loads(tc.function.arguments),
                        }})
                    bedrock_msgs.append({"role": "assistant", "content": blocks or [{"text": ""}]})
                continue

            # user / outros
            bedrock_msgs.append({"role": role, "content": [{"text": content or ""}]})

        if pending_tool_results:
            bedrock_msgs.append({"role": "user", "content": pending_tool_results})

        call_kw: dict = {"modelId": self._model, "messages": bedrock_msgs}
        if system_text:
            call_kw["system"] = [{"text": system_text}]
        if tools:
            call_kw["toolConfig"] = {
                "tools": [
                    {
                        "toolSpec": {
                            "name": t["function"]["name"],
                            "description": t["function"]["description"],
                            "inputSchema": {"json": t["function"]["parameters"]},
                        }
                    }
                    for t in tools
                ]
            }

        resp = self._bc.converse(**call_kw)
        return _BFakeResponse(resp)


# ── Resolve client ────────────────────────────────────────────────────────────

def _resolve_chat_client(db: Session, workspace: WorkspaceContext):
    """Retorna (client, model_name) usando o provedor LLM configurado para o workspace."""
    provider_id = workspace.workspace.chat_llm_provider_id
    if provider_id:
        provider = db.get(LLMProvider, provider_id)
    else:
        provider = db.query(LLMProvider).first()

    if provider is None:
        raise HTTPException(
            503,
            "Nenhum provedor LLM configurado. Acesse Configurações → Provedores LLM para adicionar um.",
        )

    if provider.provider_type == "bedrock":
        return BedrockCompat(provider), provider.model_name
    if provider.provider_type == "openai":
        client = OpenAI(api_key=provider.api_key, base_url=provider.base_url or None)
    else:
        client = AzureOpenAI(
            azure_endpoint=provider.base_url,
            api_key=provider.api_key,
            api_version=provider.api_version or "2025-03-01-preview",
        )
    return client, provider.model_name


_KEYWORDS_TESTING = [
    # casos de teste
    "casos de teste", "caso de teste", "gerar casos", "criar casos",
    "sugerir casos", "sugestão de casos", "sugestões de casos",
    "quero testar", "criar testes", "gerar testes", "teste para",
    "testes para", "testar agente", "me ajude a testar",
    # simulações
    "simulação", "simulações", "simular", "criar simulação",
    "gerar simulação", "quero simular", "simular agente",
    "testar com simulação", "testar agente",
]


def _should_show_agent_selector(messages: list[ChatMessage], agents: list) -> bool:
    """Returns True if user is asking about testing/simulations without specifying an agent."""
    if not messages or messages[-1].role != "user":
        return False
    text = messages[-1].content.lower()
    if not any(kw in text for kw in _KEYWORDS_TESTING):
        return False
    # If user already named an agent or passed an agent_id, let LLM handle it
    for agent in agents:
        if agent.name.lower() in text:
            return False
    if "id:" in text or "(id:" in text:
        return False
    return True


@router.post("/", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
):
    agents = db.query(Agent).filter(Agent.workspace_id == workspace.workspace_id).all()
    last_msg = body.messages[-1].content if body.messages and body.messages[-1].role == "user" else ""

    # Fast path 1: keyword sobre teste/simulação → agent_selector (sem LLM)
    if _should_show_agent_selector(body.messages, agents):
        if not agents:
            return ChatResponse(reply="Nenhum agente cadastrado. [Crie um](/agents) primeiro.", tokens=0)
        selector = json.dumps(
            {"__type": "agent_selector", "agents": [{"id": a.id, "name": a.name} for a in agents]},
            ensure_ascii=False,
        )
        return ChatResponse(reply=f"```json\n{selector}\n```", tokens=0)

    # Fast path 2: "Agente selecionado: X (ID: Y)" → mode_selector (sem LLM)
    selection = _parse_agent_selection(last_msg)
    if selection:
        agent_id, agent_name = selection
        block = json.dumps(
            {"__type": "mode_selector", "agent_id": agent_id, "agent_name": agent_name},
            ensure_ascii=False,
        )
        return ChatResponse(reply=f"```json\n{block}\n```", tokens=0)

    # Fast path 3+4: modo escolhido → gerar sugestões (chama LLM para geração)
    mode_choice = _parse_mode_choice(last_msg)
    if mode_choice:
        mode, agent_id, agent_name = mode_choice
        client, model = _resolve_chat_client(db, workspace)
        if mode == "test_cases":
            result = json.loads(_tool_suggest_test_cases({"agent_id": agent_id}, db, workspace.workspace_id, client, model))
            if result.get("needs_context") or result.get("error"):
                msg = f"**{agent_name}** não tem system prompt cadastrado. Descreva como ele funciona para gerar os casos."
                return ChatResponse(reply=msg, tokens=0)
            block = json.dumps(
                {"__type": "test_case_suggestions", "agent_id": agent_id, "cases": result["cases"]},
                ensure_ascii=False,
            )
            reply = f"5 sugestões de casos de teste para **{agent_name}**:\n\n```json\n{block}\n```\n\nSelecione os que deseja criar."
        else:
            result = json.loads(_tool_suggest_simulations({"agent_id": agent_id}, db, workspace.workspace_id, client, model))
            if result.get("needs_context") or result.get("error"):
                msg = f"**{agent_name}** não tem system prompt cadastrado. Descreva como ele funciona para gerar os cenários."
                return ChatResponse(reply=msg, tokens=0)
            block = json.dumps(
                {"__type": "simulation_suggestions", "agent_id": agent_id, "cases": result["cases"]},
                ensure_ascii=False,
            )
            reply = f"5 cenários de simulação para **{agent_name}**:\n\n```json\n{block}\n```\n\nSelecione os que deseja criar."
        return ChatResponse(reply=reply, tokens=0)

    client, model = _resolve_chat_client(db, workspace)

    system_prompt = _build_system_prompt(db, workspace.workspace_id)
    messages = [{"role": "system", "content": system_prompt}]
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
                result = _run_tool(tc.function.name, args, db, workspace.workspace_id, client, model)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
        else:
            # Resposta final em texto
            return ChatResponse(reply=choice.message.content or "", tokens=total_tokens)

    return ChatResponse(reply="Não consegui completar a operação após várias tentativas.", tokens=total_tokens)
