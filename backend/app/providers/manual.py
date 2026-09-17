"""No model at all: the editor's text is used exactly as supplied.

This is the fallback when no provider is configured or reachable, and it is what
every 'verbatim' chapter uses regardless of the selected provider.
"""
from __future__ import annotations

from .base import Provider


class ManualProvider(Provider):
    name = "manual"

    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        marker = "--- editor's text ---"
        if marker in prompt:
            body = prompt.split(marker, 1)[1]
            return body.rsplit("--- end ---", 1)[0].strip()
        return ""
