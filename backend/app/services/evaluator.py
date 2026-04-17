import json
import os
from deepeval.metrics import AnswerRelevancyMetric, HallucinationMetric, GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
# Métricas onde score menor = melhor (ausência do problema)
LOWER_IS_BETTER = {"hallucination", "toxicity", "bias", "non_advice", "role_violation"}


def compute_passed(scores: dict[str, float], thresholds: dict[str, float]) -> bool:
    """
    Verifica se todos os scores passam no threshold respeitando a direção de cada métrica.
    LOWER_IS_BETTER: score <= threshold → aprovado
    Demais:          score >= threshold → aprovado
    """
    for metric, score in scores.items():
        threshold = thresholds.get(metric, 0.5)
        if metric in LOWER_IS_BETTER:
            if score > threshold:
                return False
        else:
            if score < threshold:
                return False
    return True


def _translate_reasons(reasons: dict[str, str], judge) -> dict[str, str]:
    """Traduz todos os motivos para PT-BR numa única chamada ao LLM."""
    non_empty = {k: v for k, v in reasons.items() if v}
    if not non_empty:
        return reasons

    payload = json.dumps(non_empty, ensure_ascii=False)
    prompt = (
        "Translate the values of the JSON below to Brazilian Portuguese. "
        "Keep the keys exactly the same. Return only the JSON, no explanation.\n\n"
        f"{payload}"
    )

    # Tenta com o judge customizado primeiro
    if judge is not None:
        try:
            translated_json, _ = judge.generate(prompt)
            translated = json.loads(translated_json)
            return {k: translated.get(k, v) for k, v in reasons.items()}
        except Exception:
            pass

    # Fallback: OpenAI direto (quando DeepEval usa OPENAI_API_KEY)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=os.getenv("JUDGE_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt}],
        )
        translated_json = response.choices[0].message.content or ""
        translated = json.loads(translated_json)
        return {k: translated.get(k, v) for k, v in reasons.items()}
    except Exception:
        return reasons

# Importações opcionais — deepeval pode não ter todas as versões
try:
    from deepeval.metrics import ToxicityMetric
    _HAS_TOXICITY = True
except ImportError:
    _HAS_TOXICITY = False

try:
    from deepeval.metrics import BiasMetric
    _HAS_BIAS = True
except ImportError:
    _HAS_BIAS = False

try:
    from deepeval.metrics import FaithfulnessMetric
    _HAS_FAITHFULNESS = True
except ImportError:
    _HAS_FAITHFULNESS = False

try:
    from deepeval.metrics import NonAdviceMetric
    _HAS_NON_ADVICE = True
except ImportError:
    _HAS_NON_ADVICE = False

try:
    from deepeval.metrics import RoleViolationMetric
    _HAS_ROLE_VIOLATION = True
except ImportError:
    _HAS_ROLE_VIOLATION = False

try:
    from deepeval.metrics import PromptAlignmentMetric
    _HAS_PROMPT_ALIGNMENT = True
except ImportError:
    _HAS_PROMPT_ALIGNMENT = False


