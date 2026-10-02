"""Runtime configuration, read from the environment."""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Which generator to use when the request does not name one.
    default_provider: str = os.getenv("DEFAULT_PROVIDER", "claude")

    # Anthropic
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

    # Microsoft Graph / Copilot Chat API
    copilot_tenant_id: str | None = os.getenv("COPILOT_TENANT_ID")
    copilot_client_id: str | None = os.getenv("COPILOT_CLIENT_ID")
    copilot_client_secret: str | None = os.getenv("COPILOT_CLIENT_SECRET")

    # Comma-separated list of allowed frontend origins.
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]

    # Hard ceiling, mirrored in the frontend.
    max_chapters: int = int(os.getenv("MAX_CHAPTERS", "10"))


settings = Settings()
