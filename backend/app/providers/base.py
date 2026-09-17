"""The seam between the app and whichever model writes the text.

Everything above this interface (form, prompts, renderer) is provider-agnostic;
swapping Claude for Copilot is a configuration change, not a rewrite.
"""
from __future__ import annotations

import abc


class GenerationError(RuntimeError):
    """Raised when a provider cannot produce text. Carries a message fit for the UI."""


class Provider(abc.ABC):
    name: str

    @abc.abstractmethod
    async def complete(self, system: str, prompt: str, max_tokens: int = 1200) -> str:
        """Return plain text for one prompt."""

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None
