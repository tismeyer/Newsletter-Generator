// Mirror of backend/app/budget.py. The backend is the authority (GET /api/budget);
// this copy exists so the counters update as the editor types, without a round trip.
// If you change one, change the other.

const PAGE_BODY_CM = 24.1;
const TITLE_BLOCK_CM = 2.6;
const CARD_ROW_OVERHEAD_CM = 0.85;
const NEWS_ROW_OVERHEAD_CM = 0.45;
const LINE_CM = 0.37;

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
  const totalLines = Math.floor(Math.max(0, PAGE_BODY_CM - overhead) / LINE_CM);
  const cardLines = Math.max(0, totalLines - news * NEWS_LINES);
  const linesPerRow = rows ? Math.floor(cardLines / rows) : 0;

  return {
    card_half: linesPerRow * CHARS_PER_LINE_HALF,
    card_full: linesPerRow * CHARS_PER_LINE_FULL,
    news: NEWS_LINES * CHARS_PER_LINE_NEWS,
    lines_per_row: linesPerRow,
  };
}

export function cardLimit(index, activeCards, activeNews) {
  const b = budget(activeCards, activeNews);
  return isFullWidth(index, activeCards) ? b.card_full : b.card_half;
}
