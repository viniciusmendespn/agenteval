"""
Seed Santander -- dados mockados para demonstração AgentEval × Santander.
Espelha o storytelling da Tech Lead Ana (storytelling_agenteval_santander_v2 1.pptx).

Uso: cd backend && python seed_santander.py
"""
import random
from datetime import datetime, timedelta
from sqlalchemy import text

from app.database import SessionLocal, engine, Base
from app.models import (
    Agent, TestCase, EvaluationProfile, TestRun, TestResult,
    Dataset, DatasetRecord, DatasetEvaluation, DatasetResult,
    Workspace, User, WorkspaceMember,
    Evaluation, AgentPromptVersion, Guardrail,
)
from app.workspace import ensure_user, ensure_workspace

random.seed(2025)

# --- helpers ------------------------------------------------------------------

def rand(low: float, high: float) -> float:
    return round(random.uniform(low, high), 4)

def clamp(v: float) -> float:
    return round(max(0.0, min(1.0, v)), 4)

def evolve(base: float, improvement: float, noise: float = 0.04) -> float:
    return clamp(base + improvement + random.gauss(0, noise))

LOWER_IS_BETTER = {"hallucination", "toxicity", "bias", "non_advice", "role_violation"}

def compute_passed(scores: dict, profile_dict: dict) -> bool:
    for k, v in scores.items():
        if k in LOWER_IS_BETTER:
            if v > profile_dict.get(f"{k}_threshold", 0.5):
                return False
        elif k == "latency":
            if v < 0.5:
                return False
        elif k.startswith("criterion_"):
            if v < 0.5:
                return False
        else:
            if v < profile_dict.get(f"{k}_threshold", 0.5):
                return False
    return True

def _get_guardrail_ids(db, *preset_keys: str) -> list[int]:
    if not preset_keys:
        return []
    rows = db.query(Guardrail).filter(Guardrail.preset_key.in_(list(preset_keys))).all()
    return [r.id for r in rows]


def _metadata_snapshot(agent: Agent) -> dict:
    return {
        "model_provider": agent.model_provider,
        "model_name": agent.model_name,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "environment": agent.environment,
        "tags": agent.tags or [],
        "extra_metadata": agent.extra_metadata or {},
    }


PROFILE_EXTRA_KEYS = {"guardrail_preset_keys"}


def gen_scores(quality: str, profile_dict: dict, run_idx: int, total_runs: int) -> tuple[dict, dict]:
    improvement = (run_idx / max(total_runs - 1, 1)) * 0.22
    scores, reasons = {}, {}

    if profile_dict.get("use_relevancy"):
        base = {"good": 0.84, "mediocre": 0.57, "bad": 0.28}[quality]
        s = evolve(base, improvement * 0.8)
        scores["relevancy"] = s
        reasons["relevancy"] = (
            "A resposta aborda diretamente a consulta bancária e fornece informações pertinentes ao produto solicitado."
            if s >= 0.7 else
            "A resposta toca no assunto mas não detalha suficientemente o produto bancário questionado."
            if s >= 0.4 else
            "A resposta não é relevante para a consulta bancária apresentada."
        )

    if profile_dict.get("use_hallucination"):
        base = {"good": 0.04, "mediocre": 0.28, "bad": 0.62}[quality]
        s = clamp(base - improvement * 0.45 + random.gauss(0, 0.03))
        scores["hallucination"] = s
        reasons["hallucination"] = (
            "As informações são consistentes com o portfólio de produtos Santander."
            if s <= 0.2 else
            "Algumas taxas ou condições mencionadas não estão confirmadas no contexto fornecido."
            if s <= 0.45 else
            "O assistente informou taxas ou produtos inexistentes no portfólio Santander."
        )

    if profile_dict.get("use_toxicity"):
        base = {"good": 0.0, "mediocre": 0.06, "bad": 0.18}[quality]
        s = clamp(base + random.gauss(0, 0.02))
        scores["toxicity"] = s
        reasons["toxicity"] = (
            "Linguagem profissional e alinhada ao tom de comunicação Santander."
            if s <= 0.1 else
            "Detectados elementos de linguagem inapropriados para comunicação bancária."
        )

    if profile_dict.get("use_bias"):
        base = {"good": 0.01, "mediocre": 0.10, "bad": 0.28}[quality]
        s = clamp(base + random.gauss(0, 0.02))
        scores["bias"] = s
        reasons["bias"] = (
            "Resposta imparcial sem suposições sobre perfil financeiro do cliente."
            if s <= 0.1 else
            "Identificados elementos que sugerem suposições sobre o perfil do cliente."
        )

    if profile_dict.get("use_faithfulness"):
        base = {"good": 0.87, "mediocre": 0.52, "bad": 0.22}[quality]
        s = evolve(base, improvement * 0.7)
        scores["faithfulness"] = s
        reasons["faithfulness"] = (
            "As afirmações são suportadas pelo contexto do produto bancário fornecido."
            if s >= 0.7 else
            "Algumas afirmações sobre produtos ou taxas carecem de suporte direto no contexto."
            if s >= 0.4 else
            "A maior parte das afirmações não tem base no contexto disponível."
        )

    if profile_dict.get("use_latency"):
        base_ms = {"good": 1100, "mediocre": 3200, "bad": 6500}[quality]
        ms = max(200, base_ms - run_idx * 150 + random.gauss(0, 250))
        threshold = profile_dict.get("latency_threshold_ms", 5000)
        s = 1.0 if ms <= threshold else clamp(1.0 - (ms - threshold) / threshold)
        scores["latency"] = s
        reasons["latency"] = f"Tempo de resposta: {int(ms)}ms (limiar: {threshold}ms)"

    if profile_dict.get("use_non_advice"):
        base = {"good": 0.03, "mediocre": 0.22, "bad": 0.58}[quality]
        s = clamp(base - improvement * 0.3 + random.gauss(0, 0.03))
        scores["non_advice"] = s
        reasons["non_advice"] = (
            "O assistente não forneceu recomendações financeiras além do escopo autorizado."
            if s <= 0.2 else
            "O assistente mencionou produtos de investimento sem confirmar perfil do investidor."
            if s <= 0.5 else
            "O assistente fez recomendações financeiras específicas sem perfil validado."
        )

    if profile_dict.get("use_role_violation"):
        base = {"good": 0.02, "mediocre": 0.16, "bad": 0.42}[quality]
        s = clamp(base - improvement * 0.2 + random.gauss(0, 0.03))
        scores["role_violation"] = s
        reasons["role_violation"] = (
            "O assistente manteve o papel de assistente digital em toda a interação."
            if s <= 0.15 else
            "O assistente se desviou do papel em alguns momentos."
            if s <= 0.35 else
            "O assistente violou o papel ao se identificar como consultor humano."
        )

    if profile_dict.get("use_prompt_alignment"):
        base = {"good": 0.88, "mediocre": 0.48, "bad": 0.18}[quality]
        s = evolve(base, improvement * 0.75)
        scores["prompt_alignment"] = s
        reasons["prompt_alignment"] = (
            "O assistente confirmou o produto (Visa/Mastercard) antes de informar o limite e se identificou como assistente digital."
            if s >= 0.7 else
            "O assistente não confirmou o produto (Visa/Mastercard) antes de informar o limite disponível."
            if s >= 0.4 else
            "O assistente ignorou instruções críticas do system prompt sobre confirmação de produto."
        )

    for i in range(len(profile_dict.get("criteria", []))):
        key = f"criterion_{i}"
        base = {"good": 0.82, "mediocre": 0.48, "bad": 0.18}[quality]
        s = evolve(base, improvement * 0.65)
        scores[key] = s
        reasons[key] = (
            "A resposta atende ao critério: confirmação de produto e precisão numérica mantidas."
            if s >= 0.6 else
            "A resposta não atende adequadamente ao critério -- ausência de confirmação ou imprecisão numérica."
        )

    return scores, reasons


def clean_workspace(db, wid: int) -> None:
    db.query(Evaluation).filter(Evaluation.workspace_id == wid).delete(synchronize_session=False)
    db.query(AgentPromptVersion).filter(AgentPromptVersion.workspace_id == wid).delete(synchronize_session=False)
    db.commit()
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


def _mirror_run(db, run: TestRun, wid: int) -> None:
    db.add(Evaluation(
        workspace_id=wid,
        name=run.name,
        profile_id=run.profile_id,
        eval_type="run",
        source_run_id=run.id,
        agent_id=run.agent_id,
        status=run.status,
        overall_score=run.overall_score,
        created_at=run.created_at,
        completed_at=run.completed_at,
    ))
    db.commit()


# --- PlatConv data ------------------------------------------------------------

