import json
import httpx

_SKIP_EVENTS = {"meta", "usage", "error", "ping"}
_STOP_EVENTS = {"done"}

_TOKEN = "__AGENTEVAL_MSG__"
_SID_TOKEN = "__AGENTEVAL_SID__"


def _resolve_path(data: dict, path: str) -> str:
    """Extrai valor via dot-notation. Ex: choices.0.message.content"""
    current = data
    for part in path.split("."):
        if isinstance(current, list):
            current = current[int(part)]
        elif isinstance(current, dict):
            if part not in current:
                raise ValueError(f"Campo '{part}' não encontrado. Disponíveis: {list(current.keys())}")
            current = current[part]
        else:
            raise ValueError(f"Não foi possível navegar para '{part}' em '{type(current)}'")
    return str(current) if current is not None else ""


def _build_payload(request_body_template: str, message: str, session_id: str = "") -> dict:
    """
    Substitui {{message}} e {{sessionId}} no template JSON pelos valores reais.
    Ambas as substituições ocorrem ANTES do json.loads para garantir escaping correto.
    """
    body_str = (
        request_body_template
        .replace("{{message}}", _TOKEN)
        .replace("{{sessionId}}", _SID_TOKEN)
    )
    parsed = json.loads(body_str)

    def replace_token(obj):
        if isinstance(obj, str):
            return obj.replace(_TOKEN, message).replace(_SID_TOKEN, session_id)
        if isinstance(obj, dict):
            return {k: replace_token(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [replace_token(item) for item in obj]
        return obj

    return replace_token(parsed)


def _call_http(url: str, api_key: str, message: str, request_body: str, output_field: str, timeout: int, session_id: str = "") -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = _build_payload(request_body, message, session_id)

    response = httpx.post(url, json=payload, headers=headers, timeout=timeout)
    response.raise_for_status()

    data = response.json()
    return _resolve_path(data, output_field)


def _call_sse(url: str, api_key: str, message: str, request_body: str, output_field: str, timeout: int, session_id: str = "") -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload = _build_payload(request_body, message, session_id)
    chunks: list[str] = []
    current_event: str | None = None

    with httpx.stream("POST", url, json=payload, headers=headers, timeout=timeout) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            line = line.strip()
            if not line:
                current_event = None
                continue
            if line.startswith(":"):
                continue
            if line.startswith("event:"):
                current_event = line[6:].strip()
                if current_event in _STOP_EVENTS:
                    break
                continue
            if line.startswith("data:"):
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                if current_event in _SKIP_EVENTS:
                    continue
                if output_field:
                    try:
                        chunk = _resolve_path(json.loads(raw), output_field)
                        if chunk:
                            chunks.append(chunk)
                    except (json.JSONDecodeError, ValueError, IndexError):
                        if raw:
                            chunks.append(raw)
                else:
                    if raw:
                        chunks.append(raw)

    return "".join(chunks)


def call_agent(
    url: str,
    api_key: str,
    message: str,
    request_body: str = '{"message": "{{message}}"}',
    output_field: str = "response",
    connection_type: str = "http",
    timeout: int = 60,
    session_id: str = "",
) -> str:
    if connection_type == "sse":
        return _call_sse(url, api_key, message, request_body, output_field, timeout, session_id)
    return _call_http(url, api_key, message, request_body, output_field, timeout, session_id)
