import json
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


class BedrockJudgeLLM(DeepEvalBaseLLM):
    """
    LLM judge usando AWS Bedrock (API Converse).
    Suporta qualquer modelo disponível no Bedrock (Claude, Nova, Titan, etc.).
    """

    def __init__(
        self,
        model_name: str,
        aws_access_key_id: str,
        aws_secret_access_key: str,
        aws_region: str,
        aws_session_token: str | None = None,
        aws_account_id: str | None = None,
    ):
        import boto3
        self._model = model_name
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=aws_region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            aws_session_token=aws_session_token or None,
        )

    def load_model(self):
        return self._client

    def generate(self, prompt: str, schema=None):
        messages = [{"role": "user", "content": [{"text": prompt}]}]
        kwargs: dict = {"modelId": self._model, "messages": messages}

        if schema is not None:
            kwargs["system"] = [{"text": (
                "Responda APENAS com um objeto JSON válido seguindo exatamente este schema: "
                f"{json.dumps(schema.model_json_schema())}. Sem texto adicional."
            )}]
            resp = self._client.converse(**kwargs)
            raw = resp["output"]["message"]["content"][0]["text"].strip()
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            return schema.model_validate_json(raw), 0

        resp = self._client.converse(**kwargs)
        text = resp["output"]["message"]["content"][0]["text"]
        return text, 0

    async def a_generate(self, prompt: str, schema=None):
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return self._model


def get_judge_from_provider(provider) -> Optional[CustomJudgeLLM]:
    """Cria judge a partir de um LLMProvider do banco."""
    if provider is None:
        return None
    if provider.provider_type == "bedrock":
        return BedrockJudgeLLM(
            model_name=provider.model_name,
            aws_access_key_id=provider.aws_access_key_id or "",
            aws_secret_access_key=provider.aws_secret_access_key or "",
            aws_region=provider.aws_region or "us-east-1",
            aws_session_token=provider.aws_session_token,
            aws_account_id=provider.aws_account_id,
        )
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