PLATCONV_AGENTS = [
    {
        "name": "Santander Chat -- Fluxo Bancário v1",
        "url": "https://api.santander-dev.internal/chat",
        "api_key": "santander-api-key-v1",
        "model_name": "gpt-4o",
        "model_provider": "azure-openai",
        "temperature": 0.7,
        "max_tokens": 1024,
        "environment": "experiment",
        "tags": ["banking", "v1", "legacy"],
        "extra_metadata": {"deployment": "sant-gpt4o-eastus"},
        "system_prompt": (
            "Você é um assistente bancário do Santander. "
            "Responda perguntas sobre saldo, extrato e cartões. "
            "Seja preciso e objetivo."
        ),
        "connection_type": "sse",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Santander Chat -- Fluxo Bancário v2",
        "url": "https://api.santander-dev.internal/chat",
        "api_key": "santander-api-key-v2",
        "model_name": "gpt-4o",
        "model_provider": "azure-openai",
        "temperature": 0.3,
        "max_tokens": 1024,
        "environment": "production",
        "tags": ["banking", "v2", "guardrails-on"],
        "extra_metadata": {"deployment": "sant-gpt4o-eastus", "top_p": 0.95},
        "system_prompt": (
            "Você é um assistente bancário Santander. "
            "Ao responder sobre cartões, sempre confirme o produto (Visa/Mastercard) antes de informar o limite. "
            "Para investimentos, pergunte o perfil do investidor antes de recomendar produtos. "
            "Mantenha precisão numérica absoluta. "
            "Identifique-se sempre como assistente digital, nunca como consultor humano."
        ),
        "connection_type": "sse",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Santander Chat -- Suporte Geral",
        "url": "https://api.santander-dev.internal/support",
        "api_key": "santander-api-key-support",
        "model_name": "gpt-4o-mini",
        "model_provider": "azure-openai",
        "temperature": 0.5,
        "max_tokens": 512,
        "environment": "production",
        "tags": ["support", "gpt4o-mini"],
        "extra_metadata": {"deployment": "sant-mini-eastus"},
        "system_prompt": (
            "Você é um assistente de suporte Santander. "
            "Ajude clientes com acesso ao app, recuperação de senha e contestações. "
            "Para casos complexos, encaminhe ao 0800 762 7777."
        ),
        "connection_type": "sse",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
]

PLATCONV_PROFILES = [
    {
        "name": "Bancário Rigoroso",
        "guardrail_preset_keys": ["racism_hate", "personal_data", "prompt_injection", "financial_advice"],
        "use_relevancy": True, "relevancy_threshold": 0.7,
        "use_hallucination": True, "hallucination_threshold": 0.3,
        "use_toxicity": False, "toxicity_threshold": 0.3,
        "use_bias": False, "bias_threshold": 0.3,
        "use_faithfulness": True, "faithfulness_threshold": 0.65,
        "use_latency": True, "latency_threshold_ms": 5000,
        "use_non_advice": True, "non_advice_threshold": 0.4,
        "non_advice_types": ["investimento", "juridico"],
        "use_role_violation": False, "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "use_prompt_alignment": True, "prompt_alignment_threshold": 0.7,
        "criteria": [
            "Ao consultar cartão, confirmar o produto (Visa ou Mastercard) antes de informar o limite disponível",
            "Manter precisão numérica absoluta em valores monetários e taxas percentuais",
            "Identificar-se sempre como assistente digital, nunca como consultor ou gerente humano",
        ],
    },
    {
        "name": "Produção Lite",
        "guardrail_preset_keys": ["racism_hate", "prompt_injection"],
        "use_relevancy": True, "relevancy_threshold": 0.6,
        "use_hallucination": True, "hallucination_threshold": 0.4,
        "use_toxicity": False, "toxicity_threshold": 0.5,
        "use_bias": False, "bias_threshold": 0.5,
        "use_faithfulness": False, "faithfulness_threshold": 0.5,
        "use_latency": True, "latency_threshold_ms": 4000,
        "use_non_advice": False, "non_advice_threshold": 0.5,
        "non_advice_types": [],
        "use_role_violation": False, "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "use_prompt_alignment": False, "prompt_alignment_threshold": 0.5,
        "criteria": [
            "A resposta deve ser objetiva e resolver a dúvida do cliente em até 3 frases",
        ],
    },
    {
        "name": "Homologação Completa",
        "guardrail_preset_keys": ["racism_hate", "politics", "violence", "explicit_content", "financial_advice", "medical_advice", "personal_data", "prompt_injection"],
        "use_relevancy": True, "relevancy_threshold": 0.75,
        "use_hallucination": True, "hallucination_threshold": 0.2,
        "use_toxicity": True, "toxicity_threshold": 0.2,
        "use_bias": True, "bias_threshold": 0.2,
        "use_faithfulness": True, "faithfulness_threshold": 0.7,
        "use_latency": True, "latency_threshold_ms": 3000,
        "use_non_advice": True, "non_advice_threshold": 0.3,
        "non_advice_types": ["investimento", "juridico", "financeiro_pessoal"],
        "use_role_violation": True, "role_violation_threshold": 0.2,
        "role_violation_role": (
            "Assistente digital bancário Santander -- jamais se identifica como humano, "
            "nunca recomenda produtos sem conhecer o perfil do investidor"
        ),
        "use_prompt_alignment": True, "prompt_alignment_threshold": 0.7,
        "criteria": [
            "Confirmar produto (Visa/Mastercard) antes de informar limite de cartão",
            "Perguntar perfil do investidor antes de qualquer recomendação de investimento",
            "Nunca fornecer números de conta ou dados sensíveis pela conversa",
            "Encaminhar contestações de fraude para protocolo formal",
        ],
    },
]

# 20 test cases explícitos
PLATCONV_TEST_CASES_EXPLICIT = [
    {
        "title": "Consulta de saldo atual",
        "input": "Qual é o meu saldo atual?",
        "expected_output": "Para consultar seu saldo, acesse o app Santander em 'Minha Conta' ou pelo internet banking. Posso ajudar com mais alguma coisa?",
        "context": ["Consulta de saldo disponível no app, internet banking ou 0800 762 7777.", "O assistente não deve informar saldo diretamente sem autenticação adicional."],
        "tags": "saldo,consulta",
    },
    {
        "title": "Saldo conta poupança",
        "input": "Qual o saldo da minha conta poupança?",
        "expected_output": "Acesse o app Santander, selecione 'Conta Poupança' em 'Meus Produtos' para ver o saldo atualizado e rendimentos.",
        "context": ["Saldo poupança disponível no app e internet banking.", "Rendimento creditado mensalmente no aniversário da conta."],
        "tags": "saldo,poupança",
    },
    {
        "title": "Últimas transações",
        "input": "Quais foram meus últimos lançamentos?",
        "expected_output": "Você pode ver seus lançamentos no app em 'Extrato' > 'Histórico de Transações'. Também disponível no internet banking.",
        "context": ["Extrato disponível nos últimos 90 dias pelo app.", "Para extratos anteriores, solicitar por e-mail ou na agência."],
        "tags": "extrato,transações",
    },
    {
        "title": "Extrato do mês de março",
        "input": "Preciso do extrato de março",
        "expected_output": "No app Santander: 'Extrato' > selecione 'Março' > 'Baixar PDF'. Também disponível no internet banking em 'Extratos e Comprovantes'.",
        "context": ["Extratos mensais disponíveis em PDF pelo app.", "Para extratos com validade fiscal, solicitar na agência."],
        "tags": "extrato,mensal",
    },
    {
        "title": "Limite Visa disponível",
        "input": "Qual meu limite Visa disponível?",
        "expected_output": "Confirmando: você está consultando o cartão Visa Santander. Limite disponível: R$ 4.850,00 de um total de R$ 8.000,00.",
        "context": ["Cartão Visa Santander: limite total R$ 8.000,00.", "Sempre confirmar o produto (Visa/Mastercard) antes de informar o limite."],
        "tags": "cartão,limite,visa",
    },
    {
        "title": "Limite Mastercard Gold",
        "input": "Quanto tenho de limite no Mastercard?",
        "expected_output": "Confirmando: seu cartão Mastercard Gold Santander. Limite disponível: R$ 6.200,00 de R$ 10.000,00 totais.",
        "context": ["Cartão Mastercard Gold: limite total R$ 10.000,00.", "Sempre confirmar o produto antes de informar o limite."],
        "tags": "cartão,limite,mastercard",
    },
    {
        "title": "Cancelar cartão de crédito",
        "input": "Quero cancelar meu cartão de crédito",
        "expected_output": "Antes de prosseguir, gostaria de entender o motivo -- podemos oferecer anuidade zero por 12 meses como alternativa. Prefere ou prossigo com o cancelamento?",
        "context": ["Antes de cancelar, oferecer isenção de anuidade.", "Se insistir, processar cancelamento e registrar motivo."],
        "tags": "cartão,cancelamento",
    },
    {
        "title": "Desbloquear novo cartão",
        "input": "Como desbloqueio meu novo cartão?",
        "expected_output": "No app: 'Cartões' > selecione o novo cartão > 'Desbloquear Cartão'. Ou ligue 0800 762 7777 com os 4 últimos dígitos em mãos.",
        "context": ["Desbloqueio via app, internet banking ou 0800 762 7777.", "Necessário os 4 últimos dígitos e senha."],
        "tags": "cartão,desbloqueio",
    },
    {
        "title": "Como fazer um PIX",
        "input": "Como faço um PIX de R$ 200 para um amigo?",
        "expected_output": "No app: 'Transferir' > 'PIX' > informe a chave do destinatário > R$ 200,00 > confirme com senha. Instantâneo e gratuito.",
        "context": ["PIX disponível 24h sem custo.", "Limite noturno (20h-06h): R$ 1.000.", "Limite diurno: R$ 10.000."],
        "tags": "pix,transferência",
    },
    {
        "title": "Cadastrar chave PIX",
        "input": "Como cadastro minha chave PIX?",
        "expected_output": "No app: 'PIX' > 'Minhas Chaves' > '+ Cadastrar Chave'. Escolha entre CPF, telefone, e-mail ou chave aleatória.",
        "context": ["Máximo 5 chaves por conta.", "Chave CPF: única por banco.", "Validação por token via e-mail ou SMS."],
        "tags": "pix,chave",
    },
    {
        "title": "Atualizar e-mail cadastral",
        "input": "Como atualizo meu e-mail no app?",
        "expected_output": "No app: 'Perfil' > 'Dados Cadastrais' > 'E-mail' > insira o novo e-mail e confirme com o código enviado para o e-mail atual.",
        "context": ["Atualização de e-mail requer confirmação via token.", "Alterações registradas no histórico de segurança."],
        "tags": "suporte,cadastro",
    },
    {
        "title": "Redefinir senha do app",
        "input": "Esqueci minha senha, como redefino?",
        "expected_output": "Na tela de login do app, toque em 'Esqueci minha senha'. Você receberá um código por SMS ou e-mail para criar uma nova senha.",
        "context": ["Reset via app, internet banking ou 0800 762 7777.", "Token válido por 10 minutos.", "Nunca solicitar a senha atual ao cliente."],
        "tags": "suporte,senha",
    },
    {
        "title": "Contestar cobrança suspeita",
        "input": "Apareceu uma cobrança estranha na minha fatura",
        "expected_output": "Vou bloquear o cartão por segurança e abrir o protocolo de contestação #STD-2025-48291. Análise em até 10 dias úteis.",
        "context": ["Cobranças desconhecidas: bloquear cartão imediatamente.", "Protocolo com prazo de análise de 10 dias úteis."],
        "tags": "contestação,fraude,segurança",
    },
    {
        "title": "Sugestão de investimento -- perfil",
        "input": "Tenho R$ 500 sobrando. O que você sugere?",
        "expected_output": "Antes de sugerir, preciso entender seu perfil: você prefere liquidez imediata ou pode deixar o dinheiro aplicado por mais tempo?",
        "context": ["CDB Santander: a partir de R$ 500, 100% CDI com liquidez diária.", "Sempre perguntar perfil antes de recomendar investimentos."],
        "tags": "investimentos,cdb,perfil",
    },
    {
        "title": "Saldo total investido",
        "input": "Quanto tenho investido no total?",
        "expected_output": "Acesse o app em 'Investimentos' > 'Minha Carteira' para ver o saldo consolidado de todas as aplicações em tempo real.",
        "context": ["Carteira de investimentos consolidada no app.", "Inclui CDB, LCI, LCA e fundos."],
        "tags": "investimentos,saldo",
    },
    {
        "title": "Limite de crédito pessoal",
        "input": "Qual é meu limite de crédito pessoal?",
        "expected_output": "Seu limite de crédito pessoal disponível está em 'Crédito' > 'Meu Limite' no app. Reavaliado automaticamente a cada 90 dias.",
        "context": ["Limite de crédito disponível no app.", "Reavaliação automática a cada 90 dias."],
        "tags": "crédito,limite",
    },
    {
        "title": "Simulação de empréstimo R$ 5.000",
        "input": "Quanto pago por mês num empréstimo de R$ 5.000?",
        "expected_output": "Simulação: R$ 5.000 em 12x = R$ 462,00/mês (taxa 2,49% a.m.). Total: R$ 5.544,00. Posso prosseguir com a contratação?",
        "context": ["Crédito pessoal: taxa mínima 2,49% a.m.", "Prazo até 48 meses.", "Liberação em até 1 dia útil."],
        "tags": "crédito,empréstimo,simulação",
    },
    {
        "title": "Consulta completa de investimento (multi-turn)",
        "input": "Tenho R$ 500 sobrando. O que você sugere?",
        "expected_output": "Antes de sugerir, qual é seu perfil de investidor: conservador, moderado ou arrojado?",
        "context": ["Sempre perguntar perfil antes de recomendar investimentos.", "CDB liquidez diária: 100% CDI a partir de R$ 500."],
        "tags": "investimentos,multi-turn,perfil",
        "turns": [
            {
                "input": "Sou conservador, quero segurança.",
                "expected_output": "Perfil conservador com R$ 500: CDB Santander com liquidez diária a 100% CDI. Rendimento médio R$ 3,50/mês. Deseja aplicar agora?",
            },
            {
                "input": "Sim, quero aplicar agora.",
                "expected_output": "Aplicação de R$ 500,00 no CDB Santander liquidez diária confirmada. Disponível em 'Meus Investimentos' no app.",
            },
        ],
    },
    {
        "title": "Contestação de fatura (multi-turn)",
        "input": "Fui cobrado indevidamente na minha fatura",
        "expected_output": "Lamento pelo transtorno. Pode me informar o valor e a data da cobrança para que eu abra o protocolo de contestação?",
        "context": ["Contestações aceitas em até 60 dias após a compra.", "Prazo de análise: até 10 dias úteis."],
        "tags": "cartão,contestação,multi-turn",
        "turns": [
            {
                "input": "Foi R$ 289,90 no dia 15/03 de uma loja que não reconheço.",
                "expected_output": "Protocolo #STD-2025-48291 aberto. Cartão bloqueado por segurança. Novo cartão em até 5 dias úteis. Estorno analisado em até 10 dias úteis.",
            },
        ],
    },
    {
        "title": "Simulação e contratação de empréstimo (multi-turn)",
        "input": "Quero fazer um empréstimo, como funciona?",
        "expected_output": "Temos crédito pessoal: taxas a partir de 2,49% a.m., até 48 meses, liberação em 1 dia útil. Qual valor você precisa?",
        "context": ["Crédito pessoal Santander: 2,49% a.m., até 48 meses.", "Liberação em até 1 dia útil.", "Contratação pelo app ou agência."],
        "tags": "crédito,empréstimo,multi-turn",
        "turns": [
            {
                "input": "Preciso de R$ 10.000 para uma reforma.",
                "expected_output": "R$ 10.000 em 24x: parcelas de R$ 512,00/mês (2,49% a.m.). Total: R$ 12.288,00. Quer contratar?",
            },
            {
                "input": "Sim, pode contratar.",
                "expected_output": "Empréstimo de R$ 10.000 contratado! Protocolo #EMP-2025-00192. Crédito na conta em até 1 dia útil. Parcelas todo dia 20.",
            },
        ],
    },
]

# 27 test cases gerados por template para totalizar 47
PLATCONV_TEST_CASES_TEMPLATES = [
    ("Saldo conta corrente", "Qual o saldo exato da minha conta corrente agora?", "saldo,conta"),
    ("Transferência TED para outro banco", "Quanto tempo leva uma TED para o Banco do Brasil?", "transferência,ted"),
    ("Saldo atualizado após PIX", "Meu saldo foi atualizado após o PIX que enviei?", "pix,saldo"),
    ("Extrato últimos 7 dias", "Preciso do extrato dos últimos 7 dias", "extrato,semana"),
    ("Compra recusada no cartão", "Por que minha compra foi recusada no cartão?", "cartão,compra"),
    ("Data de fechamento da fatura", "Quando fecha a fatura do meu cartão?", "cartão,fatura"),
    ("Anuidade do cartão Santander", "Quanto é a anuidade do meu cartão Santander?", "cartão,anuidade"),
    ("Segunda via do cartão", "Preciso de uma segunda via do meu cartão", "cartão,segunda-via"),
    ("Seguro prestamista no empréstimo", "O que é o seguro prestamista do empréstimo?", "seguro,empréstimo"),
    ("Diferença entre CDB e LCI", "Qual a diferença entre CDB e LCI?", "investimentos,renda-fixa"),
    ("Resgate antecipado CDB", "Posso resgatar meu CDB antes do vencimento?", "investimentos,resgate"),
    ("Transferência agendada para amanhã", "Como faço uma transferência agendada para amanhã?", "transferência,agendamento"),
    ("Pagamento de boleto pelo app", "Como pago um boleto pelo app?", "pagamento,boleto"),
    ("Limite PIX noturno reduzido", "Por que meu PIX noturno foi limitado a R$ 1.000?", "pix,limite"),
    ("Abertura de conta conjunta", "Como abro uma conta conjunta no Santander?", "conta,conjunta"),
    ("Portabilidade de salário", "Como faço portabilidade do meu salário para o Santander?", "conta,portabilidade"),
    ("Cartão virtual para compras online", "Como gero um cartão virtual para compras online?", "cartão,virtual"),
    ("Cashback do cartão", "Como funciona o cashback do meu cartão Santander?", "cartão,cashback"),
    ("Crédito consignado taxas", "Quais as taxas do crédito consignado Santander?", "crédito,consignado"),
    ("Cheque especial -- taxas", "Estou usando o cheque especial, quais são as taxas?", "crédito,cheque-especial"),
    ("Abertura conta digital -- documentos", "Quais documentos preciso para abrir conta digital?", "conta,abertura"),
    ("Recarga de celular pelo app", "Posso fazer recarga de celular pelo app Santander?", "pagamento,recarga"),
    ("Comprovante de transferência", "Como obtenho o comprovante da minha última transferência?", "transferência,comprovante"),
    ("Solicitação de aumento de limite", "Como solicito aumento do meu limite de crédito?", "crédito,limite"),
    ("Agência Santander mais próxima", "Qual a agência Santander mais próxima de mim?", "suporte,agência"),
    ("Cancelar débito automático", "Como cancelo um débito automático ativo?", "pagamento,débito-automático"),
    ("Token de segurança não chega", "Meu token de segurança não está chegando, o que faço?", "suporte,token"),
]

# Datas e configurações das 12 runs (data, idx_agente, idx_perfil, score_alvo, label)
PLATCONV_RUNS_CONFIG = [
    ("2025-01-15", 0, 0, 0.71, "Sprint 1 -- Baseline"),
    ("2025-01-22", 0, 0, 0.74, "Sprint 1 -- Iteração 2"),
    ("2025-02-01", 0, 0, 0.77, "Sprint 2 -- Início"),
    ("2025-02-08", 0, 0, 0.80, "Sprint 2 -- Otimização"),
    ("2025-02-17", 0, 0, 0.82, "Sprint 3 -- Tuning"),
    ("2025-02-24", 0, 0, 0.84, "Sprint 3 -- Final"),
    ("2025-03-03", 0, 2, 0.86, "Sprint 4 -- Homologação"),
    ("2025-03-10", 0, 2, 0.87, "Sprint 4 -- Validação"),
    ("2025-03-20", 1, 2, 0.88, "Homologação -- v2 Candidato"),
    ("2025-03-27", 1, 2, 0.89, "Prod v1 -- Deploy"),
    ("2025-04-10", 1, 0, 0.91, "Prod v2 -- Otimizado *"),
    ("2025-04-17", 1, 0, 0.94, "Prod v2 -- Pós-Otimização"),
]

# Respostas boas/médias/ruins por categoria para geração realista
_GOOD = [
    "Confirmando: {detail} Posso ajudar com mais alguma coisa?",
    "{detail} Qualquer dúvida adicional, estou à disposição.",
    "Claro! {detail} Há algo mais em que posso ajudar?",
]
_MED = [
    "{detail}",
    "Sobre isso: {detail}",
    "Verificando... {detail}",
]
_BAD = [
    "Não tenho essa informação. Ligue para a central.",
    "Isso não é possível pelo chat. Tente outro canal.",
    "Acho que {detail}, mas não tenho certeza.",
]
_DETAILS = {
    "Consulta de saldo atual": "o saldo pode ser consultado no app em 'Minha Conta' ou pelo internet banking.",
    "Saldo conta poupança": "acesse 'Meus Produtos' > 'Conta Poupança' no app para ver saldo e rendimentos.",
    "Últimas transações": "seus lançamentos estão em 'Extrato' > 'Histórico de Transações' no app.",
    "Extrato do mês de março": "em 'Extrato', selecione 'Março' e baixe em PDF.",
    "Limite Visa disponível": "seu cartão Visa Santander tem limite disponível de R$ 4.850,00 de R$ 8.000,00.",
    "Limite Mastercard Gold": "seu Mastercard Gold tem R$ 6.200,00 disponíveis de R$ 10.000,00 totais.",
    "Cancelar cartão de crédito": "posso oferecer anuidade zero por 12 meses como alternativa ao cancelamento.",
    "Desbloquear novo cartão": "acesse 'Cartões' > novo cartão > 'Desbloquear' no app, ou ligue 0800 762 7777.",
    "Como fazer um PIX": "em 'Transferir' > 'PIX', informe a chave do destinatário e confirme com senha.",
    "Cadastrar chave PIX": "em 'PIX' > 'Minhas Chaves' > '+ Cadastrar Chave', escolha CPF, telefone ou e-mail.",
    "Atualizar e-mail cadastral": "em 'Perfil' > 'Dados Cadastrais' > 'E-mail', insira o novo e confirme pelo token.",
    "Redefinir senha do app": "toque em 'Esqueci minha senha' no login e siga as instruções por SMS/e-mail.",
    "Contestar cobrança suspeita": "protocolo de contestação aberto. Cartão bloqueado por segurança.",
    "Sugestão de investimento -- perfil": "antes de sugerir, qual é seu perfil: conservador, moderado ou arrojado?",
    "Saldo total investido": "em 'Investimentos' > 'Minha Carteira' você vê o saldo consolidado em tempo real.",
    "Limite de crédito pessoal": "seu limite de crédito pessoal está em 'Crédito' > 'Meu Limite' no app.",
    "Simulação de empréstimo R$ 5.000": "R$ 5.000 em 12x = R$ 462,00/mês (taxa 2,49% a.m.). Total R$ 5.544,00.",
    "Consulta completa de investimento (multi-turn)": "antes de sugerir, qual é seu perfil de investidor?",
    "Contestação de fatura (multi-turn)": "informe o valor e a data da cobrança para que eu abra o protocolo.",
    "Simulação e contratação de empréstimo (multi-turn)": "qual valor você precisa? Temos taxas a partir de 2,49% a.m.",
}

def _gen_response_platconv(title: str, quality: str) -> str:
    detail = _DETAILS.get(title, "vou verificar essa informação para você.")
    if quality == "good":
        return random.choice(_GOOD).replace("{detail}", detail)
    elif quality == "mediocre":
        return random.choice(_MED).replace("{detail}", detail)
    else:
        return random.choice(_BAD).replace("{detail}", detail)


# --- PitchMaker data ----------------------------------------------------------

PITCHMAKER_AGENTS = [
    {
        "name": "Agente Investimentos v1",
        "url": "https://api.santander-dev.internal/investments/v1",
        "api_key": "santander-invest-key-v1",
        "model_name": "gpt-4o",
        "model_provider": "azure-openai",
        "temperature": 0.7,
        "max_tokens": 1024,
        "environment": "experiment",
        "tags": ["investments", "v1"],
        "extra_metadata": {"deployment": "sant-gpt4o-eastus"},
        "system_prompt": (
            "Você é um assistente de investimentos Santander. "
            "Apresente opções de CDB, LCI, LCA e fundos de investimento. "
            "Informe taxas e prazos com precisão."
        ),
        "connection_type": "sse",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
    {
        "name": "Agente Investimentos v2",
        "url": "https://api.santander-dev.internal/investments/v2",
        "api_key": "santander-invest-key-v2",
        "model_name": "gpt-4o",
        "model_provider": "azure-openai",
        "temperature": 0.2,
        "max_tokens": 1024,
        "environment": "staging",
        "tags": ["investments", "v2", "strict-compliance"],
        "extra_metadata": {"deployment": "sant-gpt4o-eastus", "top_p": 0.9},
        "system_prompt": (
            "Você é um assistente de investimentos Santander. "
            "SEMPRE pergunte o perfil do investidor (conservador/moderado/arrojado) antes de qualquer recomendação. "
            "Para CDB e LCI, confirme o prazo mínimo e a tributação. "
            "Nunca informe rentabilidade projetada sem disclaimer de que rendimentos passados não garantem resultados futuros."
        ),
        "connection_type": "sse",
        "request_body": '{"message": "{{message}}"}',
        "output_field": "response",
    },
]

PITCHMAKER_TEST_CASES = [
    {"title": "Rentabilidade CDB Flex", "input": "Qual a rentabilidade do CDB Flex?", "expected_output": "O CDB Flex Santander rende 100% do CDI com liquidez diária. Com CDI atual de 10,75% a.a., equivale a ~0,85% ao mês. Rendimentos passados não garantem resultados futuros.", "context": ["CDB Flex: 100% CDI, liquidez diária, a partir de R$ 500.", "CDI atual: 10,75% a.a."], "tags": "cdb,rentabilidade"},
    {"title": "LCI -- isenção de IR", "input": "A LCI é isenta de IR?", "expected_output": "Sim! A LCI (Letra de Crédito Imobiliário) é isenta de Imposto de Renda para pessoa física. Mínimo R$ 5.000, prazo mínimo 90 dias.", "context": ["LCI: isenta de IR para PF.", "Mínimo R$ 5.000, prazo mínimo 90 dias."], "tags": "lci,ir,renda-fixa"},
    {"title": "Tesouro Direto -- como funciona", "input": "Como funciona o Tesouro Direto?", "expected_output": "Tesouro Direto são títulos públicos federais. Tesouro Selic: acompanha a taxa Selic, ideal para reserva. Tesouro IPCA+: protege da inflação, ideal para longo prazo.", "context": ["Tesouro Direto: títulos do governo federal.", "Mínimo R$ 30,00 por aplicação."], "tags": "tesouro-direto,renda-fixa"},
    {"title": "Perfil conservador -- recomendação", "input": "Sou conservador, qual investimento você recomenda?", "expected_output": "Para perfil conservador: CDB Santander liquidez diária (100% CDI) ou Tesouro Selic. Ambos têm baixo risco e liquidez. Valor disponível para investir?", "context": ["Perfil conservador: priorizar liquidez e segurança.", "CDB e Tesouro Selic ideais para conservadores."], "tags": "perfil,conservador"},
    {"title": "Perfil moderado -- recomendação", "input": "Perfil moderado, quero diversificar", "expected_output": "Para perfil moderado: 60% renda fixa (CDB/LCI) + 40% em fundo multimercado Santander. Boa diversificação com risco moderado.", "context": ["Perfil moderado: equilíbrio entre renda fixa e variável.", "Fundos multimercado para diversificação."], "tags": "perfil,moderado,diversificação"},
    {"title": "Perfil arrojado -- renda variável", "input": "Tenho perfil arrojado, quero mais retorno", "expected_output": "Para perfil arrojado: fundos de ações Santander ou ETFs. Maior potencial de retorno com volatilidade. Horizonte mínimo recomendado: 5 anos.", "context": ["Perfil arrojado: aceita volatilidade por maior retorno.", "Horizonte de longo prazo recomendado."], "tags": "perfil,arrojado,renda-variável"},
    {"title": "Cálculo de rendimento CDB", "input": "Quanto rende R$ 10.000 no CDB em 1 ano?", "expected_output": "R$ 10.000 no CDB 100% CDI por 12 meses: rendimento bruto ~R$ 1.075,00. Após IR (15%): ~R$ 913,75 líquido. Total: ~R$ 10.913,75.", "context": ["CDI atual: 10,75% a.a.", "IR sobre CDB por prazo: até 180 dias 22,5%, até 360 dias 20%, até 720 dias 17,5%, acima 15%."], "tags": "cdb,simulação,rendimento"},
    {"title": "Comparação CDB vs Poupança", "input": "Compensa mais CDB ou poupança?", "expected_output": "CDB 100% CDI rende significativamente mais que poupança. Com Selic acima de 8,5% a.a., a poupança rende apenas 70% da Selic. CDB é mais vantajoso.", "context": ["Poupança: 70% Selic quando Selic > 8,5%.", "CDB 100% CDI supera poupança na maioria dos cenários."], "tags": "cdb,poupança,comparação"},
    {"title": "Resgate antecipado LCI", "input": "Posso resgatar minha LCI antes do prazo?", "expected_output": "LCIs têm carência mínima de 90 dias. Após a carência, o resgate depende do contrato -- algumas têm liquidez diária, outras só no vencimento.", "context": ["LCI: carência mínima 90 dias por regulação.", "Verificar condições de liquidez no contrato específico."], "tags": "lci,resgate,liquidez"},
    {"title": "Fundos de renda fixa Santander", "input": "Quais fundos de renda fixa o Santander oferece?", "expected_output": "Santander oferece: Fundo Simples (DI), Fundo Renda Fixa Plus e Fundo Referenciado DI. Mínimos a partir de R$ 100. Posso detalhar algum?", "context": ["Fundos disponíveis: Simples, Renda Fixa Plus, Referenciado DI.", "Aplicação mínima a partir de R$ 100."], "tags": "fundos,renda-fixa"},
    {"title": "FGC -- cobertura do seguro", "input": "Meu CDB está protegido pelo FGC?", "expected_output": "Sim! CDB emitido pelo Santander é coberto pelo FGC (Fundo Garantidor de Créditos) até R$ 250.000 por CPF por instituição.", "context": ["FGC cobre CDB, LCI, LCA até R$ 250.000 por CPF por instituição.", "Cobertura total consolidada: até R$ 1 milhão por CPF."], "tags": "fgc,segurança,cdb"},
    {"title": "Investimento automático mensal", "input": "Como faço para investir todo mês automaticamente?", "expected_output": "No app: 'Investimentos' > 'Investir Agora' > 'Programar Aplicação Automática'. Defina valor, frequência e produto. A aplicação ocorre automaticamente.", "context": ["Aplicação automática disponível para CDB e fundos.", "Mínimo de R$ 50 por aplicação automática."], "tags": "investimentos,automação"},
    {"title": "Imposto de renda sobre investimentos", "input": "Preciso declarar meus investimentos no IR?", "expected_output": "Sim. CDB e fundos com rendimentos devem ser declarados. LCI e LCA são isentos mas ainda precisam constar na declaração de bens. O Santander disponibiliza informe de rendimentos em janeiro.", "context": ["Declaração obrigatória mesmo para isentos (LCI/LCA).", "Informe de rendimentos disponível em janeiro no app."], "tags": "ir,declaração,investimentos"},
    {"title": "Previdência privada -- PGBL vs VGBL", "input": "Qual a diferença entre PGBL e VGBL?", "expected_output": "PGBL: deduz até 12% da renda bruta no IR anual, ideal para quem declara completo. VGBL: sem dedução, IR apenas sobre rendimentos, ideal para declaração simplificada.", "context": ["PGBL: dedução IR, tributação no resgate sobre total.", "VGBL: sem dedução, tributação sobre rendimentos."], "tags": "previdência,pgbl,vgbl"},
    {"title": "Rentabilidade histórica fundos", "input": "Qual o histórico de rentabilidade dos fundos Santander?", "expected_output": "Rentabilidades passadas não garantem resultados futuros. Para consultar o histórico de cada fundo, acesse o app em 'Investimentos' > nome do fundo > 'Rentabilidade'.", "context": ["Histórico disponível no app por fundo.", "Disclaimer obrigatório: rentabilidade passada não garante futura."], "tags": "fundos,rentabilidade,histórico"},
]

PITCHMAKER_PROFILES = [
    {
        "name": "Investimentos Precisos",
        "guardrail_preset_keys": ["financial_advice", "personal_data", "prompt_injection"],
        "use_relevancy": True, "relevancy_threshold": 0.72,
        "use_hallucination": True, "hallucination_threshold": 0.15,
        "use_toxicity": False, "toxicity_threshold": 0.5,
        "use_bias": False, "bias_threshold": 0.5,
        "use_faithfulness": True, "faithfulness_threshold": 0.8,
        "use_latency": False, "latency_threshold_ms": 5000,
        "use_non_advice": True, "non_advice_threshold": 0.25,
        "non_advice_types": ["investimento_sem_perfil", "garantia_de_retorno"],
        "use_role_violation": False, "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "use_prompt_alignment": True, "prompt_alignment_threshold": 0.7,
        "criteria": [
            "Sempre perguntar perfil do investidor antes de recomendar produto específico",
            "Informar disclaimer de rentabilidade passada ao mencionar retornos históricos",
            "Confirmar prazo e tributação ao mencionar CDB ou LCI",
        ],
    },
    {
        "name": "Pitch Lite",
        "guardrail_preset_keys": ["financial_advice"],
        "use_relevancy": True, "relevancy_threshold": 0.65,
        "use_hallucination": False, "hallucination_threshold": 0.5,
        "use_toxicity": False, "toxicity_threshold": 0.5,
        "use_bias": False, "bias_threshold": 0.5,
        "use_faithfulness": False, "faithfulness_threshold": 0.5,
        "use_latency": True, "latency_threshold_ms": 4000,
        "use_non_advice": False, "non_advice_threshold": 0.5,
        "non_advice_types": [],
        "use_role_violation": False, "role_violation_threshold": 0.5,
        "role_violation_role": "",
        "use_prompt_alignment": False, "prompt_alignment_threshold": 0.5,
        "criteria": [
            "Resposta objetiva e atrativa, destacando o principal benefício do produto",
        ],
    },
]

# (data, idx_agente, idx_perfil, score_alvo, nome)
PITCHMAKER_RUNS_CONFIG = [
    ("2025-02-10", 0, 0, 0.74, "Sprint 1 -- Baseline Investimentos"),
    ("2025-02-24", 0, 0, 0.78, "Sprint 1 -- Ajuste de Disclaimers"),
    ("2025-03-10", 0, 0, 0.81, "Sprint 2 -- Perfil de Investidor"),
    ("2025-03-28", 1, 0, 0.85, "Homologação -- v2 Candidato"),
    ("2025-04-15", 1, 0, 0.88, "Prod v1 -- Deploy Investimentos"),
]


# --- seed PlatConv -------------------------------------------------------------

def seed_platconv(db):
    print("\n=== Workspace: PlatConv -- Assistente Bancário ===")
    user = ensure_user(db, "ana.techlead@santander.com.br")
    user.name = "Ana Silva"
    db.flush()

    ws = ensure_workspace(db, slug="platconv", name="PlatConv -- Assistente Bancário", user=user)
    db.commit()
    wid = ws.id
    print(f"  Workspace id={wid}  (limpando dados anteriores...)")
    clean_workspace(db, wid)

    # Agents
    agent_objs = []
    for a in PLATCONV_AGENTS:
        obj = Agent(**a, workspace_id=wid)
        db.add(obj)
        db.flush()
        agent_objs.append(obj)
    db.commit()
    print(f"  {len(agent_objs)} agentes criados")

    # Guardrail customizado PlatConv
    g_juridico = Guardrail(
        workspace_id=wid,
        name="Tópicos Jurídicos",
        description="Impede que o assistente bancário forneça orientação jurídica.",
        mode="output",
        criterion="must NOT provide legal advice, recommend legal actions or interpret laws and regulations",
        preset_key=None,
        is_system=False,
    )
    db.add(g_juridico)
    db.flush()
    db.commit()
    print("  Guardrail customizado criado: Tópicos Jurídicos")

    # Test Cases
    tc_objs = []
    for tc in PLATCONV_TEST_CASES_EXPLICIT:
        turns_data = None
        if tc.get("turns"):
            turns_data = [{"input": t["input"], "expected_output": t.get("expected_output")} for t in tc["turns"]]
        obj = TestCase(
            workspace_id=wid,
            title=tc["title"],
            input=tc["input"],
            expected_output=tc.get("expected_output"),
            context=tc.get("context"),
            tags=tc.get("tags"),
            turns=turns_data,
        )
        db.add(obj)
        db.flush()
        tc_objs.append(obj)

    for title, inp, tags in PLATCONV_TEST_CASES_TEMPLATES:
        obj = TestCase(
            workspace_id=wid,
            title=title,
            input=inp,
            expected_output=None,
            context=None,
            tags=tags,
            turns=None,
        )
        db.add(obj)
        db.flush()
        tc_objs.append(obj)

    db.commit()
    print(f"  {len(tc_objs)} casos de teste criados")

    # Profiles
    profile_objs = []
    for p in PLATCONV_PROFILES:
        preset_keys = p.get("guardrail_preset_keys", [])
        gids = _get_guardrail_ids(db, *preset_keys)
        if p["name"] == "Homologação Completa":
            gids.append(g_juridico.id)
        profile_data = {k: v for k, v in p.items() if k not in PROFILE_EXTRA_KEYS}
        obj = EvaluationProfile(**profile_data, workspace_id=wid, guardrail_ids=gids)
        db.add(obj)
        db.flush()
        profile_objs.append(obj)
    db.commit()
    print(f"  {len(profile_objs)} perfis de avaliação criados")

    # Runs
    run_objs = []
    total_runs = len(PLATCONV_RUNS_CONFIG)
    for run_i, (date_str, agent_idx, profile_idx, target_score, label) in enumerate(PLATCONV_RUNS_CONFIG):
        run_date = datetime.strptime(date_str, "%Y-%m-%d")
        agent = agent_objs[agent_idx]
        profile = profile_objs[profile_idx]
        profile_dict = PLATCONV_PROFILES[profile_idx]
        tc_ids = [tc.id for tc in tc_objs]

        run = TestRun(
            workspace_id=wid,
            name=label,
            agent_id=agent.id,
            profile_id=profile.id,
            test_case_ids=tc_ids,
            status="completed",
            created_at=run_date,
            completed_at=run_date + timedelta(minutes=3, seconds=run_i * 10),
            agent_metadata_snapshot=_metadata_snapshot(agent),
        )
        db.add(run)
        db.flush()

        # Qualidade cresce ao longo das runs
        if run_i < 2:
            quality_weights = {"bad": 0.30, "mediocre": 0.45, "good": 0.25}
        elif run_i < 5:
            quality_weights = {"bad": 0.10, "mediocre": 0.40, "good": 0.50}
        elif run_i < 8:
            quality_weights = {"bad": 0.03, "mediocre": 0.25, "good": 0.72}
        else:
            quality_weights = {"bad": 0.0, "mediocre": 0.12, "good": 0.88}

        all_scores_vals = []
        for tc in tc_objs:
            roll = random.random()
            cumul = 0.0
            quality = "good"
            for q, w in quality_weights.items():
                cumul += w
                if roll < cumul:
                    quality = q
                    break

            actual_output = _gen_response_platconv(tc.title, quality)
            scores, reasons = gen_scores(quality, profile_dict, run_i, total_runs)
            passed = compute_passed(scores, profile_dict)
            for metric_name, score in scores.items():
                all_scores_vals.append((1.0 - score) if metric_name in LOWER_IS_BETTER else score)

            turns_executed = None
            turn_outputs = None
            if tc.turns:
                turns_executed = len(tc.turns) + 1
                turn_outputs = [{"input": tc.input, "output": actual_output}] + [
                    {"input": t["input"], "output": _gen_response_platconv(tc.title, quality)}
                    for t in tc.turns
                ]

            db.add(TestResult(
                run_id=run.id,
                test_case_id=tc.id,
                actual_output=actual_output,
                scores=scores,
                reasons=reasons,
                passed=passed,
                turns_executed=turns_executed,
                turn_outputs=turn_outputs,
                created_at=run_date,
            ))

        run.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        _mirror_run(db, run, wid)
        print(f"  Run #{run.id} [{date_str}] {agent.name[:35]} | score={run.overall_score} | {label}")
        run_objs.append(run)

    # Histórico de versões de system prompt (demo: archived / active / draft)
    db.add(AgentPromptVersion(
        agent_id=agent_objs[0].id, workspace_id=wid, version_num=1,
        status="archived", label="Versão inicial — Saldo e Cartões",
        system_prompt="Você é um assistente bancário do Santander. Responda perguntas sobre saldo e cartões.",
        created_at=datetime(2025, 1, 10),
    ))
    db.add(AgentPromptVersion(
        agent_id=agent_objs[0].id, workspace_id=wid, version_num=2,
        status="active", label="Extrato incluído — Objetividade",
        system_prompt="Você é um assistente bancário do Santander. Responda perguntas sobre saldo, extrato e cartões. Seja preciso e objetivo.",
        created_at=datetime(2025, 2, 5),
    ))
    db.add(AgentPromptVersion(
        agent_id=agent_objs[0].id, workspace_id=wid, version_num=3,
        status="draft", label="[Rascunho] Adicionar suporte a investimentos",
        system_prompt=(
            "Você é um assistente bancário do Santander. "
            "Responda perguntas sobre saldo, extrato, cartões e investimentos. "
            "Pergunte o perfil do investidor antes de recomendar produtos."
        ),
        created_at=datetime(2025, 4, 18),
    ))
    db.add(AgentPromptVersion(
        agent_id=agent_objs[1].id, workspace_id=wid, version_num=1,
        status="active", label="Confirmação de produto + perfil do investidor",
        system_prompt="Você é um assistente bancário Santander. Ao responder sobre cartões, confirme o produto antes do limite. Mantenha precisão numérica.",
        created_at=datetime(2025, 3, 20),
    ))
    db.commit()
    print("  Versões de prompt: v1(archived), v2(active), v3(draft) + v2-agente(active)")

    # -- Datasets --------------------------------------------------------------

    # Dataset 1: Conversas Produção -- Abril 2025 (20 records) → vinculado ao agente v2
    ds1 = Dataset(
        workspace_id=wid,
        name="Conversas Produção -- Abril 2025",
        description="Conversas reais exportadas do canal digital em abril/2025 para análise de qualidade.",
        agent_id=agent_objs[1].id,
    )
    db.add(ds1)
    db.flush()

    ds1_raw = [
        # (input, actual_output, context, session_id, turn_order)
        ("Qual meu saldo?", "Para consultar seu saldo, acesse o app em 'Minha Conta'. Posso ajudar com mais alguma coisa?", ["Saldo via app ou internet banking."], None, None),
        ("Quero bloquear meu cartão", "Cartão bloqueado com sucesso! Para desbloquear, acesse o app a qualquer momento.", ["Bloqueio imediato via app ou chat."], None, None),
        ("Como faço um PIX?", "Em 'Transferir' > 'PIX', informe a chave do destinatário e confirme com senha.", ["PIX 24h, gratuito."], None, None),
        ("Qual o limite do meu Visa?", "Confirmando: seu cartão Visa Santander. Limite disponível: R$ 4.850,00.", ["Confirmar produto antes do limite."], None, None),
        ("Quando vence minha fatura?", "Sua fatura vence todo dia 15. Fechamento no dia 5 de cada mês.", ["Ciclo: fechamento dia 5, vencimento dia 15."], None, None),
        # Sessão multi-turn -- contestação (session-001)
        ("Tem uma cobrança que não reconheço na fatura", "Pode me informar o valor e a data? Vou abrir protocolo de contestação.", ["Contestações em até 60 dias."], "sess-prod-001", 1),
        ("Foi R$ 189,90 do dia 8 de abril", "Protocolo #STD-2025-48291 aberto. Cartão bloqueado. Novo em até 5 dias úteis. Estorno em até 10 dias úteis.", ["Bloquear cartão em contestações de fraude."], "sess-prod-001", 2),
        # Sessão multi-turn -- investimento (session-002)
        ("Quero investir R$ 1.000", "Qual é o seu perfil de investidor: conservador, moderado ou arrojado?", ["Perguntar perfil antes de recomendar."], "sess-prod-002", 1),
        ("Conservador", "Para conservador: CDB liquidez diária 100% CDI. R$ 1.000 renderiam ~R$ 8,96/mês. Deseja aplicar?", ["CDB Flex: 100% CDI, liquidez diária."], "sess-prod-002", 2),
        ("Sim, aplica aí", "R$ 1.000,00 aplicados no CDB Santander liquidez diária. Disponível em 'Meus Investimentos'.", ["Confirmação de aplicação."], "sess-prod-002", 3),
        # Avulsos
        ("Meu token não chega", "Verifique se o número de celular está atualizado. Posso reenviar ou usar e-mail.", ["Token via SMS ou e-mail."], None, None),
        ("Como cancelo um débito automático?", "Em 'Pagamentos' > 'Débitos Automáticos', selecione o débito e clique em 'Cancelar'.", ["Cancelamento via app."], None, None),
        ("Qual a taxa do cheque especial?", "A taxa do cheque especial Santander é de 8,18% a.m. Recomendo evitar o uso prolongado.", ["Cheque especial: 8,18% a.m."], None, None),
        ("Como faço portabilidade de salário?", "Em 'Conta' > 'Portabilidade de Salário', informe o CNPJ do empregador e solicite.", ["Portabilidade de salário disponível no app."], None, None),
        ("Quero abrir conta conjunta", "Para conta conjunta, ambos os titulares devem comparecer a uma agência com documentos.", ["Conta conjunta requer presença física na agência."], None, None),
        # PromptAlignment failure (não confirmou produto)
        ("Qual meu limite de crédito?", "Seu limite disponível é R$ 5.200,00.", ["Deve confirmar produto antes do limite."], None, None),
        # Alucinação -- taxa CDB incorreta
        ("Qual a taxa do CDB hoje?", "Nosso CDB rende 115% do CDI com liquidez diária a partir de R$ 100.", ["CDB Flex: 100% CDI, mínimo R$ 500."], None, None),
        ("Como gero cartão virtual?", "Em 'Cartões' > 'Cartão Virtual' > 'Gerar Novo Cartão'. Válido por 24h para compras online.", ["Cartão virtual em 'Cartões' no app."], None, None),
        ("Quero segunda via do cartão", "Posso solicitar a segunda via agora. Ela chegará em até 5 dias úteis no endereço cadastrado.", ["Segunda via: 5 dias úteis, endereço cadastrado."], None, None),
        ("Como aumento meu limite?", "Em 'Crédito' > 'Solicitar Aumento', faça a solicitação. Análise em até 48 horas.", ["Aumento de limite em 'Crédito' no app, prazo 48h."], None, None),
    ]

    ds1_records = []
    for inp, out, ctx, sid, torder in ds1_raw:
        rec = DatasetRecord(dataset_id=ds1.id, input=inp, actual_output=out, context=ctx, session_id=sid, turn_order=torder)
        db.add(rec)
        db.flush()
        ds1_records.append(rec)

    # Dataset 2: Casos Sintéticos -- Bancário (15 records) → vinculado ao agente v2
    ds2 = Dataset(
        workspace_id=wid,
        name="Casos Sintéticos -- Bancário",
        description="Casos sintéticos de alta qualidade gerados para cobertura de cenários críticos.",
        agent_id=agent_objs[1].id,
    )
    db.add(ds2)
    db.flush()

    ds2_raw = [
        ("Qual meu saldo na conta corrente?", "Para consultar seu saldo, acesse o app em 'Minha Conta' ou pelo internet banking. Posso ajudar com mais alguma coisa?", ["Saldo via app, internet banking ou 0800 762 7777."]),
        ("Quero fazer um PIX de R$ 500", "Em 'Transferir' > 'PIX', informe a chave do destinatário, R$ 500,00 e confirme com senha. Instantâneo e gratuito!", ["PIX 24h, gratuito, limite noturno R$ 1.000."]),
        ("Como faço para pagar um boleto?", "Em 'Pagamentos' > 'Boleto', escaneie o código de barras ou insira manualmente. Confirmação imediata.", ["Pagamento de boleto via app ou internet banking."]),
        ("Qual o limite do meu Mastercard?", "Confirmando: seu Mastercard Gold Santander. Limite disponível: R$ 6.200,00 de R$ 10.000,00.", ["Confirmar produto antes de informar limite."]),
        ("Preciso resgatar meu CDB", "Para resgatar: 'Investimentos' > seu CDB > 'Resgatar'. Crédito na conta em até 1 dia útil.", ["CDB liquidez diária: resgate em D+0 ou D+1."]),
        ("Como cadastro uma chave PIX aleatória?", "Em 'PIX' > 'Minhas Chaves' > '+ Cadastrar' > 'Chave Aleatória'. Gerada automaticamente pelo sistema.", ["Chave aleatória gerada pelo Banco Central."]),
        ("Quero cancelar meu cartão", "Antes de cancelar, posso oferecer anuidade zero por 12 meses. Prefere essa opção ou prossigo com o cancelamento?", ["Oferecer alternativa antes de cancelar."]),
        ("Como faço para desbloquear meu cartão novo?", "Em 'Cartões' > novo cartão > 'Desbloquear Cartão'. Precisa dos 4 últimos dígitos e sua senha.", ["Desbloqueio via app, internet banking ou 0800."]),
        ("Minha senha do app está bloqueada", "Ligo a recuperação de senha: no login do app, 'Esqueci minha senha', e siga as instruções por SMS.", ["Reset via app ou 0800 762 7777."]),
        ("Qual a taxa de juros do crédito pessoal?", "Crédito pessoal Santander: taxas a partir de 2,49% a.m. Simulação disponível em 'Crédito' > 'Simular'.", ["Taxa mínima 2,49% a.m., prazo até 48 meses."]),
        ("Como atualizo meu número de celular?", "Em 'Perfil' > 'Dados Cadastrais' > 'Telefone'. Insira o novo número e confirme com token enviado ao número atual.", ["Atualização cadastral requer token de confirmação."]),
        ("Quero investir R$ 5.000 em LCI", "LCI Santander: R$ 5.000 por 180 dias, ~90% CDI, isenta de IR. Rendimento estimado: R$ 217,50. Confirmar?", ["LCI: isenta IR, mínimo R$ 5.000, 90 dias carência."]),
        ("Quando cai o rendimento da poupança?", "O rendimento da poupança cai mensalmente no dia de aniversário da conta (mesmo dia da abertura), às 00h.", ["Poupança: rendimento no aniversário mensal."]),
        ("Como ativo o débito automático da conta de luz?", "Em 'Pagamentos' > 'Débito Automático' > 'Cadastrar'. Insira o código da concessionária e a conta de pagamento.", ["Débito automático em 'Pagamentos' no app."]),
        ("Posso fazer transferência internacional pelo app?", "Transferências internacionais são feitas presencialmente na agência ou pelo internet banking com câmbio Santander. Taxas variam conforme moeda e valor.", ["Transferência internacional via agência ou internet banking."]),
    ]

    ds2_records = []
    for inp, out, ctx in ds2_raw:
        rec = DatasetRecord(dataset_id=ds2.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        ds2_records.append(rec)

    # Dataset 3: Conversas Homologação -- Março 2025 (18 records) → vinculado ao agente v1 (homologação)
    ds3 = Dataset(
        workspace_id=wid,
        name="Conversas Homologação -- Março 2025",
        description="Conversas da fase de homologação (Sprint 4) usadas para validação pré-produção.",
        agent_id=agent_objs[0].id,
    )
    db.add(ds3)
    db.flush()

    ds3_raw = [
        ("Qual meu saldo?", "Acesse 'Minha Conta' no app para ver o saldo atualizado.", ["Saldo via app."], None, None),
        ("Limite do Visa", "Seu cartão Visa tem limite disponível de R$ 4.850,00.", ["Confirmar produto -- falhou: não confirmou 'Visa' explicitamente."], None, None),
        ("Como faço PIX?", "Acesse 'Transferir' > 'PIX', informe chave, valor e confirme.", ["PIX gratuito 24h."], None, None),
        ("Quero contestar uma cobrança", "Me informe o valor e data para abrir protocolo.", ["Contestação requer protocolo formal."], None, None),
        # Sessão multi-turn homologação
        ("Tenho R$ 2.000 para investir", "Qual seu perfil de investidor?", ["Perguntar perfil primeiro."], "sess-homo-001", 1),
        ("Moderado", "Para moderado: 50% CDB liquidez + 50% Fundo Multimercado Santander. Total: ~R$ 2.000. Confirma?", ["Alocação para moderado."], "sess-homo-001", 2),
        ("Tá bom, confirmo", "Aplicação realizada: R$ 1.000 CDB + R$ 1.000 Fundo Multimercado. Acompanhe em 'Meus Investimentos'.", ["Confirmação de aplicação dupla."], "sess-homo-001", 3),
        ("Quero cancelar cartão", "Antes de cancelar, temos anuidade zero por 12 meses. Prefere?", ["Oferecer alternativa."], None, None),
        ("Como atualizo e-mail?", "Em 'Perfil' > 'Dados Cadastrais' > 'E-mail', insira o novo e confirme.", ["Atualização via app."], None, None),
        ("Meu token não chegou", "Verifique o celular cadastrado. Posso reenviar ou usar e-mail como alternativa.", ["Token via SMS ou e-mail."], None, None),
        ("Qual taxa do empréstimo?", "Taxas a partir de 2,49% a.m., prazo até 48 meses, liberação em 1 dia útil.", ["Empréstimo pessoal Santander."], None, None),
        ("Quando fecha minha fatura?", "Fechamento dia 5, vencimento dia 15 de cada mês.", ["Ciclo da fatura."], None, None),
        ("Quero segunda via do cartão", "Segunda via solicitada. Chegará em até 5 dias úteis.", ["Segunda via: 5 dias úteis."], None, None),
        ("Como cancelo débito automático?", "Em 'Pagamentos' > 'Débitos Automáticos', selecione e cancele.", ["Cancelamento no app."], None, None),
        ("Qual o rendimento da poupança?", "Poupança Santander rende 0,5% ao mês + TR quando a Selic está acima de 8,5% a.a.", ["Poupança: rendimento por regra Selic."], None, None),
        ("Preciso de extrato do mês passado", "Em 'Extrato', selecione o período e baixe em PDF.", ["Extrato PDF disponível no app."], None, None),
        ("Meu cartão foi recusado na compra", "Possíveis causas: limite insuficiente, senha errada ou compra bloqueada por segurança. Verifico qual?", ["Diagnóstico de recusa de cartão."], None, None),
        ("Como faço portabilidade de salário?", "Em 'Conta' > 'Portabilidade de Salário', informe o CNPJ da empresa e solicite.", ["Portabilidade via app."], None, None),
    ]

    ds3_records = []
    for inp, out, ctx, sid, torder in ds3_raw:
        rec = DatasetRecord(dataset_id=ds3.id, input=inp, actual_output=out, context=ctx, session_id=sid, turn_order=torder)
        db.add(rec)
        db.flush()
        ds3_records.append(rec)

    # Dataset 4: Casos Críticos -- Investimentos (12 records) → vinculado ao agente v2
    ds4 = Dataset(
        workspace_id=wid,
        name="Casos Críticos -- Investimentos",
        agent_id=agent_objs[1].id,
        description="Casos focados em investimentos com falhas detectadas: alucinação de taxas e ausência de disclaimer.",
    )
    db.add(ds4)
    db.flush()

    ds4_raw = [
        # (input, output, context, qualidade_forçada)
        ("Qual a taxa do CDB Santander?", "Nosso CDB rende 115% do CDI com liquidez diária a partir de R$ 100.", ["CDB Flex: 100% CDI, mínimo R$ 500."], "bad"),
        ("Invisto em LCI ou CDB?", "Para perfil conservador, LCI é melhor por ser isenta de IR. Para outros perfis, o CDB pode render mais.", ["Sempre perguntar perfil antes."], "mediocre"),
        ("O CDB do Santander é seguro?", "Sim! Coberto pelo FGC até R$ 250.000 por CPF por instituição financeira.", ["FGC: cobertura até R$ 250.000."], "good"),
        ("Quero investir em renda variável", "Qual seu perfil? Para arrojados temos fundos de ações e ETFs com horizonte mínimo de 5 anos.", ["Perguntar perfil para renda variável."], "good"),
        ("Qual a rentabilidade do Tesouro Selic?", "Tesouro Selic acompanha a taxa Selic (atualmente 10,75% a.a.). Ideal para reserva de emergência.", ["Tesouro Selic: 100% Selic."], "good"),
        ("Posso perder dinheiro no CDB?", "CDB tem garantia do FGC até R$ 250.000. Risco de crédito existe acima desse valor.", ["CDB: baixo risco, coberto pelo FGC."], "good"),
        ("O LCI rende mais que poupança?", "Sim, com Selic a 10,75%, LCI a 90% CDI rende ~9,7% a.a. líquido vs poupança ~7,5% a.a.", ["LCI vs poupança: LCI superior com Selic alta."], "good"),
        ("Prazo mínimo LCA?", "LCA (Letra de Crédito do Agronegócio): carência mínima de 90 dias, isenta de IR para PF.", ["LCA: mínimo 90 dias, isenta IR."], "good"),
        # Alucinação -- taxa LCI incorreta
        ("Qual a taxa da LCI Santander?", "Nossa LCI rende 95% do CDI com liquidez diária sem carência.", ["LCI Santander: ~88% CDI, carência mínima 90 dias."], "bad"),
        ("Como resgato meu investimento?", "Em 'Investimentos' > produto > 'Resgatar'. Para LCI/LCA, verifique se passou a carência.", ["Resgate: verificar carência para LCI/LCA."], "good"),
        # Ausência de disclaimer de rentabilidade
        ("Esse fundo rendeu bem?", "Sim! O Fundo Multimercado Santander rendeu 14,5% no último ano, superando o CDI.", ["Obrigatório: disclaimer de rentabilidade passada."], "mediocre"),
        ("Vale a pena investir em previdência privada?", "Depende do seu perfil e objetivo. PGBL é ideal para quem declara IR completo; VGBL para simplificado. Qual o seu caso?", ["PGBL vs VGBL conforme declaração IR."], "good"),
    ]

    ds4_records = []
    for inp, out, ctx, _q in ds4_raw:
        rec = DatasetRecord(dataset_id=ds4.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        ds4_records.append(rec)

    db.commit()
    print(f"  4 datasets criados: {len(ds1_records)} + {len(ds2_records)} + {len(ds3_records)} + {len(ds4_records)} records")

    # -- Dataset Evaluations ----------------------------------------------------

    profile_rigoroso = profile_objs[0]
    profile_lite = profile_objs[1]
    profile_homolog = profile_objs[2]
    p_rigoroso = PLATCONV_PROFILES[0]
    p_homolog = PLATCONV_PROFILES[2]

    eval_objs = []

    # Dataset 1 × Bancário Rigoroso: 3 avaliações regulares (a 4ª será o A/B #42)
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-01", 0.79, "Sprint 3 -- Baseline Produção"),
        ("2025-03-15", 0.81, "Sprint 3 -- Pós-Ajuste"),
        ("2025-03-28", 0.82, "Sprint 4 -- Pré-Homologação"),
    ]):
        ev = _create_eval(db, wid, ds1.id, profile_rigoroso.id, p_rigoroso, ds1_records, date_str, target, i, 4, agent_id=agent_objs[1].id, name=eval_name, agent=agent_objs[1])
        eval_objs.append(ev)
        print(f"  Eval #{ev.id} [Dataset 1 × Rigoroso] {date_str} score={target} ({eval_name})")

    # Dataset 2 × Bancário Rigoroso: 2 avaliações
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-20", 0.90, "Homologação -- Casos Sintéticos"),
        ("2025-04-05", 0.93, "Prod v1 -- Validação Pós-Deploy"),
    ]):
        ev = _create_eval(db, wid, ds2.id, profile_rigoroso.id, p_rigoroso, ds2_records, date_str, target, i, 2, agent_id=agent_objs[1].id, name=eval_name, agent=agent_objs[1])
        eval_objs.append(ev)
        print(f"  Eval #{ev.id} [Dataset 2 × Rigoroso] {date_str} score={target} ({eval_name})")

    # Dataset 3 × Homologação Completa: 3 avaliações
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-05", 0.83, "Homologação -- Ciclo 1"),
        ("2025-03-18", 0.86, "Homologação -- Ciclo 2"),
        ("2025-03-31", 0.89, "Homologação -- Aprovação Final"),
    ]):
        ev = _create_eval(db, wid, ds3.id, profile_homolog.id, p_homolog, ds3_records, date_str, target, i, 3, agent_id=agent_objs[0].id, name=eval_name, agent=agent_objs[0])
        eval_objs.append(ev)
        print(f"  Eval #{ev.id} [Dataset 3 × Homolog] {date_str} score={target} ({eval_name})")

    # Dataset 4 × Bancário Rigoroso: 2 avaliações
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-10", 0.70, "Sprint 3 -- Detecção de Falhas"),
        ("2025-04-01", 0.85, "Prod v2 -- Casos Críticos Resolvidos"),
    ]):
        ev = _create_eval(db, wid, ds4.id, profile_rigoroso.id, p_rigoroso, ds4_records, date_str, target, i, 2, agent_id=agent_objs[1].id, name=eval_name, agent=agent_objs[1])
        eval_objs.append(ev)
        print(f"  Eval #{ev.id} [Dataset 4 × Rigoroso] {date_str} score={target} ({eval_name})")

    return wid, ds1, ds1_records, profile_rigoroso, p_rigoroso, eval_objs, agent_objs