def evaluate_response(
    input_text: str,
    actual_output: str,
    expected_output: str | None = None,
    context: list[str] | None = None,
    response_time_ms: float | None = None,
    # métricas originais
    use_relevancy: bool = True,
    relevancy_threshold: float = 0.5,
    use_hallucination: bool = False,
    hallucination_threshold: float = 0.5,
    # novas métricas
    use_toxicity: bool = False,
    toxicity_threshold: float = 0.5,
    use_bias: bool = False,
    bias_threshold: float = 0.5,
    use_faithfulness: bool = False,
    faithfulness_threshold: float = 0.5,
    use_latency: bool = False,
    latency_threshold_ms: int = 5000,
    # critérios custom
    criteria: list[str] | None = None,
    # novas métricas de conformidade
    use_non_advice: bool = False,
    non_advice_threshold: float = 0.5,
    non_advice_types: list[str] | None = None,
    use_role_violation: bool = False,
    role_violation_threshold: float = 0.5,
    role_violation_role: str | None = None,
    # aderência ao system prompt
    use_prompt_alignment: bool = False,
    prompt_alignment_threshold: float = 0.5,
    system_prompt: str | None = None,
    # LLM judge override (instância CustomJudgeLLM ou None)
    judge_override=None,
) -> tuple[dict[str, float], dict[str, str]]:
    """
    Avalia uma resposta do agente usando DeepEval.
    Retorna (scores, reasons) onde:
      scores  = { nome_metrica: score_float }
      reasons = { nome_metrica: explicacao_da_llm }
    """
    judge = judge_override

    test_case = LLMTestCase(
        input=input_text,
        actual_output=actual_output,
        expected_output=expected_output,
        context=context or [],
        retrieval_context=context or [],
    )

    scores: dict[str, float] = {}
    reasons: dict[str, str] = {}

    if use_relevancy:
        metric = AnswerRelevancyMetric(threshold=relevancy_threshold, model=judge)
        metric.measure(test_case)
        scores["relevancy"] = round(metric.score or 0.0, 4)
        reasons["relevancy"] = metric.reason or ""

    if use_hallucination and context:
        metric = HallucinationMetric(threshold=hallucination_threshold, model=judge)
        metric.measure(test_case)
        scores["hallucination"] = round(metric.score or 0.0, 4)
        reasons["hallucination"] = metric.reason or ""

    if use_toxicity and _HAS_TOXICITY:
        metric = ToxicityMetric(threshold=toxicity_threshold, model=judge)
        metric.measure(test_case)
        scores["toxicity"] = round(metric.score or 0.0, 4)
        reasons["toxicity"] = metric.reason or ""
    elif use_toxicity:
        reasons["toxicity"] = "ToxicityMetric não disponível nesta versão do DeepEval"

    if use_bias and _HAS_BIAS:
        metric = BiasMetric(threshold=bias_threshold, model=judge)
        metric.measure(test_case)
        scores["bias"] = round(metric.score or 0.0, 4)
        reasons["bias"] = metric.reason or ""
    elif use_bias:
        reasons["bias"] = "BiasMetric não disponível nesta versão do DeepEval"

    if use_faithfulness and _HAS_FAITHFULNESS and context:
        metric = FaithfulnessMetric(threshold=faithfulness_threshold, model=judge)
        metric.measure(test_case)
        scores["faithfulness"] = round(metric.score or 0.0, 4)
        reasons["faithfulness"] = metric.reason or ""
    elif use_faithfulness and not context:
        reasons["faithfulness"] = "Fidelidade requer contexto preenchido no caso de teste"

    if use_latency and response_time_ms is not None:
        threshold = float(latency_threshold_ms)
        if response_time_ms <= threshold:
            latency_score = 1.0
        else:
            # Degradação linear: dobro do limite = score 0
            latency_score = max(0.0, 1.0 - (response_time_ms - threshold) / threshold)
        scores["latency"] = round(latency_score, 4)
        reasons["latency"] = (
            f"Tempo de resposta: {int(response_time_ms)}ms "
            f"(limiar: {latency_threshold_ms}ms)"
        )

    if use_non_advice and _HAS_NON_ADVICE and non_advice_types:
        metric = NonAdviceMetric(
            advice_types=non_advice_types,
            threshold=non_advice_threshold,
            model=judge,
        )
        metric.measure(test_case)
        scores["non_advice"] = round(metric.score or 0.0, 4)
        reasons["non_advice"] = metric.reason or ""
    elif use_non_advice and not non_advice_types:
        reasons["non_advice"] = "NonAdviceMetric requer ao menos um tipo de conselho configurado"

    if use_role_violation and _HAS_ROLE_VIOLATION and role_violation_role:
        metric = RoleViolationMetric(
            role=role_violation_role,
            threshold=role_violation_threshold,
            model=judge,
        )
        metric.measure(test_case)
        scores["role_violation"] = round(metric.score or 0.0, 4)
        reasons["role_violation"] = metric.reason or ""
    elif use_role_violation and not role_violation_role:
        reasons["role_violation"] = "RoleViolationMetric requer o papel do agente configurado"

    for i, criterion in enumerate(criteria or []):
        key = f"criterion_{i}"
        metric = GEval(
            name=key,
            criteria=criterion,
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
            model=judge,
        )
        metric.measure(test_case)
        scores[key] = round(metric.score or 0.0, 4)
        reasons[key] = metric.reason or ""

    if use_prompt_alignment and system_prompt and _HAS_PROMPT_ALIGNMENT:
        instructions = [line.strip() for line in system_prompt.splitlines() if line.strip()] or [system_prompt]
        metric = PromptAlignmentMetric(
            prompt_instructions=instructions,
            threshold=prompt_alignment_threshold,
            model=judge,
        )
        metric.measure(test_case)
        scores["prompt_alignment"] = round(metric.score or 0.0, 4)
        reasons["prompt_alignment"] = metric.reason or ""
    elif use_prompt_alignment and not system_prompt:
        reasons["prompt_alignment"] = "PromptAlignment requer system prompt cadastrado no agente ou dataset"
    elif use_prompt_alignment and not _HAS_PROMPT_ALIGNMENT:
        reasons["prompt_alignment"] = "PromptAlignmentMetric não disponível nesta versão do DeepEval"

    reasons = _translate_reasons(reasons, judge)
    return scores, reasons
