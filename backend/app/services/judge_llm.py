import os
from typing import Optional
from openai import AzureOpenAI, OpenAI
from deepeval.models.base_model import DeepEvalBaseLLM


class CustomJudgeLLM(DeepEvalBaseLLM):
    """
    LLM judge customizada para o DeepEval.
    Usa qualquer endpoint compatível com Azure OpenAI ou OpenAI direto.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model_name: str | None = None,
        api_version: str | None = None,
        provider_type: str = "azure",
    ):
        self._base_url = base_url or os.getenv("JUDGE_BASE_URL")
        self._api_key = api_key or os.getenv("JUDGE_API_KEY", "")
        self._model = model_name or os.getenv("JUDGE_MODEL", "gpt-4")
        self._api_version = api_version or os.getenv("JUDGE_API_VERSION", "2024-02-01")
        self._provider_type = provider_type

    def load_model(self):
        if self._provider_type == "openai":
            return OpenAI(api_key=self._api_key, base_url=self._base_url or None)
        return AzureOpenAI(
            azure_endpoint=self._base_url,
            api_key=self._api_key,
            api_version=self._api_version,
        )

    def generate(self, prompt: str, schema=None):
        client = self.load_model()
        if schema is not None:
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


def get_judge_from_provider(provider) -> Optional[CustomJudgeLLM]:
    """Cria judge a partir de um LLMProvider do banco."""
    if provider is None:
        return None
    return CustomJudgeLLM(
        base_url=provider.base_url,
        api_key=provider.api_key,
        model_name=provider.model_name,
        api_version=provider.api_version,
        provider_type=provider.provider_type,
    )


def resolve_judge(db, provider_id: Optional[int] = None) -> Optional[CustomJudgeLLM]:
    """
    Resolve o judge LLM para uma avaliação:
    1. Se provider_id informado, usa esse provider.
    2. Senão, usa o primeiro provider global disponível.
    3. Se nenhum provider existe, retorna None (métricas LLM serão puladas).
    """
    from ..models import LLMProvider
    if provider_id:
        provider = db.get(LLMProvider, provider_id)
    else:
        provider = db.query(LLMProvider).first()
    return get_judge_from_provider(provider)
