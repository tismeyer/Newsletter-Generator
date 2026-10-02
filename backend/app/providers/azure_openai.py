"""Azure OpenAI (Microsoft Foundry): the GPT models behind Microsoft Copilot,
run in helvetic's own Azure tenancy.

The server calls it with a key, the same way it calls Claude, so no user
sign-in is involved. IT creates the resource and a model deployment, and the
three values below go into Railway's variables.
"""
from __future__ import annotations

import httpx

from ..config import settings
from .base import GenerationError, Provider


class AzureOpenAIProvider(Provider):
    name = "azure"

    def __init__(self) -> None:
        missing = [
            k
            for k, v in {
                "AZURE_OPENAI_ENDPOINT": settings.azure_openai_endpoint,
                "AZURE_OPENAI_KEY": settings.azure_openai_key,
                "AZURE_OPENAI_DEPLOYMENT": settings.azure_openai_deployment,
            }.items()
            if not v
        ]
        if missing:
            raise GenerationError("Azure OpenAI is not configured: " + ", ".join(missing))
        self._client = httpx.AsyncClient(timeout=120)

    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        url = (
            f"{settings.azure_openai_endpoint.rstrip('/')}/openai/deployments/"
            f"{settings.azure_openai_deployment}/chat/completions"
        )
        try:
            r = await self._client.post(
                url,
                params={"api-version": settings.azure_openai_api_version},
                headers={"api-key": settings.azure_openai_key},
                json={
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "max_completion_tokens": max_tokens,
                },
            )
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("error", {}).get("message", "")
            except ValueError:
                pass
            raise GenerationError(
                f"Azure OpenAI returned {e.response.status_code}" + (f": {detail}" if detail else ".")
            ) from e
        except httpx.HTTPError as e:
            raise GenerationError("Could not reach Azure OpenAI.") from e

        choices = r.json().get("choices") or []
        text = (choices[0].get("message", {}).get("content") or "") if choices else ""
        if not text.strip():
            raise GenerationError("Azure OpenAI returned an empty response.")
        return text.strip()

    async def aclose(self) -> None:
        await self._client.aclose()
