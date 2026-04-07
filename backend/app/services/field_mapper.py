import json
import os
from openai import AzureOpenAI


def suggest_mapping(sample: list[dict], all_paths: list[str]) -> dict:
    """
    Usa o LLM judge para sugerir qual campo é input, output e contexto.
    Retorna dict com: input_path, output_path, context_paths, reasoning.
    """
    base_url = os.getenv("JUDGE_BASE_URL")
    if not base_url:
        return {
            "input_path": None,
            "output_path": None,
            "context_paths": [],
            "reasoning": "LLM judge não configurado — faça o mapeamento manualmente.",
        }

    client = AzureOpenAI(
        azure_endpoint=base_url,
        api_key=os.getenv("JUDGE_API_KEY", ""),
        api_version=os.getenv("JUDGE_API_VERSION", "2024-02-01"),
    )
    model = os.getenv("JUDGE_MODEL", "gpt-4")

    paths_str = "\n".join(f"  - {p}" for p in all_paths)
    sample_str = json.dumps(sample[:3], ensure_ascii=False, indent=2)

    prompt = f"""Você vai analisar uma amostra de registros de interações com um agente de IA.

Caminhos disponíveis no dataset:
{paths_str}

Amostra de registros (até 3):
{sample_str}

Sua tarefa: identificar qual caminho corresponde a cada papel abaixo.
- input: a pergunta ou mensagem enviada pelo usuário ao agente
- output: a resposta gerada pelo agente (pode ser null se não houver)
- context_paths: caminhos com informações de contexto, trace de execução ou documentos recuperados (pode ser lista vazia)

Responda APENAS com JSON válido, sem markdown, no formato exato:
{{
  "input_path": "<caminho exato da lista ou null>",
  "output_path": "<caminho exato da lista ou null>",
  "context_paths": ["<caminho>"],
  "reasoning": "<explicação breve em português de por que escolheu esses campos>"
}}

Use EXATAMENTE os caminhos da lista fornecida. Se não encontrar um campo, use null."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        content = response.choices[0].message.content.strip()

        # Remove blocos markdown se o modelo insistir em adicioná-los
        if "```" in content:
            parts = content.split("```")
            for part in parts:
                stripped = part.lstrip("json").strip()
                if stripped.startswith("{"):
                    content = stripped
                    break

        result = json.loads(content)

        # Valida que os caminhos retornados existem de fato na lista
        path_set = set(all_paths)
        if result.get("input_path") not in path_set:
            result["input_path"] = None
        if result.get("output_path") not in path_set:
            result["output_path"] = None
        result["context_paths"] = [
            p for p in (result.get("context_paths") or []) if p in path_set
        ]

        return result

    except Exception as e:
        return {
            "input_path": None,
            "output_path": None,
            "context_paths": [],
            "reasoning": f"Não foi possível obter sugestão automática: {e}",
        }
