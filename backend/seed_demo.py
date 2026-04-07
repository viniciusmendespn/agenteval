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
)

random.seed(42)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def rand(low: float, high: float) -> float:
    return round(random.uniform(low, high), 4)

def clamp(v: float) -> float:
    return round(max(0.0, min(1.0, v)), 4)

def evolve(base: float, improvement: float, noise: float = 0.05) -> float:
    """Score que melhora progressivamente com ruído."""
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
        "connection_type": "http",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Assistente Suporte v2",
        "url": "https://api.example.com/support/v2",
        "api_key": "demo-key-support-v2",
        "model": "gpt-4o",
        "connection_type": "http",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Agente Vendas",
        "url": "https://api.example.com/sales",
        "api_key": "demo-key-sales",
        "model": "gpt-4o-mini",
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
        "criteria": [
            "O agente deve sempre mencionar promoções vigentes quando aplicável",
        ],
    },
]

# Respostas simuladas por qualidade (para gerar actual_output realista)
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
    """Gera scores e reasons realistas. run_index/total_runs controlam evolução."""
    improvement = (run_index / max(total_runs - 1, 1)) * 0.25  # melhora até 25% ao longo das runs

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
        # Lower is better: good agent hallucina pouco
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
        if ms <= threshold:
            s = 1.0
        else:
            s = clamp(1.0 - (ms - threshold) / threshold)
        scores["latency"] = s
        reasons["latency"] = f"Tempo de resposta: {int(ms)}ms (limiar: {threshold}ms)"

    for i, criterion in enumerate(profile.get("criteria", [])):
        key = f"criterion_{i}"
        base = {"good": 0.80, "mediocre": 0.45, "bad": 0.15}[quality]
        s = evolve(base, improvement * 0.6)
        scores[key] = s
        if s >= 0.6:
            reasons[key] = f"A resposta atende ao critério: resposta consistente com a expectativa."
        else:
            reasons[key] = f"A resposta não atende adequadamente ao critério definido."

    return scores, reasons


