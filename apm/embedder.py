"""
embedder.py
Calls the Voyage embedding API using a VOYAGE_API_KEY.
Get your key at dashboard.voyageai.com (free tier available).
Add it as a Railway environment variable: VOYAGE_API_KEY = pa-...

Voyage API docs: https://docs.voyageai.com/reference/embeddings-api
"""

import os
import time
import httpx

VOYAGE_URL   = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3"
EMBED_BATCH  = 64     # safe batch size; API supports up to 128


def _get_key() -> str:
    # Voyage API requires its own key from dashboard.voyageai.com
    # It is separate from the Anthropic API key despite sharing an account portal.
    key = os.environ.get("VOYAGE_API_KEY", "")
    if not key:
        raise RuntimeError("VOYAGE_API_KEY environment variable not set — get one at dashboard.voyageai.com")
    return key


def embed_texts(texts: list[str], input_type: str = "document") -> list[list[float]]:
    """
    Embed a list of texts using voyage-3.
    input_type: "document" for chunks being stored, "query" for search queries.
    Returns a list of 1024-dimensional float vectors.
    """
    key     = _get_key()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
    }

    all_embeddings = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        payload = {
            "model":      VOYAGE_MODEL,
            "input":      batch,
            "input_type": input_type,
        }
        # Retry up to 5 times on 429 rate-limit responses
        max_retries = 5
        for attempt in range(max_retries):
            resp = httpx.post(VOYAGE_URL, headers=headers, json=payload, timeout=60)
            if resp.status_code == 429:
                wait = 20 * (attempt + 1)   # 20s, 40s, 60s, 80s, 100s
                import logging
                logging.getLogger(__name__).warning(
                    "Voyage rate limit (429) on attempt %d — waiting %ds. %s",
                    attempt + 1, wait, resp.text[:120]
                )
                time.sleep(wait)
                continue
            if resp.status_code != 200:
                import logging
                logging.getLogger(__name__).error(
                    "Voyage API error %s: %s", resp.status_code, resp.text
                )
            resp.raise_for_status()
            break
        else:
            raise RuntimeError(f"Voyage API still rate-limiting after {max_retries} retries")

        data = resp.json()
        # data["data"] is a list of {"index": N, "embedding": [...]}
        ordered = sorted(data["data"], key=lambda x: x["index"])
        all_embeddings.extend(item["embedding"] for item in ordered)

    return all_embeddings


def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    return embed_texts([text], input_type="query")[0]
