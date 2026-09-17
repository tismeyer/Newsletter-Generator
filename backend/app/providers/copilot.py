"""Microsoft 365 Copilot Chat API (Graph).

Kept deliberately thin and behind the same interface as Claude. The endpoint is
in preview at the time of writing, so treat the shapes below as the part most
likely to need updating; nothing else in the app depends on them.
"""
from __future__ import annotations

import httpx

from ..config import settings
from .base import GenerationError, Provider

TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
CHAT_URL = "https://graph.microsoft.com/beta/copilot/conversations"


class CopilotProvider(Provider):
    name = "copilot"

    def __init__(self) -> None:
        missing = [
            k
            for k, v in {
                "COPILOT_TENANT_ID": settings.copilot_tenant_id,
                "COPILOT_CLIENT_ID": settings.copilot_client_id,
                "COPILOT_CLIENT_SECRET": settings.copilot_client_secret,
            }.items()
            if not v
        ]
        if missing:
            raise GenerationError("Copilot is not configured: " + ", ".join(missing))
        self._client = httpx.AsyncClient(timeout=120)
        self._token: str | None = None

    async def _access_token(self) -> str:
        if self._token:
            return self._token
        r = await self._client.post(
            TOKEN_URL.format(tenant=settings.copilot_tenant_id),
            data={
                "client_id": settings.copilot_client_id,
                "client_secret": settings.copilot_client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
        )
        if r.status_code != 200:
            raise GenerationError("Could not obtain a Microsoft Graph token.")
        self._token = r.json()["access_token"]
        return self._token

    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        token = await self._access_token()
        try:
            r = await self._client.post(
                CHAT_URL,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                # Copilot has no separate system role: the instructions are
                # prepended to the message instead.
                json={"message": {"text": f"{system}\n\n{prompt}"}},
            )
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise GenerationError(f"Copilot returned {e.response.status_code}.") from e
        except httpx.HTTPError as e:
            raise GenerationError("Could not reach Copilot.") from e

        data = r.json()
        text = data.get("message", {}).get("text") or data.get("text", "")
        if not text.strip():
            raise GenerationError("Copilot returned an empty response.")
        return text.strip()

    async def aclose(self) -> None:
        await self._client.aclose()
