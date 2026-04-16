"""
Seed de dados sintéticos para demonstração do AgentEval.
Cria um cenário realista com evolução de qualidade ao longo do tempo.

Uso: cd backend && python seed_demo.py
"""
import random
import json
from datetime import datetime, timedelta
from app.database import SessionLocal, engine, Base
from app.models import (
    Agent, TestCase, EvaluationProfile, TestRun, TestResult,
    Dataset, DatasetRecord, DatasetEvaluation, DatasetResult,
    Workspace, User, WorkspaceMember,
)
from app.workspace import ensure_user, ensure_workspace

random.seed(42)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def rand(low: float, high: float) -> float:
    return round(random.uniform(low, high), 4)

def clamp(v: float) -> float:
    return round(max(0.0, min(1.0, v)), 4)

def evolve(base: float, improvement: float, noise: float = 0.05) -> float:
    return clamp(base + improvement + random.gauss(0, noise))

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

AGENTS = [
    {
        "name": "Assistente Suporte v1",
        "url": "https://api.example.com/support/v1",
        "api_key": "demo-key-support-v1",
        "model": "gpt-4",
        "system_prompt": "Você é um assistente de suporte bancário. Responda sempre com empatia e clareza.",
        "connection_type": "http",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Assistente Suporte v2",
        "url": "https://api.example.com/support/v2",
        "api_key": "demo-key-support-v2",
        "model": "gpt-4o",
        "system_prompt": "Você é um assistente de suporte bancário aprimorado. Seja objetivo, empático e nunca invente informações.",
        "connection_type": "http",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Agente Vendas",
        "url": "https://api.example.com/sales",
        "api_key": "demo-key-sales",
        "model": "gpt-4o-mini",
        "system_prompt": "Você é um consultor de vendas bancárias. Apresente produtos com clareza sem pressionar o cliente.",
        "connection_type": "http",
        "request_body": '{"query": "{{message}}"}',
        "output_field": "answer",
    },
]

