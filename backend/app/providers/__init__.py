from __future__ import annotations

from ..config import settings
from .base import GenerationError, Provider
from .claude import ClaudeProvider
from .copilot import CopilotProvider
from .manual import ManualProvider

_REGISTRY = {"claude": ClaudeProvider, "copilot": CopilotProvider, "manual": ManualProvider}


def get_provider(name: str | None) -> Provider:
    key = (name or settings.default_provider).lower()
    if key not in _REGISTRY:
        raise GenerationError(f"Unknown provider '{key}'.")
    return _REGISTRY[key]()


def available() -> dict[str, bool]:
    """Which providers are usable right now, for the frontend's selector."""
    return {
        "claude": bool(settings.anthropic_api_key),
        "copilot": all(
            [settings.copilot_tenant_id, settings.copilot_client_id, settings.copilot_client_secret]
        ),
        "manual": True,
    }


__all__ = ["get_provider", "available", "Provider", "GenerationError"]
