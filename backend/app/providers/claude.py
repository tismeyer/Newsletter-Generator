from __future__ import annotations

import httpx

from ..config import settings
from .base import GenerationError, Provider

API_URL = "https://api.anthropic.com/v1/messages"


class ClaudeProvider(Provider):
    name = "claude"

    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise GenerationError("ANTHROPIC_API_KEY is not set.")
        self._client = httpx.AsyncClient(timeout=180)  # a long Word import takes a while

    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        try:
            r = await self._client.post(
                API_URL,
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.anthropic_model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise GenerationError(f"Claude returned {e.response.status_code}.") from e
        except httpx.HTTPError as e:
            raise GenerationError("Could not reach Claude.") from e

        blocks = r.json().get("content", [])
        text = "\n".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        if not text.strip():
            raise GenerationError("Claude returned an empty response.")
        return text.strip()

    async def aclose(self) -> None:
        await self._client.aclose()
