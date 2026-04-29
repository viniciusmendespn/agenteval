import json
import httpx
import logging

logger = logging.getLogger(__name__)

_SKIP_EVENTS = {"meta", "usage", "error", "ping"}
_STOP_EVENTS = {"done"}

_TOKEN = "__AGENTEVAL_MSG__"
_SID_TOKEN = "__AGENTEVAL_SID__"
_SP_TOKEN = "__AGENTEVAL_SP__"


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


def _build_payload(request_body_template: str, message: str, session_id: str = "",
                   variables: dict | None = None, system_prompt: str = "") -> dict:
    """
    Substitui placeholders no template JSON.
    Ordem: variáveis customizadas → {{message}} → {{sessionId}} → {{system_prompt}}.
    As substituições built-in usam tokens seguros para não quebrar o JSON.
    {{system_prompt}} é opcional — só atua se presente no template.
    """
    body_str = request_body_template
    for key, value in (variables or {}).items():
        body_str = body_str.replace(f"{{{{{key}}}}}", str(value))
    body_str = (body_str
                .replace("{{message}}", _TOKEN)
                .replace("{{sessionId}}", _SID_TOKEN)
                .replace("{{system_prompt}}", _SP_TOKEN))
    parsed = json.loads(body_str)

    def replace_token(obj):
        if isinstance(obj, str):
            return (obj
                    .replace(_TOKEN, message)
                    .replace(_SID_TOKEN, session_id)
                    .replace(_SP_TOKEN, system_prompt or ""))
        if isinstance(obj, dict):
            return {k: replace_token(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [replace_token(item) for item in obj]
        return obj

    return replace_token(parsed)


def _fetch_token(token_url: str, token_request_body: str | None,
                 token_output_field: str | None, ssl_verify: bool = False) -> str:
    """Faz a pré-chamada para obter um token dinâmico."""
    payload = json.loads(token_request_body or "{}")
    resp = httpx.post(token_url, json=payload,
                      headers={"Content-Type": "application/json"}, timeout=30,
                      verify=ssl_verify)
    resp.raise_for_status()
    return _resolve_path(resp.json(), token_output_field or "token")


def _call_http(url: str, api_key: str, message: str, request_body: str, output_field: str,
               timeout: int, session_id: str = "", variables: dict | None = None,
               system_prompt: str = "", ssl_verify: bool = False) -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = _build_payload(request_body, message, session_id, variables, system_prompt)

    response = httpx.post(url, json=payload, headers=headers, timeout=timeout, verify=ssl_verify)
    if response.is_error:
        body = response.text[:500]
        logger.error("Agent HTTP %s: %s", response.status_code, body)
        raise httpx.HTTPStatusError(
            f"HTTP {response.status_code}: {body}",
            request=response.request,
            response=response,
        )

    data = response.json()
    return _resolve_path(data, output_field)


def _call_sse(url: str, api_key: str, message: str, request_body: str, output_field: str,
              timeout: int, session_id: str = "", variables: dict | None = None,
              system_prompt: str = "", ssl_verify: bool = False) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload = _build_payload(request_body, message, session_id, variables, system_prompt)
    chunks: list[str] = []
    current_event: str | None = None

    with httpx.stream("POST", url, json=payload, headers=headers, timeout=timeout, verify=ssl_verify) as response:
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
    variables: dict | None = None,
    token_url: str | None = None,
    token_request_body: str | None = None,
    token_output_field: str | None = None,
    token_header_name: str | None = None,
    system_prompt: str = "",
    ssl_verify: bool = False,
) -> str:
    effective_api_key = api_key
    effective_variables = dict(variables or {})

    if token_url:
        token = _fetch_token(token_url, token_request_body, token_output_field, ssl_verify)
        effective_variables["token"] = token
        if not api_key:
            effective_api_key = token

    if connection_type == "sse":
        return _call_sse(url, effective_api_key, message, request_body,
                         output_field, timeout, session_id, effective_variables, system_prompt, ssl_verify)
    return _call_http(url, effective_api_key, message, request_body,
                      output_field, timeout, session_id, effective_variables, system_prompt, ssl_verify)