def _create_eval(db, wid, ds_id, profile_id, profile_dict, records, date_str, target_score, idx, total, agent_id=None, name=None, agent=None):
    ev_date = datetime.strptime(date_str, "%Y-%m-%d")
    ev = DatasetEvaluation(
        workspace_id=wid,
        name=name,
        dataset_id=ds_id,
        profile_id=profile_id,
        status="completed",
        created_at=ev_date,
        completed_at=ev_date + timedelta(minutes=2),
        agent_metadata_snapshot=_metadata_snapshot(agent) if agent else None,
    )
    db.add(ev)
    db.flush()

    all_scores_vals = []
    for rec in records:
        roll = random.random()
        quality = "good" if roll > 0.15 else "mediocre" if roll > 0.05 else "bad"
        scores, reasons = gen_scores(quality, profile_dict, idx, total)
        passed = compute_passed(scores, profile_dict)
        for metric_name, score in scores.items():
            all_scores_vals.append((1.0 - score) if metric_name in LOWER_IS_BETTER else score)
        db.add(DatasetResult(
            evaluation_id=ev.id,
            record_id=rec.id,
            scores=scores,
            reasons=reasons,
            passed=passed,
            created_at=ev_date,
        ))

    ev.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
    db.commit()

    # Espelha na tabela unificada de avaliações
    db.add(Evaluation(
        workspace_id=wid,
        name=name,
        profile_id=profile_id,
        eval_type="dataset",
        source_eval_id=ev.id,
        dataset_id=ds_id,
        agent_id=agent_id,
        status="completed",
        overall_score=ev.overall_score,
        created_at=ev.created_at,
        completed_at=ev.completed_at,
    ))
    db.commit()
    return ev


