"""No model at all: the editor's text is used exactly as supplied.

This is the fallback when no provider is configured or reachable, and it is what
every 'verbatim' chapter uses regardless of the selected provider.
"""
from __future__ import annotations

from .base import Provider


class ManualProvider(Provider):
    name = "manual"

    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        if "<text>" in prompt:
            return prompt.split("<text>", 1)[1].rsplit("</text>", 1)[0].strip()
        return ""