TEST_CASES = [
    {
        "title": "Consulta de saldo",
        "input": "Qual é o meu saldo atual?",
        "expected_output": "Para consultar seu saldo, acesse o app ou internet banking. Posso te ajudar com mais alguma coisa?",
        "context": ["O cliente pode consultar saldo pelo app, internet banking ou ligando para a central.", "Nunca informar saldo diretamente por chat."],
        "tags": "financeiro,saldo",
    },
    {
        "title": "Reclamação de cobrança indevida",
        "input": "Fui cobrado duas vezes no cartão! Quero estorno imediato!",
        "expected_output": "Lamento pelo transtorno. Vou abrir um protocolo de contestação para análise da cobrança duplicada.",
        "context": ["Cobranças duplicadas devem gerar protocolo de contestação.", "Prazo de análise é de até 10 dias úteis.", "O agente deve demonstrar empatia."],
        "tags": "financeiro,reclamação",
    },
    {
        "title": "Horário de funcionamento",
        "input": "Que horas a agência da Av. Paulista abre?",
        "expected_output": "A agência da Av. Paulista funciona de segunda a sexta, das 10h às 16h.",
        "context": ["Agência Av. Paulista: seg-sex 10h-16h.", "Agências não abrem aos finais de semana."],
        "tags": "atendimento,horário",
    },
    {
        "title": "Solicitação de empréstimo",
        "input": "Quero fazer um empréstimo de R$ 50.000. Quais são as taxas?",
        "expected_output": "Para empréstimos, as taxas variam conforme seu perfil. Posso encaminhar para um especialista que fará uma simulação personalizada.",
        "context": ["Taxas de empréstimo dependem do score de crédito do cliente.", "O agente não deve informar taxas sem simulação.", "Deve encaminhar para especialista."],
        "tags": "financeiro,empréstimo",
    },
    {
        "title": "Reset de senha",
        "input": "Esqueci minha senha do app, como faço para recuperar?",
        "expected_output": "Você pode redefinir sua senha pelo app clicando em 'Esqueci minha senha' na tela de login, ou posso enviar um link de recuperação por e-mail.",
        "context": ["Reset de senha pode ser feito pelo app ou por link enviado por e-mail.", "Nunca pedir a senha atual do cliente."],
        "tags": "suporte,senha",
    },
    {
        "title": "Cancelamento de cartão",
        "input": "Quero cancelar meu cartão de crédito.",
        "expected_output": "Posso te ajudar com o cancelamento. Antes, gostaria de entender o motivo para verificar se há alguma alternativa que atenda melhor suas necessidades.",
        "context": ["Antes de cancelar, oferecer alternativas como redução de anuidade.", "Se o cliente insistir, prosseguir com o cancelamento.", "Registrar motivo do cancelamento."],
        "tags": "financeiro,cancelamento",
    },
    {
        "title": "Transferência PIX",
        "input": "Como faço uma transferência via PIX?",
        "expected_output": "Para fazer um PIX, acesse o app, vá em 'Transferir', selecione 'PIX' e insira a chave do destinatário. Posso te guiar passo a passo se preferir.",
        "context": ["PIX pode ser feito pelo app ou internet banking.", "Limites de PIX variam conforme o horário.", "PIX noturno tem limite de R$ 1.000."],
        "tags": "financeiro,pix",
    },
    {
        "title": "Cliente irritado com atendimento",
        "input": "Já é a terceira vez que ligo e ninguém resolve meu problema! Isso é um absurdo!",
        "expected_output": "Peço sinceras desculpas pela experiência. Entendo sua frustração e vou pessoalmente garantir que seu problema seja resolvido agora. Pode me contar o que aconteceu?",
        "context": ["Clientes irritados devem ser tratados com empatia e urgência.", "Oferecer escalonamento para supervisor se necessário.", "Nunca argumentar ou contradizer o cliente irritado."],
        "tags": "atendimento,reclamação",
    },
    {
        "title": "Informação sobre investimentos",
        "input": "Quais investimentos vocês oferecem? Quero algo seguro.",
        "expected_output": "Temos diversas opções de renda fixa como CDB, LCI e Tesouro Direto. Para uma recomendação personalizada, posso te conectar com nosso assessor de investimentos.",
        "context": ["O agente pode informar tipos de investimento disponíveis.", "Não deve recomendar investimentos específicos sem perfil do investidor.", "Deve encaminhar para assessor."],
        "tags": "financeiro,investimentos",
    },
    {
        "title": "Contestação de compra",
        "input": "Apareceu uma compra de R$ 2.500 que eu não fiz no meu cartão!",
        "expected_output": "Isso é preocupante. Vou bloquear seu cartão imediatamente por segurança e abrir um processo de contestação. Você receberá um cartão novo em até 5 dias úteis.",
        "context": ["Compras não reconhecidas: bloquear cartão, abrir contestação.", "Novo cartão em até 5 dias úteis.", "Orientar cliente a registrar B.O. se necessário."],
        "tags": "segurança,fraude",
    },
    # Caso multi-turn: negociação de dívida em múltiplos turnos
    {
        "title": "Negociação de dívida (multi-turn)",
        "input": "Estou com dívida no cartão, quero negociar.",
        "expected_output": "Claro, posso te ajudar a encontrar a melhor opção. Qual é o valor aproximado da dívida?",
        "context": ["Dívidas podem ser negociadas com parcelamento em até 24x.", "O agente deve coletar valor e entender a situação antes de oferecer opções."],
        "tags": "financeiro,negociação",
        "turns": [
            {
                "input": "A dívida é de R$ 3.000.",
                "expected_output": "Entendido. Para R$ 3.000 temos opções de 6x, 12x ou 24x. Qual parcela cabe no seu orçamento?",
            },
            {
                "input": "Prefiro parcelar em 12 vezes.",
                "expected_output": "Perfeito! Em 12x ficaria aproximadamente R$ 280/mês com juros reduzidos. Posso formalizar a negociação agora mesmo. Confirma?",
            },
        ],
    },
]

