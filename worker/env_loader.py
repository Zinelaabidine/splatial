import os
from pathlib import Path
from typing import Optional


def load_env_file(path: Optional[str] = None) -> bool:
    """Load KEY=VALUE pairs from a dotenv-style file into os.environ."""
    env_path = Path(path or "/etc/splatial-worker.env")
    if not env_path.exists():
        return False

    with env_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
    return True
