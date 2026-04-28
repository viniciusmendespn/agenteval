import json


def suggest_mapping(sample: list[dict], all_paths: list[str], judge=None) -> dict:
    """
    Usa o LLM configurado para sugerir qual campo é input, output e contexto.
    Retorna dict com: input_path, output_path, context_paths, reasoning.
    """
    _empty = {
        "input_path": None,
        "output_path": None,
        "context_paths": [],
        "session_id_path": None,
        "order_path": None,
        "reasoning": "LLM não configurado — faça o mapeamento manualmente.",
    }

    if judge is None:
        return _empty

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
- session_id_path: campo que identifica a qual sessão/conversa cada mensagem pertence (ex: "session_id", "conversation_id", "thread_id", "chat_id") — null se não existir
- order_path: campo que define a ordem das mensagens dentro de uma sessão (ex: "turn", "timestamp", "created_at", "sequence", "index") — null se não existir

Responda APENAS com JSON válido, sem markdown, no formato exato:
{{
  "input_path": "<caminho exato da lista ou null>",
  "output_path": "<caminho exato da lista ou null>",
  "context_paths": ["<caminho>"],
  "session_id_path": "<caminho exato da lista ou null>",
  "order_path": "<caminho exato da lista ou null>",
  "reasoning": "<explicação breve em português de por que escolheu esses campos>"
}}

Use EXATAMENTE os caminhos da lista fornecida. Se não encontrar um campo, use null."""

    try:
        content, _ = judge.generate(prompt)
        if not isinstance(content, str):
            content = str(content)
        content = content.strip()

        if "```" in content:
            parts = content.split("```")
            for part in parts:
                stripped = part.lstrip("json").strip()
                if stripped.startswith("{"):
                    content = stripped
                    break

        result = json.loads(content)

        path_set = set(all_paths)
        if result.get("input_path") not in path_set:
            result["input_path"] = None
        if result.get("output_path") not in path_set:
            result["output_path"] = None
        result["context_paths"] = [
            p for p in (result.get("context_paths") or []) if p in path_set
        ]
        if result.get("session_id_path") not in path_set:
            result["session_id_path"] = None
        if result.get("order_path") not in path_set:
            result["order_path"] = None

        return result

    except Exception as e:
        return {
            "input_path": None,
            "output_path": None,
            "context_paths": [],
            "session_id_path": None,
            "order_path": None,
            "reasoning": f"Não foi possível obter sugestão automática: {e}",
        }
