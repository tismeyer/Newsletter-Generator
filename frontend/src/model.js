export const KICKERS = [
  "ACM Newsletter",
  "Cabin Department Newsletter",
  "Flight Operations Newsletter",
  "Safety Department Newsletter",
  "Compliance Department Newsletter",
  "Ground Operations Newsletter",
  "Ground Operations Bulletin",
  "Training Department Newsletter",
  "HR Newsletter",
  "IT Newsletter",
];

export const DOC_TYPES = ["Newsletter", "Bulletin"];
export const CUSTOM = "Custom\u2026";
export const MAX_CHAPTERS = 10;

export const LAYOUTS = [
  { v: "standard", label: "Newsletter / bulletin", hint: "Chapters over as many pages as needed." },
  { v: "one_pager", label: "1-page bulletin", hint: "Four cards and three short-news rows on a single page." },
];

export const ICONS = [
  { v: "warn", label: "Warning" },
  { v: "star", label: "Star" },
  { v: "gear", label: "Operations" },
  { v: "info", label: "Info" },
  { v: "smile", label: "People" },
  { v: "heart", label: "Wellbeing" },
  { v: "check", label: "Tick" },
];

export const newCard = (icon = "info") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  icon, title: "", subtitle: "", text: "", treatment: "draft",
});

export const newNews = (icon = "smile") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  icon, label: "", text: "", treatment: "draft",
});

/** A box counts towards the layout only once it has a title or some text. */
export const cardFilled = (c) => Boolean(c.title.trim() || c.text.trim());
export const newsFilled = (n) => Boolean(n.label.trim() || n.text.trim());

export const TREATMENTS = [
  { v: "verbatim", label: "Keep exactly as is" },
  { v: "polish", label: "Proofread only" },
  { v: "draft", label: "Rough notes \u2014 let AI write" },
];

export const TREATMENT_COPY = {
  verbatim: {
    label: "Your text (used word for word)",
    placeholder: "Paste the finished text. Nothing here will be changed.",
    hint: "Nothing is rewritten and no model sees this text. No boxes are added.",
  },
  polish: {
    label: "Your text (proofread only)",
    placeholder: "Paste your draft. Spelling, grammar and punctuation are corrected \u2014 wording stays yours.",
    hint: "Spelling, grammar and punctuation only. No rewriting, no reordering, nothing added.",
  },
  draft: {
    label: "Rough notes for this chapter",
    placeholder: "Bullet points, facts, dates, sources \u2014 these become finished text.",
    hint: "Your notes are turned into finished prose in the house style.",
  },
};

const pad2 = (n) => String(n).padStart(2, "0");

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const currentIssue = () => {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)} ${d.getFullYear()}`;
};

export const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

export const departmentFrom = (kicker) =>
  String(kicker || "").replace(/\s+(Newsletter|Bulletin)\s*$/i, "").trim() || kicker || "";

export const newChapter = (heading = "") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  heading,
  text: "",
  treatment: "draft",
  box_policy: "inherit",
  boxes: [],
});

export const emptyState = () => ({
  masthead: {
    header_kicker: "Flight Operations Newsletter",
    doc_type: "Newsletter",
    doc_issue: currentIssue(),
    doc_headline: "",
    publication_date: todayISO(),
    footer_revision: "01",
    footer_issued_by: "",
  },
  issuedByTouched: false,
  style: {
    structure: "balanced",
    tone: "neutral",
    length: "standard",
    box_policy: "ai",
    style_notes: "",
  },
  chapters: [newChapter("Editorial"), newChapter("")],
  layout: "standard",
  cards: [newCard("warn"), newCard("star"), newCard("gear"), newCard("info")],
  news: [newNews("smile"), newNews("heart"), newNews("check")],
  provider: "claude",
});

/** The exact object the backend receives. */
export function toPayload(s) {
  const base = {
    masthead: {
      ...s.masthead,
      footer_issued_by:
        s.masthead.footer_issued_by || departmentFrom(s.masthead.header_kicker),
    },
    style: s.style,
    layout: s.layout,
    provider: s.provider,
    chapters: s.chapters
      .filter((c) => c.heading.trim() || c.text.trim() || c.boxes.length)
      .map((c) => ({
        heading: c.heading,
        treatment: c.treatment,
        text: c.text,
        box_policy: c.treatment === "verbatim" ? "none" : c.box_policy,
        boxes: c.boxes.map((b) => ({ type: b.type, title: b.title, text: b.text })),
      })),
  };

  if (s.layout !== "one_pager") return { ...base, cards: [], news: [] };

  // Unused boxes are dropped here, not in the renderer: the remaining boxes
  // then receive their share of the page.
  return {
    ...base,
    chapters: [],
    cards: s.cards.filter(cardFilled).map((c) => ({
      icon: c.icon, title: c.title, subtitle: c.subtitle,
      text: c.text, treatment: c.treatment,
    })),
    news: s.news.filter(newsFilled).map((n) => ({
      icon: n.icon, label: n.label, text: n.text, treatment: n.treatment,
    })),
  };
}
