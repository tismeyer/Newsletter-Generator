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

const lineCm = (size) => (LINE_CM * size) / BASE_PT;
const charsPerLine = (base, size) => (base * BASE_PT) / size;

const CHARS_PER_LINE_HALF = 50;
const CHARS_PER_LINE_FULL = 105;
const CHARS_PER_LINE_NEWS = 90;
const NEWS_LINES = 3;

export const MAX_CARDS = 4;
export const MAX_NEWS = 3;

export const cardRows = (n) => Math.floor((n + 1) / 2);

/** The odd last card spans the full width rather than leaving a hole. */
export const isFullWidth = (index, activeCards) =>
  activeCards % 2 === 1 && index === activeCards - 1;

export function budget(activeCards, activeNews) {
  const cards = Math.max(0, Math.min(activeCards, MAX_CARDS));
  const news = Math.max(0, Math.min(activeNews, MAX_NEWS));
  const rows = cardRows(cards);

  const overhead =
    TITLE_BLOCK_CM + rows * CARD_ROW_OVERHEAD_CM + news * NEWS_ROW_OVERHEAD_CM;
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

const cardCm = (paragraphs, full, size) => {
  const perLine = charsPerLine(full ? CHARS_PER_LINE_FULL : CHARS_PER_LINE_HALF, size);
  return paragraphs.reduce(
    (h, [text, bullet]) =>
      h + lines(text, perLine * (bullet ? BULLET_SHARE : 1)) * lineCm(size) + PARA_GAP_CM,
    0
  );
};

const newsCm = (rowLines, size) => {
  const perLine = charsPerLine(CHARS_PER_LINE_NEWS, size);
  const h = rowLines.reduce((a, l) => a + lines(l, perLine), 0) * lineCm(size);
  return Math.max(h, NEWS_ICON_CM) + NEWS_ROW_OVERHEAD_CM;
};

/**
 * The largest text size, MIN_PT..MAX_PT, at which every card and short-news
 * row fits the page; one size for all of them. Mirror of fit_size in
 * backend/app/budget.py. `cards` holds [text, isBullet] pairs per card,
 * `news` the text lines per row.
 */
export function fitSize(cards, news) {
  const n = cards.length;
  for (let size = MAX_PT; size >= MIN_PT; size -= STEP_PT) {
    // The card heading (title and subtitle) grows with the text as well.
    const row = CARD_ROW_OVERHEAD_CM + 2 * (lineCm(size) - lineCm(BASE_PT));
    let total = TITLE_BLOCK_CM;
    for (let i = 0; i < n; ) {
      if (isFullWidth(i, n)) {
        total += row + cardCm(cards[i], true, size);
        i += 1;
      } else {
        const pair = cards.slice(i, i + 2);
        total += row + Math.max(...pair.map((c) => cardCm(c, false, size)));
        i += 2;
      }
    }
    total += news.reduce((a, l) => a + newsCm(l, size), 0);
    if (total <= PAGE_BODY_CM) return size;
  }
  return MIN_PT;
}

export function cardLimit(index, activeCards, activeNews) {
  const b = budget(activeCards, activeNews);
  return isFullWidth(index, activeCards) ? b.card_full : b.card_half;
}