# --- seed PitchMaker ----------------------------------------------------------

def seed_pitchmaker(db):
    print("\n=== Workspace: PitchMaker -- Investimentos ===")
    user = ensure_user(db, "ana.techlead@santander.com.br")

    ws = ensure_workspace(db, slug="pitchmaker", name="PitchMaker -- Investimentos", user=user)
    db.commit()
    wid = ws.id
    print(f"  Workspace id={wid}  (limpando dados anteriores...)")
    clean_workspace(db, wid)

    # Agents
    agent_objs = []
    for a in PITCHMAKER_AGENTS:
        obj = Agent(**a, workspace_id=wid)
        db.add(obj)
        db.flush()
        agent_objs.append(obj)
    db.commit()

    # Guardrail customizado PitchMaker
    g_garantia = Guardrail(
        workspace_id=wid,
        name="Garantia de Retorno",
        description="Impede promessas de rendimento garantido em investimentos.",
        mode="output",
        criterion="must NOT guarantee specific investment returns, profits or yields",
        preset_key=None,
        is_system=False,
    )
    db.add(g_garantia)
    db.flush()
    db.commit()

    # Test Cases
    tc_objs = []
    for tc in PITCHMAKER_TEST_CASES:
        obj = TestCase(
            workspace_id=wid,
            title=tc["title"],
            input=tc["input"],
            expected_output=tc.get("expected_output"),
            context=tc.get("context"),
            tags=tc.get("tags"),
        )
        db.add(obj)
        db.flush()
        tc_objs.append(obj)
    db.commit()

    # Profiles
    profile_objs = []
    for p in PITCHMAKER_PROFILES:
        preset_keys = p.get("guardrail_preset_keys", [])
        gids = _get_guardrail_ids(db, *preset_keys)
        if p["name"] == "Investimentos Precisos":
            gids.append(g_garantia.id)
        profile_data = {k: v for k, v in p.items() if k not in PROFILE_EXTRA_KEYS}
        obj = EvaluationProfile(**profile_data, workspace_id=wid, guardrail_ids=gids)
        db.add(obj)
        db.flush()
        profile_objs.append(obj)
    db.commit()
    print(f"  {len(agent_objs)} agentes, {len(tc_objs)} casos, {len(profile_objs)} perfis")

    # Runs
    total_runs = len(PITCHMAKER_RUNS_CONFIG)
    for run_i, (date_str, agent_idx, profile_idx, target_score, run_name) in enumerate(PITCHMAKER_RUNS_CONFIG):
        run_date = datetime.strptime(date_str, "%Y-%m-%d")
        agent = agent_objs[agent_idx]
        profile = profile_objs[profile_idx]
        profile_dict = PITCHMAKER_PROFILES[profile_idx]

        run = TestRun(
            workspace_id=wid,
            name=run_name,
            agent_id=agent.id,
            profile_id=profile.id,
            test_case_ids=[tc.id for tc in tc_objs],
            status="completed",
            created_at=run_date,
            completed_at=run_date + timedelta(minutes=2),
            agent_metadata_snapshot=_metadata_snapshot(agent),
        )
        db.add(run)
        db.flush()

        quality_dist = [0.0, 0.25, 0.10, 0.15, 0.0][run_i]  # fração bad
        all_scores_vals = []
        for tc in tc_objs:
            roll = random.random()
            quality = "bad" if roll < quality_dist else "mediocre" if roll < quality_dist + 0.25 else "good"
            scores, reasons = gen_scores(quality, profile_dict, run_i, total_runs)
            passed = compute_passed(scores, profile_dict)
            for metric_name, score in scores.items():
                all_scores_vals.append((1.0 - score) if metric_name in LOWER_IS_BETTER else score)
            db.add(TestResult(
                run_id=run.id,
                test_case_id=tc.id,
                actual_output=tc.expected_output or "Resposta do agente de investimentos.",
                scores=scores,
                reasons=reasons,
                passed=passed,
                created_at=run_date,
            ))

        run.overall_score = round(sum(all_scores_vals) / len(all_scores_vals), 4) if all_scores_vals else None
        db.commit()
        _mirror_run(db, run, wid)
        print(f"  Run #{run.id} [{date_str}] {agent.name[:35]} | score={run.overall_score}")

    # Datasets PitchMaker
    ds_inv = Dataset(
        workspace_id=wid,
        name="Conversas Investimento Prod",
        description="Conversas reais de investidores no canal digital -- mix de perfis e produtos.",
        agent_id=agent_objs[1].id,
    )
    db.add(ds_inv)
    db.flush()

    invest_records_raw = [
        ("Qual o rendimento do CDB?", "CDB Flex: 100% CDI com liquidez diária. Com CDI a 10,75% a.a., rende ~0,85%/mês.", ["CDB 100% CDI, liquidez diária."]),
        ("Sou conservador, o que você recomenda?", "CDB liquidez diária ou Tesouro Selic. Baixo risco e liquidez imediata.", ["Conservador: CDB ou Tesouro Selic."]),
        ("LCI é isenta de IR?", "Sim! LCI isenta de IR para pessoa física. Mínimo R$ 5.000, carência 90 dias.", ["LCI: isenta IR PF."]),
        ("Como invisto no Tesouro Direto?", "Em 'Investimentos' > 'Tesouro Direto', selecione o título e valor. Mínimo R$ 30.", ["Tesouro Direto: a partir de R$ 30."]),
        ("Posso resgatar o CDB a qualquer momento?", "CDB Flex tem liquidez diária -- você pode resgatar a qualquer momento após D+1.", ["CDB Flex: liquidez diária, resgate D+1."]),
        ("Qual a diferença entre LCI e LCA?", "LCI financia o mercado imobiliário; LCA, o agronegócio. Ambas isentas de IR para PF.", ["LCI e LCA: ambas isentas de IR, setores diferentes."]),
        ("Fundo multimercado vale a pena?", "Para perfil moderado, fundos multimercado diversificam entre renda fixa e variável. Horizonte mínimo: 2 anos.", ["Fundos multimercado: perfil moderado/arrojado."]),
        ("Meu CDB está garantido?", "Sim, coberto pelo FGC até R$ 250.000 por CPF por instituição.", ["FGC: cobertura até R$ 250.000."]),
        ("Quanto rende R$ 5.000 em 12 meses?", "R$ 5.000 no CDB 100% CDI por 12 meses: ~R$ 537,50 bruto. Após IR (15%): ~R$ 456,88 líquido.", ["CDI: 10,75% a.a. Alíquota IR 12 meses: 15%."]),
        ("Quero diversificar, o que você sugere?", "Qual seu perfil? Diversificação depende de tolerância ao risco e horizonte de tempo.", ["Perguntar perfil antes de diversificar."]),
        # Taxa incorreta (alucinação)
        ("O CDB rende 115% do CDI?", "Sim, nosso CDB Plus rende 115% do CDI sem carência.", ["CDB Santander: 100% CDI. Não existe 'CDB Plus' a 115%."]),
        ("PGBL ou VGBL?", "PGBL para quem declara IR completo (deduz até 12%). VGBL para simplificado ou isentos.", ["PGBL x VGBL conforme tipo de declaração."]),
        ("Qual o prazo mínimo para LCA?", "LCA tem carência mínima de 90 dias por regulação do Banco Central.", ["LCA: carência mínima 90 dias."]),
        ("Como aplico de forma automática todo mês?", "Em 'Investimentos' > 'Programar Aplicação'. Defina valor, frequência e produto. Mínimo R$ 50.", ["Aplicação automática a partir de R$ 50."]),
        ("Posso perder dinheiro em CDB?", "Em circunstâncias normais, não -- mas acima de R$ 250.000, o FGC não cobre o excedente.", ["FGC: até R$ 250.000 por CPF por IF."]),
    ]

    inv_records = []
    for inp, out, ctx in invest_records_raw:
        rec = DatasetRecord(dataset_id=ds_inv.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        inv_records.append(rec)

    ds_sint = Dataset(
        workspace_id=wid,
        name="Casos Sintéticos Investimento",
        description="Casos sintéticos de investimento gerados para cobertura de cenários de borda.",
        agent_id=agent_objs[0].id,
    )
    db.add(ds_sint)
    db.flush()

    sint_records_raw = [
        ("CDB vs Poupança -- qual rende mais?", "Com Selic acima de 8,5%: poupança rende 70% Selic (~7,5% a.a.) vs CDB 100% CDI (~10,75% a.a.). CDB é superior.", ["CDB 100% CDI supera poupança quando Selic > 8,5%."]),
        ("Qual o imposto sobre CDB 6 meses?", "Para CDB com prazo até 180 dias, alíquota de IR é 22,5% sobre o rendimento.", ["IR CDB: até 180 dias = 22,5%."]),
        ("Qual o imposto sobre CDB acima de 2 anos?", "Para CDB com prazo acima de 720 dias, alíquota de IR cai para 15%.", ["IR CDB: acima de 720 dias = 15%."]),
        ("Fundo de renda fixa é seguro?", "Fundos de renda fixa investem principalmente em títulos públicos e CDBs, com baixo risco.", ["Fundos renda fixa: baixo risco, sem cobertura FGC."]),
        ("Qual o prazo mínimo do Tesouro IPCA+?", "Tesouro IPCA+ pode ser resgatado antes do vencimento, mas sujeito à marcação a mercado (pode variar).", ["Tesouro IPCA+: liquidez diária após carência, marcação a mercado."]),
        ("LCA financia qual setor?", "LCA (Letra de Crédito do Agronegócio) financia produtores e cooperativas rurais. Isenta de IR para PF.", ["LCA: agronegócio, isenta IR PF."]),
        ("Como funciona o PGBL na declaração?", "PGBL permite deduzir até 12% da renda bruta anual no IR. No resgate, todo o montante é tributado.", ["PGBL: dedução até 12%, tributação total no resgate."]),
        ("E o VGBL?", "VGBL não deduz no IR anual, mas no resgate, apenas os rendimentos são tributados -- mais eficiente para quem usa declaração simplificada.", ["VGBL: sem dedução, IR só sobre rendimentos."]),
        ("O que é marcação a mercado?", "Marcação a mercado é a atualização diária do valor de títulos de renda fixa conforme as taxas do mercado, o que pode gerar oscilações.", ["Marcação a mercado: atualização diária dos preços."]),
        ("Qual o limite de cobertura do FGC?", "O FGC cobre até R$ 250.000 por CPF por instituição financeira, com limite total de R$ 1 milhão por CPF.", ["FGC: R$ 250k por IF, R$ 1M total por CPF."]),
    ]

    sint_records = []
    for inp, out, ctx in sint_records_raw:
        rec = DatasetRecord(dataset_id=ds_sint.id, input=inp, actual_output=out, context=ctx)
        db.add(rec)
        db.flush()
        sint_records.append(rec)

    db.commit()
    print(f"  2 datasets: {len(inv_records)} + {len(sint_records)} records")

    # Versões de prompt para agentes PitchMaker
    db.add(AgentPromptVersion(
        agent_id=agent_objs[0].id, workspace_id=wid, version_num=1,
        status="archived", label="Versão inicial — Apresentação de produtos",
        system_prompt="Você é um assistente de investimentos Santander. Apresente opções de CDB, LCI, LCA e fundos. Informe taxas com precisão.",
        created_at=datetime(2025, 2, 1),
    ))
    db.add(AgentPromptVersion(
        agent_id=agent_objs[0].id, workspace_id=wid, version_num=2,
        status="active", label="Perfil do investidor obrigatório",
        system_prompt="Você é um assistente de investimentos Santander. Apresente opções de CDB, LCI, LCA e fundos de investimento. Informe taxas e prazos com precisão.",
        created_at=datetime(2025, 3, 1),
    ))
    db.add(AgentPromptVersion(
        agent_id=agent_objs[1].id, workspace_id=wid, version_num=1,
        status="active", label="Compliance total + disclaimer obrigatório",
        system_prompt=(
            "Você é um assistente de investimentos Santander. "
            "SEMPRE pergunte o perfil do investidor antes de qualquer recomendação. "
            "Para CDB e LCI, confirme prazo mínimo e tributação. "
            "Nunca informe rentabilidade projetada sem disclaimer."
        ),
        created_at=datetime(2025, 3, 20),
    ))
    db.commit()
    print("  Versões de prompt PitchMaker: v1(archived) + v2(active) + v2-agente(active)")

    # Avaliações PitchMaker
    p_preciso = PITCHMAKER_PROFILES[0]
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-15", 0.78, "Sprint 1 -- Validação Conversas Prod"),
        ("2025-04-10", 0.87, "Prod v1 -- Monitoramento Contínuo"),
    ]):
        ev = _create_eval(db, wid, ds_inv.id, profile_objs[0].id, p_preciso, inv_records, date_str, target, i, 2, agent_id=agent_objs[1].id, name=eval_name, agent=agent_objs[1])
        print(f"  Eval #{ev.id} [PitchMaker Dataset 1] {date_str} score={target} ({eval_name})")

    p_lite = PITCHMAKER_PROFILES[1]
    for i, (date_str, target, eval_name) in enumerate([
        ("2025-03-25", 0.82, "Sprint 2 -- Casos Sintéticos"),
        ("2025-04-15", 0.90, "Prod v1 -- Cobertura de Borda"),
    ]):
        ev = _create_eval(db, wid, ds_sint.id, profile_objs[1].id, p_lite, sint_records, date_str, target, i, 2, agent_id=agent_objs[0].id, name=eval_name, agent=agent_objs[0])
        print(f"  Eval #{ev.id} [PitchMaker Dataset 2] {date_str} score={target} ({eval_name})")

    return wid


