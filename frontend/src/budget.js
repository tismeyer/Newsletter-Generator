// Mirror of backend/app/budget.py. The backend is the authority (GET /api/budget);
// this copy exists so the counters update as the editor types, without a round trip.
// If you change one, change the other.

const PAGE_BODY_CM = 24.1;
const TITLE_BLOCK_CM = 2.6;
const CARD_ROW_OVERHEAD_CM = 1.15;
const NEWS_ROW_OVERHEAD_CM = 0.45;
const LINE_CM = 0.37;

// Card and short-news text is set between MIN_PT and MAX_PT (see fitSize);
// line height and characters per line scale from the 8 pt measurements.
const BASE_PT = 8;
export const MIN_PT = 9;
export const MAX_PT = 12;
const STEP_PT = 0.5;
const PARA_GAP_CM = 0.074;
const NEWS_ICON_CM = 0.85;
const BULLET_SHARE = 0.92;

export const lineCm = (size) => (LINE_CM * size) / BASE_PT;
const charsPerLine = (base, size) => (base * BASE_PT) / size;

const CHARS_PER_LINE_HALF = 50;
const CHARS_PER_LINE_FULL = 105;
const CHARS_PER_LINE_NEWS = 90;
const NEWS_LINES = 3;

// The optional entries/exits row, reserved whole when switched on (MOVES_ROW_CM in budget.py).
const MOVES_ROW_CM = 1.3;

// A card picture spans the card's inner width, proportions kept, never taller
// than IMAGE_MAX_CM. Pictures are passed as height-to-width ratios, 0 for none.
export const IMAGE_MAX_CM = 4.5;
const IMAGE_GAP_CM = 0.15;
const HALF_INNER_CM = 7.99;
const FULL_INNER_CM = 17.04;

// The optional editorial above the cards: a heading row like a card's, then full-width text.
const EDITORIAL_OVERHEAD_CM = CARD_ROW_OVERHEAD_CM;

export const MAX_CARDS = 4;
export const MAX_NEWS = 3;

export const cardRows = (n) => Math.floor((n + 1) / 2);

/** The odd last card spans the full width rather than leaving a hole. */
export const isFullWidth = (index, activeCards) =>
  activeCards % 2 === 1 && index === activeCards - 1;

/** Height a card's picture takes, gap included; 0 without a picture. */
export const imageCm = (ratio, full) =>
  ratio ? Math.min((full ? FULL_INNER_CM : HALF_INNER_CM) * ratio, IMAGE_MAX_CM) + IMAGE_GAP_CM : 0;

/** Height of the editorial block, heading included; 0 when there is none. */
export function editorialCm(paragraphs, size) {
  if (!paragraphs || !paragraphs.length) return 0;
  const head = EDITORIAL_OVERHEAD_CM + 2 * (lineCm(size) - lineCm(BASE_PT));
  return head + cardCm(paragraphs.map((p) => [p, false]), true, size);
}

export function budget(activeCards, activeNews, moves = false, editorial = null) {
  const cards = Math.max(0, Math.min(activeCards, MAX_CARDS));
  const news = Math.max(0, Math.min(activeNews, MAX_NEWS));
  const rows = cardRows(cards);

  const overhead =
    TITLE_BLOCK_CM + rows * CARD_ROW_OVERHEAD_CM + news * NEWS_ROW_OVERHEAD_CM +
    (moves ? MOVES_ROW_CM : 0) + editorialCm(editorial, MIN_PT);
  // Allowances assume the smallest size, so text within them always fits.
  const totalLines = Math.floor(Math.max(0, PAGE_BODY_CM - overhead) / lineCm(MIN_PT));
  const cardLines = Math.max(0, totalLines - news * NEWS_LINES);
  const linesPerRow = rows ? Math.floor(cardLines / rows) : 0;

  return {
    card_half: Math.floor(linesPerRow * charsPerLine(CHARS_PER_LINE_HALF, MIN_PT)),
    card_full: Math.floor(linesPerRow * charsPerLine(CHARS_PER_LINE_FULL, MIN_PT)),
    news: Math.floor(NEWS_LINES * charsPerLine(CHARS_PER_LINE_NEWS, MIN_PT)),
    lines_per_row: linesPerRow,
  };
}

const lines = (text, perLine) => Math.max(1, Math.ceil(text.length / Math.max(1, Math.floor(perLine))));

function cardCm(paragraphs, full, size, image = 0) {
  const perLine = charsPerLine(full ? CHARS_PER_LINE_FULL : CHARS_PER_LINE_HALF, size);
  return paragraphs.reduce(
    (h, [text, bullet]) =>
      h + lines(text, perLine * (bullet ? BULLET_SHARE : 1)) * lineCm(size) + PARA_GAP_CM,
    imageCm(image, full)
  );
}

const newsCm = (rowLines, size) => {
  const perLine = charsPerLine(CHARS_PER_LINE_NEWS, size);
  const h = rowLines.reduce((a, l) => a + lines(l, perLine), 0) * lineCm(size);
  return Math.max(h, NEWS_ICON_CM) + NEWS_ROW_OVERHEAD_CM;
};

/**
 * The largest text size, MIN_PT..MAX_PT, at which every card and short-news
 * row fits the page; one size for all of them. Mirror of fit_size in
 * backend/app/budget.py. `cards` holds [text, isBullet] pairs per card,
 * `news` the text lines per row, `editorial` its paragraphs (or null) and
 * `images` each card's picture ratio (0 for none).
 */
export function fitSize(cards, news, moves = false, editorial = null, images = []) {
  const n = cards.length;
  const pic = (i) => images[i] || 0;
  for (let size = MAX_PT; size >= MIN_PT; size -= STEP_PT) {
    // The card heading (title and subtitle) grows with the text as well.
    const row = CARD_ROW_OVERHEAD_CM + 2 * (lineCm(size) - lineCm(BASE_PT));
    let total = TITLE_BLOCK_CM + (moves ? MOVES_ROW_CM : 0) + editorialCm(editorial, size);
    for (let i = 0; i < n; ) {
      if (isFullWidth(i, n)) {
        total += row + cardCm(cards[i], true, size, pic(i));
        i += 1;
      } else {
        const pair = cards.slice(i, i + 2);
        total += row + Math.max(...pair.map((c, k) => cardCm(c, false, size, pic(i + k))));
        i += 2;
      }
    }
    total += news.reduce((a, l) => a + newsCm(l, size), 0);
    if (total <= PAGE_BODY_CM) return size;
  }
  return MIN_PT;
}

/** A card's character allowance; `image` is its picture's ratio, 0 without one. */
export function cardLimit(index, activeCards, activeNews, moves = false, editorial = null, image = 0) {
  const b = budget(activeCards, activeNews, moves, editorial);
  const full = isFullWidth(index, activeCards);
  let limit = full ? b.card_full : b.card_half;
  if (image) {
    const picLines = Math.ceil(imageCm(image, full) / lineCm(MIN_PT));
    limit -= Math.floor(picLines * charsPerLine(full ? CHARS_PER_LINE_FULL : CHARS_PER_LINE_HALF, MIN_PT));
  }
  return Math.max(0, limit);
}
