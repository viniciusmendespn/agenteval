"""
Incrementa o build number em version.json.
Uso:
  python scripts/bump_version.py           -> bumpa patch (1.0.0 -> 1.0.1)
  python scripts/bump_version.py minor     -> bumpa minor (1.0.0 -> 1.1.0)
  python scripts/bump_version.py major     -> bumpa major (1.0.0 -> 2.0.0)
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).parent.parent
version_file = root / "version.json"

data = json.loads(version_file.read_text(encoding="utf-8"))

bump = sys.argv[1].lower() if len(sys.argv) > 1 else "patch"
major, minor, patch = map(int, data["version"].split("."))

if bump == "major":
    major += 1
    minor = 0
    patch = 0
elif bump == "minor":
    minor += 1
    patch = 0
else:
    patch += 1

data["version"] = f"{major}.{minor}.{patch}"
data["build"] = data.get("build", 0) + 1
data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

version_file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Versão: {data['version']} (build {data['build']}) — {data['updated_at']}")
