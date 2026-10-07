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

# --- measured from a rendered A4 page at an 8 pt body size ---
# Card and short-news text is now set between MIN_PT and MAX_PT (see fit_size);
# line height and characters per line scale from these 8 pt measurements.
BASE_PT = 8.0
MIN_PT = 9.0
MAX_PT = 12.0
STEP_PT = 0.5
PARA_GAP_CM = 0.074          # CardBody space-after (2.1 pt), not scaled
NEWS_ICON_CM = 0.85          # a news row is never shorter than its 24 pt icon
BULLET_SHARE = 0.92          # bullet text is indented, so slightly fewer chars
PAGE_BODY_CM = 24.1          # printable height between the margins
TITLE_BLOCK_CM = 2.6         # title, headline, date and the rule beneath
CARD_ROW_OVERHEAD_CM = 1.15  # card padding, border, icon heading row and the gap below
NEWS_ROW_OVERHEAD_CM = 0.45  # row padding and the hairline rule
LINE_CM = 0.37               # one line of body text

CHARS_PER_LINE_HALF = 50     # a card occupying half the page width
CHARS_PER_LINE_FULL = 105    # a card spanning the full width
CHARS_PER_LINE_NEWS = 90     # the text column of a short-news row
NEWS_LINES = 3               # lines allowed per short-news item

# The optional entries/exits row: one line of text beside a 24 pt icon,
# with its padding and rules. Reserved whole whenever the row is switched on.
MOVES_ROW_CM = 1.3

# A picture in a card spans the card's inner width and keeps its proportions,
# but is never taller than IMAGE_MAX_CM (a tall one is narrowed and centred).
# Pictures are passed around as their height-to-width ratio, 0 for none.
IMAGE_MAX_CM = 4.5
IMAGE_GAP_CM = 0.15           # between the picture and the text below
HALF_INNER_CM = 7.99          # a half-width card less its padding
FULL_INNER_CM = 17.04         # a full-width card less its padding

# The optional editorial above the cards: a heading row like a card's, then
# full-width text. Measured like a card row, without the grey box.
EDITORIAL_OVERHEAD_CM = CARD_ROW_OVERHEAD_CM

MAX_CARDS = 4
MAX_NEWS = 3


def card_rows(active_cards: int) -> int:
    """Cards are laid out two per row; an odd last card spans the full width."""
    return (active_cards + 1) // 2


def is_full_width(index: int, active_cards: int) -> bool:
    """True when this card is the odd one out and should span the page."""
    return active_cards % 2 == 1 and index == active_cards - 1


def line_cm(size_pt: float) -> float:
    return LINE_CM * size_pt / BASE_PT


def chars_per_line(base_chars: int, size_pt: float) -> float:
    return base_chars * BASE_PT / size_pt


def editorial_cm(paragraphs: list[str] | None, size: float) -> float:
    """Height of the editorial block, heading included; 0 when there is none."""
    if not paragraphs:
        return 0.0
    head = EDITORIAL_OVERHEAD_CM + 2 * (line_cm(size) - line_cm(BASE_PT))
    return head + _card_cm([(p, False) for p in paragraphs], True, size)


def budget(
    active_cards: int,
    active_news: int,
    moves: bool = False,
    editorial: list[str] | None = None,
) -> dict:
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
        + (MOVES_ROW_CM if moves else 0.0)
        + editorial_cm(editorial, MIN_PT)
    )
    # Allowances assume the smallest size, so text within them always fits.
    usable_cm = max(0.0, PAGE_BODY_CM - overhead)
    total_lines = int(usable_cm / line_cm(MIN_PT))

    news_lines = active_news * NEWS_LINES
    card_lines = max(0, total_lines - news_lines)
    lines_per_row = card_lines // rows if rows else 0

    return {
        "card_half": int(lines_per_row * chars_per_line(CHARS_PER_LINE_HALF, MIN_PT)),
        "card_full": int(lines_per_row * chars_per_line(CHARS_PER_LINE_FULL, MIN_PT)),
        "news": int(NEWS_LINES * chars_per_line(CHARS_PER_LINE_NEWS, MIN_PT)),
        "lines_per_row": lines_per_row,
    }


def image_cm(ratio: float, full: bool) -> float:
    """Height a card's picture takes, gap included; 0 without a picture."""
    if not ratio:
        return 0.0
    return min((FULL_INNER_CM if full else HALF_INNER_CM) * ratio, IMAGE_MAX_CM) + IMAGE_GAP_CM


def _lines(text: str, per_line: float) -> int:
    return max(1, -(-len(text) // max(1, int(per_line))))


def _card_cm(
    paragraphs: list[tuple[str, bool]], full: bool, size: float, image: float = 0.0
) -> float:
    """Height of one card's body text, and its picture if it has one.
    `paragraphs` is (text, is_bullet)."""
    base = CHARS_PER_LINE_FULL if full else CHARS_PER_LINE_HALF
    per_line = chars_per_line(base, size)
    h = image_cm(image, full)
    for text, bullet in paragraphs:
        h += _lines(text, per_line * (BULLET_SHARE if bullet else 1)) * line_cm(size)
        h += PARA_GAP_CM
    return h


def _news_cm(lines: list[str], size: float) -> float:
    per_line = chars_per_line(CHARS_PER_LINE_NEWS, size)
    h = sum(_lines(l, per_line) for l in lines) * line_cm(size)
    return max(h, NEWS_ICON_CM) + NEWS_ROW_OVERHEAD_CM


def fit_size(
    cards: list[list[tuple[str, bool]]],
    news: list[list[str]],
    moves: bool = False,
    editorial: list[str] | None = None,
    images: list[float] | None = None,
) -> float:
    """The largest text size, MIN_PT..MAX_PT, at which everything fits the page.

    One size for every card and short-news row, so the page reads as one
    piece: short content gets larger type, long content shrinks towards
    MIN_PT. Content too long even at MIN_PT stays at MIN_PT (the form's
    counters warn about that). Mirrored in frontend/src/budget.js.
    """
    n = len(cards)
    pics = list(images or []) + [0.0] * n
    size = MAX_PT
    while size >= MIN_PT:
        # The card heading (title and subtitle) grows with the text as well.
        row = CARD_ROW_OVERHEAD_CM + 2 * (line_cm(size) - line_cm(BASE_PT))
        total = TITLE_BLOCK_CM + (MOVES_ROW_CM if moves else 0.0)
        total += editorial_cm(editorial, size)
        i = 0
        while i < n:
            if is_full_width(i, n):
                total += row + _card_cm(cards[i], True, size, pics[i])
                i += 1
            else:
                total += row + max(
                    _card_cm(cards[k], False, size, pics[k]) for k in range(i, min(i + 2, n))
                )
                i += 2
        total += sum(_news_cm(l, size) for l in news)
        if total <= PAGE_BODY_CM:
            return size
        size -= STEP_PT
    return MIN_PT


def card_limit(
    index: int,
    active_cards: int,
    active_news: int,
    moves: bool = False,
    editorial: list[str] | None = None,
    image: float = 0.0,
) -> int:
    """A card's character allowance; `image` is its picture's height-to-width
    ratio, 0 without one."""
    b = budget(active_cards, active_news, moves, editorial)
    full = is_full_width(index, active_cards)
    limit = b["card_full"] if full else b["card_half"]
    if image:
        lines = -(-image_cm(image, full) // line_cm(MIN_PT))
        per_line = chars_per_line(CHARS_PER_LINE_FULL if full else CHARS_PER_LINE_HALF, MIN_PT)
        limit -= int(lines * per_line)
    return max(0, limit)
