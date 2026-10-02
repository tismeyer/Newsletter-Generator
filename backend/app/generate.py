"""Orchestration: editor input in, drafted chapters out.

Verbatim chapters never reach a model, so text that must not change cannot
change. Everything else goes through whichever provider was selected.
"""
from __future__ import annotations

import asyncio
import re

from .prompts import HOUSE_STYLE, box_prompt, chapter_prompt, effective_box_policy
from .providers import GenerationError, Provider
from .schemas import (
    Card,
    Chapter,
    DocumentRequest,
    NewsItem,
    RenderedBlock,
    RenderedCard,
    RenderedChapter,
    RenderedNews,
    StyleSpec,
    Treatment,
)

BULLET_RE = re.compile(r"^\s*[-*\u2022\u2013]\s+")
MARKER_RE = re.compile(r"^\s*\[(ACTION|INFO)\]\s*", re.I)


def text_to_blocks(text: str) -> list[RenderedBlock]:
    """Split plain text into body paragraphs, bullet runs and marked boxes."""
    blocks: list[RenderedBlock] = []
    bullets: list[str] = []

    def flush() -> None:
        if bullets:
            blocks.append(RenderedBlock(kind="bullets", items=bullets.copy()))
            bullets.clear()

    for raw in text.split("\n"):
        line = raw.rstrip()
        if not line.strip():
            flush()
            continue
        marker = MARKER_RE.match(line)
        if marker:
            flush()
            kind = "action_box" if marker.group(1).upper() == "ACTION" else "info_box"
            body = MARKER_RE.sub("", line).strip()
            title, _, rest = body.partition(":")
            if rest.strip():
                blocks.append(RenderedBlock(kind=kind, title=title.strip(), text=rest.strip()))
            else:
                blocks.append(
                    RenderedBlock(
                        kind=kind,
                        title="Action required" if kind == "action_box" else "Good to know",
                        text=body,
                    )
                )
            continue
        if BULLET_RE.match(line):
            bullets.append(BULLET_RE.sub("", line).strip())
            continue
        flush()
        blocks.append(RenderedBlock(kind="body", text=line.strip()))

    flush()
    return blocks


async def _chapter_text(provider: Provider, chapter: Chapter, style: StyleSpec) -> tuple[str, str]:
    """Return (text, provider_used) for one chapter."""
    if chapter.treatment is Treatment.VERBATIM or not chapter.text.strip():
        return chapter.text, "manual"
    may_boxes = effective_box_policy(chapter, style)
    prompt = chapter_prompt(chapter, style, may_boxes)
    text = await provider.complete(HOUSE_STYLE, prompt, max_tokens=1600)
    return text, provider.name


async def _one_box(provider: Provider, box, style: StyleSpec, chapter: Chapter) -> RenderedBlock:
    """Boxes the editor wrote are used as-is; empty ones are drafted."""
    if chapter.treatment is Treatment.VERBATIM or (box.title.strip() and box.text.strip()):
        return RenderedBlock(kind=box.type.value, title=box.title, text=box.text)
    out = await provider.complete(
        HOUSE_STYLE, box_prompt(box.type.value, box.title, box.text, style), max_tokens=300
    )
    lines = [l.strip() for l in out.split("\n") if l.strip()]
    title = box.title.strip() or (lines[0] if lines else "Note")
    body = "\n".join(lines[1:]) if len(lines) > 1 else (box.text or (lines[0] if lines else ""))
    return RenderedBlock(kind=box.type.value, title=title, text=body)


async def build_draft(req: DocumentRequest, provider: Provider) -> list[RenderedChapter]:
    async def one(chapter: Chapter) -> RenderedChapter:
        text, used = await _chapter_text(provider, chapter, req.style)
        blocks = text_to_blocks(text)
        boxes = await asyncio.gather(
            *[_one_box(provider, b, req.style, chapter) for b in chapter.boxes]
        )
        blocks.extend(boxes)
        return RenderedChapter(heading=chapter.heading, blocks=blocks, provider_used=used)

    usable = [c for c in req.chapters if c.heading.strip() or c.text.strip() or c.boxes]
    if not usable:
        raise GenerationError("Add at least one chapter with a heading or some text.")
    # Chapters are independent, so they are drafted concurrently.
    return list(await asyncio.gather(*[one(c) for c in usable]))


# ---------- one-page layout ----------

async def _box_text(provider: Provider, treatment: Treatment, text: str,
                    heading: str, style: StyleSpec, limit: int) -> tuple[str, str]:
    """Shared path for cards and news rows: verbatim bypasses the model."""
    if treatment is Treatment.VERBATIM or not text.strip():
        return text, "manual"
    chapter = Chapter(heading=heading, treatment=treatment, text=text)
    prompt = chapter_prompt(chapter, style, may_add_boxes=False)
    if treatment is not Treatment.POLISH:
        prompt += (
            f"\n\nHard limit: the result must not exceed {limit} characters, "
            "including spaces. This box is part of a single-page layout and "
            "longer text will not fit."
        )
    out = await provider.complete(HOUSE_STYLE, prompt, max_tokens=900)
    return out, provider.name


async def build_one_pager(req: DocumentRequest, provider: Provider):
    from .budget import budget as compute_budget, card_limit

    cards = [c for c in req.cards if c.filled]
    news = [n for n in req.news if n.filled]
    if not cards and not news:
        raise GenerationError("Fill at least one card or one short-news row.")

    limits = compute_budget(len(cards), len(news))

    async def one_card(index: int, card: Card) -> RenderedCard:
        limit = card_limit(index, len(cards), len(news))
        text, used = await _box_text(
            provider, card.treatment, card.text, card.title, req.style, limit
        )
        return RenderedCard(
            icon=card.icon, title=card.title, subtitle=card.subtitle,
            blocks=text_to_blocks(text), provider_used=used,
        )

    async def one_news(item: NewsItem) -> RenderedNews:
        text, used = await _box_text(
            provider, item.treatment, item.text, item.label, req.style, limits["news"]
        )
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        return RenderedNews(icon=item.icon, label=item.label, lines=lines, provider_used=used)

    rendered_cards = list(await asyncio.gather(*[one_card(i, c) for i, c in enumerate(cards)]))
    rendered_news = list(await asyncio.gather(*[one_news(n) for n in news]))
    return rendered_cards, rendered_news
