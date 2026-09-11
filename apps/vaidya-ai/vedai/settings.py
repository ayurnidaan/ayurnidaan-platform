"""Read only the supported local settings; never execute or interpolate values."""
from pathlib import Path


def local_settings(path=Path(".env")):
    if not path.is_file():
        return {}
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and key in {"OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_REASONING_EFFORT"}:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key] = value
    return values
