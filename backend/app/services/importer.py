import gzip
import json
import re
import uuid
from pathlib import Path
from typing import Any, Optional

TMP_DIR = Path(__file__).parent.parent.parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_file(content: bytes, filename: str) -> list[dict]:
    """Parse JSON array, JSONL, ou versões .gz."""
    name = filename.lower()

    if name.endswith(".gz"):
        content = gzip.decompress(content)
        name = name[:-3]

    text = content.decode("utf-8", errors="replace")

    if name.endswith(".jsonl"):
        records = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                records.append(json.loads(line))
        return records

    data = json.loads(text)
    if isinstance(data, list):
        return data
    return [data]


# ---------------------------------------------------------------------------
# Path extraction
# ---------------------------------------------------------------------------

def _collect_paths(obj: Any, prefix: str, paths: set):
    if isinstance(obj, dict):
        for key, val in obj.items():
            full = f"{prefix}.{key}" if prefix else key
            _collect_paths(val, full, paths)
    elif isinstance(obj, list) and obj:
        first = obj[0]
        # [0] para primeiro, [-1] para último (útil em chats)
        _collect_paths(first, f"{prefix}[0]", paths)
        if len(obj) > 1:
            _collect_paths(obj[-1], f"{prefix}[-1]", paths)
    else:
        if prefix:
            paths.add(prefix)


def extract_all_paths(records: list[dict]) -> list[str]:
    paths: set = set()
    for record in records[:10]:
        _collect_paths(record, "", paths)
    return sorted(paths)


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

_ARRAY_RE = re.compile(r'^(.+?)\[(-?\d+)\]$')


def resolve_path(obj: Any, path: str) -> Any:
    """
    Resolve caminho dot-notation com suporte a array.
    Ex: "messages[-1].content", "response.text", "id"
    """
    if not path or obj is None:
        return obj

    parts = path.split(".")
    current = obj

    for part in parts:
        if current is None:
            return None
        m = _ARRAY_RE.match(part)
        if m:
            key, idx = m.group(1), int(m.group(2))
            if isinstance(current, dict):
                current = current.get(key)
            if not isinstance(current, list):
                return None
            try:
                current = current[idx]
            except IndexError:
                return None
        else:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

    return current


def to_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return json.dumps(val, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Temp file storage
# ---------------------------------------------------------------------------

def save_tmp(records: list[dict]) -> str:
    file_id = str(uuid.uuid4())
    path = TMP_DIR / f"{file_id}.json"
    path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    return file_id


def load_tmp(file_id: str) -> list[dict]:
    if not re.match(r'^[a-f0-9-]{36}$', file_id):
        raise ValueError("file_id inválido")
    path = TMP_DIR / f"{file_id}.json"
    if not path.exists():
        raise FileNotFoundError("Arquivo temporário não encontrado ou expirado")
    return json.loads(path.read_text(encoding="utf-8"))