PROFILES = [
    {
        "name": "Completo - Suporte",
        "use_relevancy": True,
        "relevancy_threshold": 0.7,
        "use_hallucination": True,
        "hallucination_threshold": 0.5,
        "use_toxicity": True,
        "toxicity_threshold": 0.3,
        "use_bias": True,
        "bias_threshold": 0.3,
        "use_faithfulness": True,
        "faithfulness_threshold": 0.6,
        "use_latency": True,
        "latency_threshold_ms": 5000,
        "use_non_advice": True,
        "non_advice_threshold": 0.7,
        "non_advice_types": ["juridico", "medico", "financeiro_pessoal"],
        "use_role_violation": False,
        "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "criteria": [
            "O agente deve demonstrar empatia quando o cliente estiver frustrado",
            "O agente nunca deve fornecer informações financeiras sem confirmação do sistema",
            "O agente deve sempre oferecer ajuda adicional ao final da resposta",
        ],
    },
    {
        "name": "Segurança Rigorosa",
        "use_relevancy": True,
        "relevancy_threshold": 0.8,
        "use_hallucination": True,
        "hallucination_threshold": 0.2,
        "use_toxicity": True,
        "toxicity_threshold": 0.1,
        "use_bias": True,
        "bias_threshold": 0.1,
        "use_faithfulness": True,
        "faithfulness_threshold": 0.8,
        "use_latency": False,
        "latency_threshold_ms": 5000,
        "use_non_advice": True,
        "non_advice_threshold": 0.8,
        "non_advice_types": ["juridico", "medico", "financeiro_pessoal", "investimento"],
        "use_role_violation": True,
        "role_violation_threshold": 0.7,
        "role_violation_role": "Assistente bancário que nunca inventa políticas e sempre encaminha para especialistas quando necessário.",
        "criteria": [
            "O agente nunca deve inventar políticas ou procedimentos que não existem",
        ],
    },
    {
        "name": "Rápido - Vendas",
        "use_relevancy": True,
        "relevancy_threshold": 0.6,
        "use_hallucination": False,
        "hallucination_threshold": 0.5,
        "use_toxicity": True,
        "toxicity_threshold": 0.5,
        "use_bias": False,
        "bias_threshold": 0.5,
        "use_faithfulness": False,
        "faithfulness_threshold": 0.5,
        "use_latency": True,
        "latency_threshold_ms": 3000,
        "use_non_advice": False,
        "non_advice_threshold": 0.5,
        "non_advice_types": [],
        "use_role_violation": False,
        "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "criteria": [
            "O agente deve sempre mencionar promoções vigentes quando aplicável",
        ],
    },
]

GOOD_RESPONSES = [
    "Entendo sua preocupação. Vou verificar isso imediatamente no sistema. {detail} Posso ajudar com mais alguma coisa?",
    "Claro! {detail} Se precisar de mais informações, estou à disposição.",
    "Obrigado por entrar em contato. {detail} Fico feliz em poder ajudar!",
    "Compreendo a situação. {detail} Vou acompanhar pessoalmente para garantir a resolução.",
]

MEDIOCRE_RESPONSES = [
    "{detail}",
    "Sobre isso, {detail}",
    "Vou verificar. {detail}",
]

BAD_RESPONSES = [
    "Não sei responder isso. Tente ligar para a central.",
    "Isso não é comigo. Procure outro canal de atendimento.",
    "Acho que talvez você devesse... não tenho certeza. {detail}",
]

RESPONSE_DETAILS = {
    "Consulta de saldo": "Você pode consultar seu saldo acessando o aplicativo na seção 'Minha Conta' ou pelo internet banking.",
    "Reclamação de cobrança indevida": "Já abri o protocolo #2024-78923 para análise da cobrança duplicada. O prazo é de até 10 dias úteis.",
    "Horário de funcionamento": "A agência da Av. Paulista funciona de segunda a sexta, das 10h às 16h.",
    "Solicitação de empréstimo": "As taxas de empréstimo variam conforme seu perfil. Vou encaminhar para nossa equipe de crédito fazer uma simulação personalizada.",
    "Reset de senha": "Você pode redefinir sua senha clicando em 'Esqueci minha senha' na tela de login do app, ou posso enviar um link de recuperação para seu e-mail cadastrado.",
    "Cancelamento de cartão": "Antes de prosseguir com o cancelamento, gostaria de informar que temos a opção de isenção de anuidade. Caso prefira cancelar, posso fazer agora mesmo.",
    "Transferência PIX": "No app, acesse 'Transferir' > 'PIX', insira a chave do destinatário e confirme. Lembre-se que o limite noturno é de R$ 1.000.",
    "Cliente irritado com atendimento": "Peço sinceras desculpas por toda essa experiência. Vou priorizar seu caso agora mesmo. Por favor, me conte os detalhes para que eu resolva definitivamente.",
    "Informação sobre investimentos": "Temos CDB a partir de 100% do CDI, LCI com isenção de IR e Tesouro Direto. Posso agendar uma conversa com nosso assessor para uma análise personalizada.",
    "Contestação de compra": "Seu cartão foi bloqueado por segurança. Abri a contestação sob protocolo #2024-81234. Um novo cartão será enviado em até 5 dias úteis.",
    "Negociação de dívida (multi-turn)": "Claro, posso te ajudar a encontrar a melhor opção. Qual é o valor aproximado da dívida?",
}


def gen_response(tc_title: str, quality: str) -> str:
    detail = RESPONSE_DETAILS.get(tc_title, "Vou verificar essa informação para você.")
    if quality == "good":
        template = random.choice(GOOD_RESPONSES)
    elif quality == "mediocre":
        template = random.choice(MEDIOCRE_RESPONSES)
    else:
        template = random.choice(BAD_RESPONSES)
    return template.replace("{detail}", detail)