def compute_passed(scores: dict, profile: dict) -> bool:
    LOWER = {"hallucination", "toxicity", "bias"}
    for k, v in scores.items():
        if k in LOWER:
            th_key = f"{k}_threshold"
            threshold = profile.get(th_key, 0.5)
            if v > threshold:
                return False
        elif k == "latency":
            if v < 0.5:
                return False
        elif k.startswith("criterion_"):
            if v < 0.5:
                return False
        else:
            th_key = f"{k}_threshold"
            threshold = profile.get(th_key, 0.5)
            if v < threshold:
                return False
    return True


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Limpar dados existentes (preserva agente real do usuário)
    print("Limpando dados de demo anteriores...")
    db.query(DatasetResult).delete()
    db.query(DatasetEvaluation).delete()
    db.query(DatasetRecord).delete()
    db.query(Dataset).filter(Dataset.name.like("Demo%")).delete()
    db.query(TestResult).delete()
    db.query(TestRun).delete()
    db.query(TestCase).filter(TestCase.title.like("Demo:%")).delete()
    # Não deletar agentes/perfis que o usuário pode ter criado
    db.commit()

    # --- Agentes ---
    print("Criando agentes...")
    agent_objs = []
    for a in AGENTS:
        obj = Agent(**a)
        db.add(obj)
        db.flush()
        agent_objs.append(obj)
    db.commit()

    # --- Casos de teste ---
    print("Criando casos de teste...")
    tc_objs = []
    for tc in TEST_CASES:
        obj = TestCase(
            title=f"Demo: {tc['title']}",
            input=tc["input"],
            expected_output=tc.get("expected_output"),
            context=tc.get("context"),
            tags=tc.get("tags"),
        )
        db.add(obj)
        db.flush()
        tc_objs.append(obj)
    db.commit()

    # --- Perfis ---
    print("Criando perfis de avaliação...")
    profile_objs = []
    for p in PROFILES:
        obj = EvaluationProfile(**p)
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
            # Primeiras runs: mix de qualidades. Últimas: mais "good"
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
        print(f"  Run #{run.id} ({agent_v1.name}) - score: {run.overall_score}")

    # Agente Suporte v2: 4 runs, começa melhor
    agent_v2 = agent_objs[1]
    for run_idx in range(4):
        run_date = now - timedelta(days=21 - run_idx * 6)
        tc_ids = [tc.id for tc in tc_objs]

        run = TestRun(
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
        tc_ids = [tc.id for tc in tc_objs[:6]]  # Só os primeiros 6 casos

        run = TestRun(
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

    # Dataset de atendimento real
    ds_records_atendimento = [
        ("Preciso de uma segunda via do meu boleto.", "Claro! Estou gerando a segunda via do seu boleto agora. Você pode acessá-lo também pelo app na seção 'Boletos'. O vencimento será em 3 dias úteis.", ["Segunda via de boletos pode ser gerada pelo app ou pelo chat.", "Novo vencimento em 3 dias úteis."]),
        ("Meu cartão foi bloqueado, o que faço?", "Para desbloquear seu cartão, você pode usar o app na seção 'Cartões' > 'Desbloquear', ou posso fazer o desbloqueio aqui mesmo. Prefere qual opção?", ["Desbloqueio pode ser feito pelo app ou pelo atendente.", "Cartões bloqueados por suspeita de fraude precisam de verificação adicional."]),
        ("Vocês têm algum plano de fidelidade?", "Sim! Nosso programa de fidelidade oferece cashback de até 2% e acesso a salas VIP. Posso te inscrever agora, é gratuito.", ["Programa de fidelidade: cashback até 2%, salas VIP.", "Inscrição gratuita, ativação imediata."]),
        ("Quero aumentar o limite do meu cartão.", "Posso solicitar uma análise de aumento de limite para você. Com base no seu histórico, há boas chances de aprovação. O resultado sai em até 48 horas.", ["Aumento de limite sujeito à análise.", "Prazo de resposta: até 48 horas.", "Não garantir aprovação."]),
        ("Como cancelo uma transferência que fiz errado?", "Transferências via PIX são instantâneas e não podem ser canceladas automaticamente. Porém, posso abrir uma solicitação de devolução junto ao banco destinatário. Deseja prosseguir?", ["PIX não tem cancelamento automático.", "Devolução depende do banco destinatário.", "MED - Mecanismo Especial de Devolução para fraudes."]),
        ("Qual a previsão de pagamento do meu salário?", "Pagamentos de salário dependem da empresa empregadora. Geralmente são creditados no mesmo dia do envio. Posso verificar se há algum crédito pendente na sua conta.", ["Agente não tem acesso a dados da empresa.", "Pode verificar créditos pendentes.", "Não deve prometer datas."]),
        ("Estou no exterior e preciso usar meu cartão.", "Seu cartão já está habilitado para uso internacional! Para garantir a melhor experiência, recomendo ativar o aviso de viagem no app em 'Cartões' > 'Aviso de viagem'. Assim evitamos bloqueios preventivos.", ["Cartões são habilitados internacionalmente por padrão.", "Recomendação de aviso de viagem para evitar bloqueios.", "IOF de 4.38% em compras internacionais."]),
        ("Recebi uma mensagem pedindo para confirmar dados. É golpe?", "**Nunca solicitamos dados pessoais ou senhas por mensagem.** Isso provavelmente é uma tentativa de golpe. Não clique em links e não forneça informações. Recomendo bloquear o número e, se quiser, posso registrar a ocorrência.", ["Banco nunca pede senha por mensagem/telefone.", "Orientar a não clicar em links.", "Oferecer registro de ocorrência."]),
    ]

    ds1 = Dataset(name="Demo: Atendimento Financeiro", description="Conversas reais de atendimento bancário para avaliação de qualidade")
    db.add(ds1)
    db.flush()

    ds1_records = []
    for inp, out, ctx in ds_records_atendimento:
        rec = DatasetRecord(dataset_id=ds1.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        ds1_records.append(rec)
    db.commit()

    # Dataset de vendas
    ds_records_vendas = [
        ("Quanto custa o plano premium?", "O plano Premium custa R$ 49,90/mês com os primeiros 3 meses grátis na promoção atual! Inclui cartão adicional sem anuidade, seguro viagem e cashback de 2%.", ["Plano Premium: R$ 49,90/mês.", "Promoção: 3 meses grátis.", "Inclui: cartão adicional, seguro viagem, cashback 2%."]),
        ("Quero abrir uma conta, como funciona?", "Abrir conta é super simples e 100% digital! Basta baixar nosso app, tirar foto do documento e uma selfie. Em poucos minutos sua conta está ativa. Quer que eu envie o link?", ["Abertura 100% digital pelo app.", "Documentos: RG/CNH + selfie.", "Conta ativa em minutos."]),
        ("Tem alguma promoção de cartão?", "Temos sim! Nosso cartão Gold está com **anuidade zero no primeiro ano** e limite inicial de até R$ 10.000. Além disso, você ganha 5.000 pontos de bônus na adesão!", ["Promoção Gold: anuidade zero 1o ano.", "Limite inicial até R$ 10.000.", "Bônus: 5.000 pontos na adesão."]),
        ("Preciso de um empréstimo urgente.", "Entendo a urgência! Temos o crédito pessoal com liberação em até 24 horas. As taxas começam em 1,49% ao mês. Posso fazer uma simulação rápida agora mesmo.", ["Crédito pessoal: liberação em 24h.", "Taxas a partir de 1,49% a.m.", "Simulação disponível no chat."]),
        ("Seu banco é seguro?", "Absoluta segurança! Somos regulados pelo Banco Central, temos certificação ISO 27001, e seus depósitos são protegidos pelo FGC até R$ 250.000. Além disso, usamos autenticação biométrica e criptografia de ponta.", ["Regulado pelo Banco Central.", "Certificação ISO 27001.", "FGC: proteção até R$ 250.000.", "Biometria + criptografia."]),
    ]

    ds2 = Dataset(name="Demo: Conversas de Vendas", description="Interações do agente de vendas com prospects")
    db.add(ds2)
    db.flush()

    ds2_records = []
    for inp, out, ctx in ds_records_vendas:
        rec = DatasetRecord(dataset_id=ds2.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        ds2_records.append(rec)
    db.commit()

    # --- Avaliações de dataset (evolução) ---
    print("Criando avaliações de dataset...")

    # 4 avaliações do dataset de atendimento (simulando ajustes no prompt ao longo do tempo)
    profile_seg = profile_objs[1]  # Segurança rigorosa
    for eval_idx in range(4):
        eval_date = now - timedelta(days=28 - eval_idx * 8)

        ev = DatasetEvaluation(
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

    # 3 avaliações do dataset de vendas
    for eval_idx in range(3):
        eval_date = now - timedelta(days=20 - eval_idx * 7)

        ev = DatasetEvaluation(
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

    db.close()
    print("\nSeed concluído com sucesso!")
    print(f"  - {len(AGENTS)} agentes")
    print(f"  - {len(TEST_CASES)} casos de teste")
    print(f"  - {len(PROFILES)} perfis de avaliação")
    print(f"  - 13 execuções (12 completas + 1 failed)")
    print(f"  - 2 datasets ({len(ds_records_atendimento)} + {len(ds_records_vendas)} registros)")
    print(f"  - 7 avaliações de dataset")


if __name__ == "__main__":
    seed()
