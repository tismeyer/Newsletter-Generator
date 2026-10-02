"""
retriever.py
Hybrid semantic + keyword search over manual_chunks.
Used by the /generate endpoint to ground drafts in actual manual content.
"""

import os
import logging
from typing import Optional

from embedder import embed_query
from supabase import create_client

log = logging.getLogger(__name__)

_supa = None

def _get_supa():
    global _supa
    if _supa is None:
        _supa = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_KEY"],
        )
    return _supa


def retrieve(
    query: str,
    top_k: int            = 6,
    manual_filter: list   = None,   # e.g. ["OM-A", "OM-B E2"] — None = all
) -> list[dict]:
    """
    Embed the query and call the hybrid search function in Supabase.
    Returns a list of chunk dicts ordered by relevance.
    """
    vec = embed_query(query)

    supa   = _get_supa()
    result = supa.rpc("search_chunks", {
        "query_embedding": vec,
        "query_text":      query,
        "match_count":     top_k,
        "manual_filter":   manual_filter,
    }).execute()

    return result.data or []


def format_context(chunks: list[dict], max_chars: int = 6000) -> str:
    """
    Format retrieved chunks into a context block for injection into the
    generator system prompt. Each chunk is shown verbatim with its citation.
    Total length is capped to avoid overflowing the model's context.
    """
    if not chunks:
        return ""

    lines = [
        "The following passages are extracted verbatim from helvetic manuals.",
        "Where relevant, reference them in the draft using their citation.",
        "Do not contradict or paraphrase these passages in a way that changes",
        "the meaning of 'shall', 'should', 'may', or who performs an action.",
        "",
    ]

    total = 0
    for c in chunks:
        block = (
            f"[{c['citation']}]\n"
            f"{c['content']}\n"
        )
        if total + len(block) > max_chars:
            break
        lines.append(block)
        total += len(block)

    return "\n".join(lines)


def list_manuals() -> list[dict]:
    """Return all ingested manuals for the admin UI."""
    supa   = _get_supa()
    result = supa.table("manuals").select("*").order("manual_name").execute()
    return result.data or []
