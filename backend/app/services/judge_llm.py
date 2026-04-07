import os
from typing import Optional
from openai import AzureOpenAI
from deepeval.models.base_model import DeepEvalBaseLLM


class CustomJudgeLLM(DeepEvalBaseLLM):
    """
    LLM judge customizada para o DeepEval.
    Usa qualquer endpoint compatível com Azure OpenAI
    (ex: fusion-llm.brq.com).
    """

    def __init__(self):
        self._base_url = os.getenv("JUDGE_BASE_URL")
        self._api_key = os.getenv("JUDGE_API_KEY", "")
        self._model = os.getenv("JUDGE_MODEL", "gpt-4")
        self._api_version = os.getenv("JUDGE_API_VERSION", "2024-02-01")

    def load_model(self) -> AzureOpenAI:
        return AzureOpenAI(
            azure_endpoint=self._base_url,
            api_key=self._api_key,
            api_version=self._api_version,
        )

    def generate(self, prompt: str, schema=None):
        client = self.load_model()
        if schema is not None:
            # DeepEval usa structured output em algumas métricas
            response = client.beta.chat.completions.parse(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                response_format=schema,
            )
            return response.choices[0].message.parsed, 0
        response = client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content, 0

    async def a_generate(self, prompt: str, schema=None):
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return self._model


def get_judge() -> Optional[CustomJudgeLLM]:
    """
    Retorna a LLM judge customizada se JUDGE_BASE_URL estiver configurado,
    ou None para usar o padrão do DeepEval (OPENAI_API_KEY).
    """
    if os.getenv("JUDGE_BASE_URL"):
        return CustomJudgeLLM()
    return None
