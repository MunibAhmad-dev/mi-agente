"""Secret detection + masking (spec §45): "Never store API keys inside the
context store." Detection is deterministic pattern matching (GitHub/AWS/Slack
tokens, bearer headers, key=value pairs, connection strings). Masked values
keep their shape so recovery remains useful without leaking the secret.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("aws_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("openai_key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("bearer", re.compile(r"\bBearer\s+[A-Za-z0-9._\-]{15,}", re.IGNORECASE)),
    ("kv_secret", re.compile(
        r"\b(api[_-]?key|secret|password|passwd|token|authorization)\b\s*[:=]\s*\S+",
        re.IGNORECASE)),
    ("basic_auth_url", re.compile(r"\bhttps?://[^\s/:@]+:[^\s/@]+@[^\s]+")),
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]


@dataclass
class SecretHit:
    kind: str
    start: int
    end: int
    masked: str


def detect_secrets(text: str) -> list[SecretHit]:
    hits: list[SecretHit] = []
    for kind, rx in _PATTERNS:
        for m in rx.finditer(text):
            raw = m.group(0)
            if kind == "private_key_block":
                masked = "-----BEGIN ... PRIVATE KEY (redacted) -----"
            else:
                # keep first 4 and last 2 chars of the secret portion
                core = raw
                if len(core) > 10:
                    masked = f"{core[:4]}{'*' * 8}{core[-2:]}"
                else:
                    masked = "*" * len(core)
            hits.append(SecretHit(kind, m.start(), m.end(), masked))
    return hits


def mask_secrets(text: str) -> tuple[str, int]:
    """Return (masked_text, n_hits). Non-destructive outside matched spans."""
    hits = detect_secrets(text)
    if not hits:
        return text, 0
    out = text
    for h in sorted(hits, key=lambda x: -x.start):
        out = out[:h.start] + h.masked + out[h.end:]
    return out, len(hits)


def contains_secret(text: str) -> bool:
    return any(True for _ in detect_secrets(text))