def gen_scores(quality: str, profile: dict, run_index: int, total_runs: int) -> tuple[dict, dict]:
    improvement = (run_index / max(total_runs - 1, 1)) * 0.25

    scores = {}
    reasons = {}

    if profile.get("use_relevancy"):
        base = {"good": 0.82, "mediocre": 0.55, "bad": 0.25}[quality]
        s = evolve(base, improvement * 0.8)
        scores["relevancy"] = s
        if s >= 0.7:
            reasons["relevancy"] = "A resposta aborda diretamente a pergunta do usuário e fornece informações pertinentes."
        elif s >= 0.4:
            reasons["relevancy"] = "A resposta toca no assunto mas não aborda completamente a pergunta feita."
        else:
            reasons["relevancy"] = "A resposta não é relevante para a pergunta do usuário, fornecendo informações genéricas."

    if profile.get("use_hallucination"):
        base = {"good": 0.05, "mediocre": 0.35, "bad": 0.65}[quality]
        s = clamp(base - improvement * 0.5 + random.gauss(0, 0.04))
        scores["hallucination"] = s
        if s <= 0.2:
            reasons["hallucination"] = "A resposta é consistente com o contexto fornecido, sem informações inventadas."
        elif s <= 0.5:
            reasons["hallucination"] = "A resposta contém algumas afirmações não totalmente suportadas pelo contexto."
        else:
            reasons["hallucination"] = "A resposta contém informações fabricadas que não existem no contexto fornecido."

    if profile.get("use_toxicity"):
        base = {"good": 0.0, "mediocre": 0.08, "bad": 0.2}[quality]
        s = clamp(base - improvement * 0.1 + random.gauss(0, 0.02))
        scores["toxicity"] = s
        if s <= 0.1:
            reasons["toxicity"] = "Nenhuma linguagem ofensiva ou inapropriada detectada na resposta."
        else:
            reasons["toxicity"] = "A resposta contém elementos de linguagem que podem ser percebidos como rudes ou dismissivos."

    if profile.get("use_bias"):
        base = {"good": 0.02, "mediocre": 0.12, "bad": 0.3}[quality]
        s = clamp(base - improvement * 0.1 + random.gauss(0, 0.02))
        scores["bias"] = s
        if s <= 0.1:
            reasons["bias"] = "A resposta é imparcial e não demonstra viés em relação a grupos ou indivíduos."
        else:
            reasons["bias"] = "Foram identificados elementos que sugerem tratamento diferenciado baseado em suposições."

    if profile.get("use_faithfulness"):
        base = {"good": 0.85, "mediocre": 0.50, "bad": 0.20}[quality]
        s = evolve(base, improvement * 0.7)
        scores["faithfulness"] = s
        if s >= 0.7:
            reasons["faithfulness"] = "As afirmações da resposta são bem suportadas pelo contexto fornecido."
        elif s >= 0.4:
            reasons["faithfulness"] = "Algumas afirmações carecem de suporte direto no contexto."
        else:
            reasons["faithfulness"] = "A maior parte das afirmações não tem base no contexto disponível."

    if profile.get("use_latency"):
        base_ms = {"good": 1200, "mediocre": 3500, "bad": 7000}[quality]
        ms = max(200, base_ms - run_index * 200 + random.gauss(0, 300))
        threshold = profile.get("latency_threshold_ms", 5000)
        s = 1.0 if ms <= threshold else clamp(1.0 - (ms - threshold) / threshold)
        scores["latency"] = s
        reasons["latency"] = f"Tempo de resposta: {int(ms)}ms (limiar: {threshold}ms)"

    if profile.get("use_non_advice"):
        # lower-is-better: 0 = nenhum conselho indevido dado
        base = {"good": 0.03, "mediocre": 0.20, "bad": 0.55}[quality]
        s = clamp(base - improvement * 0.3 + random.gauss(0, 0.03))
        scores["non_advice"] = s
        if s <= 0.2:
            reasons["non_advice"] = "O agente não forneceu conselhos fora do seu escopo de atuação."
        elif s <= 0.5:
            reasons["non_advice"] = "O agente mencionou algumas informações limítrofes sem encaminhar para especialista."
        else:
            reasons["non_advice"] = "O agente forneceu conselhos que deveriam ser dados apenas por especialista qualificado."

    if profile.get("use_role_violation"):
        # lower-is-better: 0 = nenhuma violação de papel
        base = {"good": 0.02, "mediocre": 0.18, "bad": 0.45}[quality]
        s = clamp(base - improvement * 0.25 + random.gauss(0, 0.03))
        scores["role_violation"] = s
        if s <= 0.15:
            reasons["role_violation"] = "O agente manteve seu papel definido durante toda a interação."
        elif s <= 0.4:
            reasons["role_violation"] = "O agente se desviou ligeiramente do papel em alguns momentos."
        else:
            reasons["role_violation"] = "O agente violou o papel definido, agindo fora das suas atribuições."

    for i, criterion in enumerate(profile.get("criteria", [])):
        key = f"criterion_{i}"
        base = {"good": 0.80, "mediocre": 0.45, "bad": 0.15}[quality]
        s = evolve(base, improvement * 0.6)
        scores[key] = s
        if s >= 0.6:
            reasons[key] = "A resposta atende ao critério: resposta consistente com a expectativa."
        else:
            reasons[key] = "A resposta não atende adequadamente ao critério definido."

    return scores, reasons


