"""Character budget for the one-page bulletin.

The layout is named "1-page-bulletin", so fitting on one page is the whole
point. Rather than let an editor discover the overflow after generating, the
form shows a live allowance per box, computed here and mirrored in
frontend/src/budget.js. Keep the two in step.

The model is deliberately crude: it converts the free vertical space into
lines, then lines into characters. It is calibrated against a real rendered
page rather than derived from font metrics, so treat the constants as measured
values, not theory.
"""
from __future__ import annotations

# --- measured from a rendered A4 page at the layout's 8 pt body size ---
PAGE_BODY_CM = 24.1          # printable height between the margins
TITLE_BLOCK_CM = 2.6         # title, headline, date and the rule beneath
CARD_ROW_OVERHEAD_CM = 0.85  # card padding, border and the gap below the row
NEWS_ROW_OVERHEAD_CM = 0.45  # row padding and the hairline rule
LINE_CM = 0.37               # one line of body text

CHARS_PER_LINE_HALF = 50     # a card occupying half the page width
CHARS_PER_LINE_FULL = 105    # a card spanning the full width
CHARS_PER_LINE_NEWS = 90     # the text column of a short-news row
NEWS_LINES = 3               # lines allowed per short-news item

MAX_CARDS = 4
MAX_NEWS = 3


def card_rows(active_cards: int) -> int:
    """Cards are laid out two per row; an odd last card spans the full width."""
    return (active_cards + 1) // 2


def is_full_width(index: int, active_cards: int) -> bool:
    """True when this card is the odd one out and should span the page."""
    return active_cards % 2 == 1 and index == active_cards - 1


def budget(active_cards: int, active_news: int) -> dict:
    """Return the per-box character allowances for this combination.

    Fewer boxes means more room for the ones that remain, which is why the
    allowance is computed from the live counts rather than fixed per box.
    """
    active_cards = max(0, min(active_cards, MAX_CARDS))
    active_news = max(0, min(active_news, MAX_NEWS))
    rows = card_rows(active_cards)

    overhead = (
        TITLE_BLOCK_CM
        + rows * CARD_ROW_OVERHEAD_CM
        + active_news * NEWS_ROW_OVERHEAD_CM
    )
    usable_cm = max(0.0, PAGE_BODY_CM - overhead)
    total_lines = int(usable_cm / LINE_CM)

    news_lines = active_news * NEWS_LINES
    card_lines = max(0, total_lines - news_lines)
    lines_per_row = card_lines // rows if rows else 0

    return {
        "card_half": lines_per_row * CHARS_PER_LINE_HALF,
        "card_full": lines_per_row * CHARS_PER_LINE_FULL,
        "news": NEWS_LINES * CHARS_PER_LINE_NEWS,
        "lines_per_row": lines_per_row,
    }


def card_limit(index: int, active_cards: int, active_news: int) -> int:
    b = budget(active_cards, active_news)
    return b["card_full"] if is_full_width(index, active_cards) else b["card_half"]