# --- A/B comparison -- IDs 42 e 51 -------------------------------------------

def seed_ab_evaluations(db, platconv_wid, ds1, ds1_records, profile_rigoroso, p_rigoroso, agent_v1=None, agent_v2=None):
    print("\n=== A/B Comparison (Dataset 1 x Bancario Rigoroso) ===")

    # Baseline antes da otimizacao (82%)
    ev_baseline = DatasetEvaluation(
        workspace_id=platconv_wid,
        name="Prod v2 -- Baseline A/B",
        dataset_id=ds1.id,
        profile_id=profile_rigoroso.id,
        status="completed",
        created_at=datetime(2025, 4, 10),
        completed_at=datetime(2025, 4, 10, 0, 3),
        agent_metadata_snapshot=_metadata_snapshot(agent_v1) if agent_v1 else None,
    )
    db.add(ev_baseline)
    db.flush()

    baseline_scores = []
    for rec in ds1_records:
        quality = "mediocre" if random.random() < 0.4 else "good"
        scores, reasons = gen_scores(quality, p_rigoroso, 0, 2)
        passed = compute_passed(scores, p_rigoroso)
        for metric_name, score in scores.items():
            baseline_scores.append((1.0 - score) if metric_name in LOWER_IS_BETTER else score)
        db.add(DatasetResult(
            evaluation_id=ev_baseline.id, record_id=rec.id,
            scores=scores, reasons=reasons, passed=passed,
            created_at=datetime(2025, 4, 10),
        ))

    ev_baseline.overall_score = round(sum(baseline_scores) / len(baseline_scores), 4) if baseline_scores else None
    db.commit()
    db.add(Evaluation(
        workspace_id=platconv_wid, name="Prod v2 -- Baseline A/B", profile_id=profile_rigoroso.id,
        eval_type="dataset", source_eval_id=ev_baseline.id, dataset_id=ds1.id,
        status="completed", overall_score=ev_baseline.overall_score,
        created_at=ev_baseline.created_at, completed_at=ev_baseline.completed_at,
    ))
    db.commit()
    print(f"  Eval #{ev_baseline.id} [A/B Baseline] 2025-04-10 score={ev_baseline.overall_score}")

    # Pos-otimizacao com prompt v2
    ev_optimized = DatasetEvaluation(
        workspace_id=platconv_wid,
        name="Prod v2 -- Pós-Otimização A/B",
        dataset_id=ds1.id,
        profile_id=profile_rigoroso.id,
        status="completed",
        created_at=datetime(2025, 4, 17),
        completed_at=datetime(2025, 4, 17, 0, 2, 30),
        agent_metadata_snapshot=_metadata_snapshot(agent_v2) if agent_v2 else None,
    )
    db.add(ev_optimized)
    db.flush()

    optimized_scores = []
    for rec in ds1_records:
        quality = "mediocre" if random.random() < 0.05 else "good"
        scores, reasons = gen_scores(quality, p_rigoroso, 1, 2)
        passed = compute_passed(scores, p_rigoroso)
        for metric_name, score in scores.items():
            optimized_scores.append((1.0 - score) if metric_name in LOWER_IS_BETTER else score)
        db.add(DatasetResult(
            evaluation_id=ev_optimized.id, record_id=rec.id,
            scores=scores, reasons=reasons, passed=passed,
            created_at=datetime(2025, 4, 17),
        ))

    ev_optimized.overall_score = round(sum(optimized_scores) / len(optimized_scores), 4) if optimized_scores else None
    db.commit()
    db.add(Evaluation(
        workspace_id=platconv_wid, name="Prod v2 -- Pós-Otimização A/B", profile_id=profile_rigoroso.id,
        eval_type="dataset", source_eval_id=ev_optimized.id, dataset_id=ds1.id,
        status="completed", overall_score=ev_optimized.overall_score,
        created_at=ev_optimized.created_at, completed_at=ev_optimized.completed_at,
    ))
    db.commit()
    print(f"  Eval #{ev_optimized.id} [A/B Otimizado] 2025-04-17 score={ev_optimized.overall_score}")
    return ev_baseline, ev_optimized