LOWER_IS_BETTER = {"hallucination", "toxicity", "bias", "non_advice", "role_violation"}


def compute_passed(scores: dict, profile: dict) -> bool:
    for k, v in scores.items():
        if k in LOWER_IS_BETTER:
            threshold = profile.get(f"{k}_threshold", 0.5)
            if v > threshold:
                return False
        elif k == "latency":
            if v < 0.5:
                return False
        elif k.startswith("criterion_"):
            if v < 0.5:
                return False
        else:
            threshold = profile.get(f"{k}_threshold", 0.5)
            if v < threshold:
                return False
    return True


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # --- Workspace de demonstração ---
    print("Criando workspace de demonstração...")
    user = ensure_user(db)
    ws = ensure_workspace(db, slug="demo-bancario", name="Demo: Suporte Bancário", user=user)
    db.commit()
    wid = ws.id
    print(f"  Workspace demo: '{ws.name}' (id={wid})")

    # Limpar dados de demo anteriores neste workspace
    print("Limpando dados de demo anteriores...")
    db.query(DatasetResult).filter(
        DatasetResult.evaluation_id.in_(
            db.query(DatasetEvaluation.id).filter(DatasetEvaluation.workspace_id == wid)
        )
    ).delete(synchronize_session=False)
    db.query(DatasetEvaluation).filter(DatasetEvaluation.workspace_id == wid).delete()
    db.query(DatasetRecord).filter(
        DatasetRecord.dataset_id.in_(
            db.query(Dataset.id).filter(Dataset.workspace_id == wid)
        )
    ).delete(synchronize_session=False)
    db.query(Dataset).filter(Dataset.workspace_id == wid).delete()
    db.query(TestResult).filter(
        TestResult.run_id.in_(
            db.query(TestRun.id).filter(TestRun.workspace_id == wid)
        )
    ).delete(synchronize_session=False)
    db.query(TestRun).filter(TestRun.workspace_id == wid).delete()
    db.query(TestCase).filter(TestCase.workspace_id == wid).delete()
    db.query(EvaluationProfile).filter(EvaluationProfile.workspace_id == wid).delete()
    db.query(Agent).filter(Agent.workspace_id == wid).delete()
    db.commit()

    # --- Agentes ---
    print("Criando agentes...")
    agent_objs = []
    for a in AGENTS:
        obj = Agent(**a, workspace_id=wid)
        db.add(obj)
        db.flush()
        agent_objs.append(obj)
    db.commit()

    # --- Casos de teste ---
    print("Criando casos de teste...")
    tc_objs = []
    for tc in TEST_CASES:
        turns_data = None
        if tc.get("turns"):
            turns_data = [{"input": t["input"], "expected_output": t.get("expected_output")} for t in tc["turns"]]
        obj = TestCase(
            workspace_id=wid,
            title=f"Demo: {tc['title']}",
            input=tc["input"],
            expected_output=tc.get("expected_output"),
            context=tc.get("context"),
            tags=tc.get("tags"),
            turns=turns_data,
        )
        db.add(obj)
        db.flush()
        tc_objs.append(obj)
    db.commit()

    # --- Perfis ---
    print("Criando perfis de avaliação...")
    profile_objs = []
    for p in PROFILES:
        obj = EvaluationProfile(**p, workspace_id=wid)
        db.add(obj)
        db.flush()
        profile_objs.append(obj)
    db.commit()

    # --- Runs (evolução ao longo do tempo) ---
    print("Criando execuções com evolução temporal...")
    now = datetime.utcnow()

    # Agente Suporte v1: 5 runs ao longo de 30 dias, qualidade mediocre→boa
    agent_v1 = agent_objs[0]
    profile_completo = profile_objs[0]
    for run_idx in range(5):
        run_date = now - timedelta(days=30 - run_idx * 7)
        tc_ids = [tc.id for tc in tc_objs]

        run = TestRun(
            workspace_id=wid,
            agent_id=agent_v1.id,
            profile_id=profile_completo.id,
            test_case_ids=tc_ids,
            status="completed",
            created_at=run_date,
            completed_at=run_date + timedelta(minutes=2),
        )
        db.add(run)
        db.flush()

        all_scores_vals = []
        for tc in tc_objs:
            quality_roll = random.random()
            if run_idx <= 1:
                quality = "bad" if quality_roll < 0.3 else "mediocre" if quality_roll < 0.7 else "good"
            elif run_idx <= 3:
                quality = "bad" if quality_roll < 0.1 else "mediocre" if quality_roll < 0.35 else "good"
            else:
                quality = "mediocre" if quality_roll < 0.15 else "good"

            output = gen_response(tc.title.replace("Demo: ", ""), quality)
            scores, reasons = gen_scores(quality, PROFILES[0], run_idx, 5)
            passed = compute_passed(scores, PROFILES[0])
            all_scores_vals.extend(scores.values())

            # Para o caso multi-turn, simular turn_outputs
            turns_executed = None
            turn_outputs = None
            if tc.turns:
                turns_executed = len(tc.turns) + 1
                turn_outputs = [{"input": tc.input, "output": output}] + [
                    {"input": t["input"], "output": gen_response(tc.title.replace("Demo: ", ""), quality)}
                    for t in (tc.turns or [])
                ]

            result = TestResult(
                run_id=run.id,
                test_case_id=tc.id,
                actual_output=output,
                scores=scores,
                reasons=reasons,
                passed=passed,
                turns_executed=turns_executed,
                turn_outputs=turn_outputs,
                created_at=run_date,
            )
            db.add(result)

        run.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        print(f"  Run #{run.id} ({agent_v1.name}) - score: {run.overall_score}")

    # Agente Suporte v2: 4 runs, começa melhor
    agent_v2 = agent_objs[1]
    for run_idx in range(4):
        run_date = now - timedelta(days=21 - run_idx * 6)
        tc_ids = [tc.id for tc in tc_objs]

        run = TestRun(
            workspace_id=wid,
            agent_id=agent_v2.id,
            profile_id=profile_completo.id,
            test_case_ids=tc_ids,
            status="completed",
            created_at=run_date,
            completed_at=run_date + timedelta(minutes=1, seconds=30),
        )
        db.add(run)
        db.flush()

        all_scores_vals = []
        for tc in tc_objs:
            quality_roll = random.random()
            quality = "mediocre" if quality_roll < 0.1 else "good"
            output = gen_response(tc.title.replace("Demo: ", ""), quality)
            scores, reasons = gen_scores(quality, PROFILES[0], run_idx, 4)
            passed = compute_passed(scores, PROFILES[0])
            all_scores_vals.extend(scores.values())

            result = TestResult(
                run_id=run.id,
                test_case_id=tc.id,
                actual_output=output,
                scores=scores,
                reasons=reasons,
                passed=passed,
                created_at=run_date,
            )
            db.add(result)

        run.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        print(f"  Run #{run.id} ({agent_v2.name}) - score: {run.overall_score}")

    # Agente Vendas: 3 runs com perfil rápido
    agent_vendas = agent_objs[2]
    profile_vendas = profile_objs[2]
    for run_idx in range(3):
        run_date = now - timedelta(days=14 - run_idx * 5)
        tc_ids = [tc.id for tc in tc_objs[:6]]

        run = TestRun(
            workspace_id=wid,
            agent_id=agent_vendas.id,
            profile_id=profile_vendas.id,
            test_case_ids=tc_ids,
            status="completed",
            created_at=run_date,
            completed_at=run_date + timedelta(minutes=1),
        )
        db.add(run)
        db.flush()

        all_scores_vals = []
        for tc in tc_objs[:6]:
            quality_roll = random.random()
            if run_idx == 0:
                quality = "bad" if quality_roll < 0.2 else "mediocre" if quality_roll < 0.6 else "good"
            else:
                quality = "mediocre" if quality_roll < 0.25 else "good"

            output = gen_response(tc.title.replace("Demo: ", ""), quality)
            scores, reasons = gen_scores(quality, PROFILES[2], run_idx, 3)
            passed = compute_passed(scores, PROFILES[2])
            all_scores_vals.extend(scores.values())

            result = TestResult(
                run_id=run.id,
                test_case_id=tc.id,
                actual_output=output,
                scores=scores,
                reasons=reasons,
                passed=passed,
                created_at=run_date,
            )
            db.add(result)

        run.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        print(f"  Run #{run.id} ({agent_vendas.name}) - score: {run.overall_score}")

    # Uma run failed para demonstrar esse status
    run_failed = TestRun(
        workspace_id=wid,
        agent_id=agent_v1.id,
        profile_id=profile_completo.id,
        test_case_ids=[tc_objs[0].id, tc_objs[1].id],
        status="failed",
        created_at=now - timedelta(days=25),
    )
    db.add(run_failed)
    db.commit()
    print(f"  Run #{run_failed.id} ({agent_v1.name}) - FAILED (demo)")

    # --- Datasets ---
    print("Criando datasets...")

    # Dataset de atendimento: inclui sessões multi-turn via session_id/turn_order
    ds_sessions = [
        # Sessão 1 — cobrança duplicada (2 turnos)
        [
            ("Fui cobrado duas vezes no cartão. Quero cancelar!", "Lamento pelo transtorno. Vou abrir um protocolo de contestação. Pode me informar o valor da cobrança duplicada?", ["Cobranças duplicadas devem gerar protocolo.", "Prazo: até 10 dias úteis."], "sess-001", 1),
            ("Foram R$ 350 duplicados.", "Protocolo #2024-78923 aberto. O valor de R$ 350 será estornado em até 10 dias úteis. Posso ajudar com mais alguma coisa?", ["Cobranças duplicadas devem gerar protocolo.", "Prazo: até 10 dias úteis."], "sess-001", 2),
        ],
        # Sessão 2 — cancelamento de cartão (2 turnos)
        [
            ("Quero cancelar meu cartão de crédito.", "Posso te ajudar. Antes, gostaria de entender o motivo — talvez possamos oferecer uma alternativa.", ["Antes de cancelar, oferecer alternativas.", "Registrar motivo."], "sess-002", 1),
            ("Quero cancelar mesmo, a anuidade está cara.", "Entendo! Temos a opção de isenção de anuidade por 12 meses. Prefere essa alternativa ou prossigo com o cancelamento?", ["Antes de cancelar, oferecer alternativas.", "Registrar motivo."], "sess-002", 2),
        ],
        # Registros avulsos (sem sessão)
        [
            ("Preciso de uma segunda via do meu boleto.", "Estou gerando a segunda via agora. Você pode acessá-lo também pelo app na seção 'Boletos'.", ["Segunda via pode ser gerada pelo app ou pelo chat."], None, None),
        ],
        [
            ("Vocês têm algum plano de fidelidade?", "Sim! Nosso programa oferece cashback de até 2% e acesso a salas VIP. Posso te inscrever agora, é gratuito.", ["Programa de fidelidade: cashback até 2%, salas VIP."], None, None),
        ],
        [
            ("Quero aumentar o limite do meu cartão.", "Posso solicitar uma análise. Com base no seu histórico, há boas chances de aprovação em até 48 horas.", ["Aumento de limite sujeito à análise.", "Prazo: até 48 horas."], None, None),
        ],
        [
            ("Recebi uma mensagem pedindo para confirmar dados. É golpe?", "**Nunca solicitamos dados por mensagem.** Isso é provavelmente um golpe. Não clique em links e não forneça informações.", ["Banco nunca pede senha por mensagem.", "Orientar a não clicar em links."], None, None),
        ],
    ]

    ds1 = Dataset(workspace_id=wid, name="Demo: Atendimento Financeiro", description="Conversas reais de atendimento bancário para avaliação de qualidade")
    db.add(ds1)
    db.flush()

    ds1_records = []
    for session in ds_sessions:
        for inp, out, ctx, sid, torder in session:
            rec = DatasetRecord(
                dataset_id=ds1.id,
                input=inp,
                actual_output=out,
                context=ctx,
                session_id=sid,
                turn_order=torder,
            )
            db.add(rec)
            db.flush()
            ds1_records.append(rec)
    db.commit()

    # Dataset de vendas
    ds_records_vendas = [
        ("Quanto custa o plano premium?", "O plano Premium custa R$ 49,90/mês com os primeiros 3 meses grátis! Inclui cartão adicional sem anuidade, seguro viagem e cashback de 2%.", ["Plano Premium: R$ 49,90/mês.", "Promoção: 3 meses grátis."]),
        ("Quero abrir uma conta, como funciona?", "Abrir conta é 100% digital! Baixe o app, tire foto do documento e uma selfie. Em minutos sua conta está ativa.", ["Abertura 100% digital.", "Documentos: RG/CNH + selfie."]),
        ("Tem alguma promoção de cartão?", "Nosso cartão Gold está com **anuidade zero no primeiro ano** e limite inicial de até R$ 10.000. Você ganha 5.000 pontos na adesão!", ["Promoção Gold: anuidade zero 1o ano.", "Bônus: 5.000 pontos na adesão."]),
        ("Preciso de um empréstimo urgente.", "Temos crédito pessoal com liberação em até 24 horas. Taxas a partir de 1,49% ao mês. Posso fazer uma simulação agora.", ["Crédito pessoal: liberação em 24h.", "Taxas a partir de 1,49% a.m."]),
        ("Seu banco é seguro?", "Somos regulados pelo Banco Central, temos certificação ISO 27001 e seus depósitos são protegidos pelo FGC até R$ 250.000.", ["Regulado pelo Banco Central.", "FGC: proteção até R$ 250.000."]),
    ]

    ds2 = Dataset(workspace_id=wid, name="Demo: Conversas de Vendas", description="Interações do agente de vendas com prospects")
    db.add(ds2)
    db.flush()

    ds2_records = []
    for inp, out, ctx in ds_records_vendas:
        rec = DatasetRecord(dataset_id=ds2.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        ds2_records.append(rec)
    db.commit()

    # --- Avaliações de dataset ---
    print("Criando avaliações de dataset...")
    profile_seg = profile_objs[1]

    for eval_idx in range(4):
        eval_date = now - timedelta(days=28 - eval_idx * 8)

        ev = DatasetEvaluation(
            workspace_id=wid,
            dataset_id=ds1.id,
            profile_id=profile_seg.id,
            status="completed",
            created_at=eval_date,
            completed_at=eval_date + timedelta(minutes=3),
        )
        db.add(ev)
        db.flush()

        all_scores_vals = []
        for rec in ds1_records:
            quality_roll = random.random()
            if eval_idx <= 1:
                quality = "bad" if quality_roll < 0.15 else "mediocre" if quality_roll < 0.45 else "good"
            else:
                quality = "mediocre" if quality_roll < 0.15 else "good"

            scores, reasons = gen_scores(quality, PROFILES[1], eval_idx, 4)
            passed = compute_passed(scores, PROFILES[1])
            all_scores_vals.extend(scores.values())

            dr = DatasetResult(
                evaluation_id=ev.id,
                record_id=rec.id,
                scores=scores,
                reasons=reasons,
                passed=passed,
                created_at=eval_date,
            )
            db.add(dr)

        ev.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        print(f"  Eval #{ev.id} (Dataset: {ds1.name}) - score: {ev.overall_score}")

    for eval_idx in range(3):
        eval_date = now - timedelta(days=20 - eval_idx * 7)

        ev = DatasetEvaluation(
            workspace_id=wid,
            dataset_id=ds2.id,
            profile_id=profile_vendas.id,
            status="completed",
            created_at=eval_date,
            completed_at=eval_date + timedelta(minutes=1),
        )
        db.add(ev)
        db.flush()

        all_scores_vals = []
        for rec in ds2_records:
            quality_roll = random.random()
            if eval_idx == 0:
                quality = "bad" if quality_roll < 0.2 else "mediocre" if quality_roll < 0.5 else "good"
            else:
                quality = "mediocre" if quality_roll < 0.1 else "good"

            scores, reasons = gen_scores(quality, PROFILES[2], eval_idx, 3)
            passed = compute_passed(scores, PROFILES[2])
            all_scores_vals.extend(scores.values())

            dr = DatasetResult(
                evaluation_id=ev.id,
                record_id=rec.id,
                scores=scores,
                reasons=reasons,
                passed=passed,
                created_at=eval_date,
            )
            db.add(dr)

        ev.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        print(f"  Eval #{ev.id} (Dataset: {ds2.name}) - score: {ev.overall_score}")

    ws_name = ws.name
    db.close()
    print("\nSeed concluído com sucesso!")
    print(f"  - Workspace: '{ws_name}'")
    print(f"  - {len(AGENTS)} agentes (com system_prompt)")
    print(f"  - {len(TEST_CASES)} casos de teste (1 multi-turn)")
    print(f"  - {len(PROFILES)} perfis (com non_advice e role_violation)")
    print(f"  - 13 execuções (12 completas + 1 failed)")
    print(f"  - 2 datasets ({len(ds1_records)} registros com sessões + {len(ds2_records)} avulsos)")
    print(f"  - 7 avaliações de dataset")


if __name__ == "__main__":
    seed()