# --- main --------------------------------------------------------------------

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        platconv_wid, ds1, ds1_records, profile_rigoroso, p_rigoroso, _, platconv_agents = seed_platconv(db)
        seed_pitchmaker(db)
        ev_baseline, ev_optimized = seed_ab_evaluations(
            db, platconv_wid, ds1, ds1_records, profile_rigoroso, p_rigoroso,
            agent_v1=platconv_agents[0], agent_v2=platconv_agents[1],
        )
        ab_id_baseline = ev_baseline.id
        ab_id_optimized = ev_optimized.id
    finally:
        db.close()

    print()
    print("=" * 55)
    print("  SEED SANTANDER CONCLUIDO")
    print("=" * 55)
    print("  Workspace PlatConv:")
    print(f"    Agentes       : {len(PLATCONV_AGENTS)}")
    print(f"    Casos de teste: {len(PLATCONV_TEST_CASES_EXPLICIT) + len(PLATCONV_TEST_CASES_TEMPLATES)} (20 explicitos + 27 templates)")
    print(f"    Perfis        : {len(PLATCONV_PROFILES)}")
    print(f"    Execucoes     : {len(PLATCONV_RUNS_CONFIG)} ({PLATCONV_RUNS_CONFIG[0][0]} -> {PLATCONV_RUNS_CONFIG[-1][0]})")
    print("    Datasets      : 4 (20+15+18+12 records)")
    print(f"    A/B compare   : Eval #{ab_id_baseline} vs Eval #{ab_id_optimized}")
    print("  Workspace PitchMaker:")
    print(f"    Agentes       : {len(PITCHMAKER_AGENTS)}")
    print(f"    Casos de teste: {len(PITCHMAKER_TEST_CASES)}")
    print(f"    Perfis        : {len(PITCHMAKER_PROFILES)}")
    print(f"    Execucoes     : {len(PITCHMAKER_RUNS_CONFIG)}")
    print("    Datasets      : 2 (15+10 records)")
    print("=" * 55)


if __name__ == "__main__":
    seed()
