import { fitSize } from "./budget.js";

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
  { v: "warn", label: "Safety" },
  { v: "info", label: "Important" },
  { v: "star", label: "New" },
  { v: "gear", label: "Operations" },
  { v: "smile", label: "People" },
  { v: "heart", label: "Wellbeing" },
  { v: "check", label: "Done" },
  { v: "plane", label: "Flight ops" },
  { v: "clock", label: "Deadline" },
  { v: "mail", label: "Contact" },
  { v: "doc", label: "Manual" },
  { v: "flag", label: "Priority" },
  { v: "bolt", label: "Urgent" },
  { v: "cross", label: "Medical" },
  { v: "snow", label: "Winter" },
  { v: "pencil", label: "Editorial" },
  { v: "team", label: "Team" },
  { v: "thumbup", label: "Praise" },
  { v: "thumbdown", label: "Watch out" },
  { v: "entries", label: "Entries" },
  { v: "exits", label: "Exits" },
];

export const newCard = (icon = "info") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  icon, title: "", subtitle: "", text: "", treatment: "draft",
  draft: null, draftFrom: "",
});

export const newNews = (icon = "smile") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  icon, label: "", text: "", treatment: "draft",
  draft: null, draftFrom: "",
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

export const newChapter = (heading = "", icon = "") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  heading,
  icon,
  text: "",
  treatment: "draft",
  box_policy: "inherit",
  boxes: [],
  draft: null,
  draftFrom: "",
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
  chapters: [newChapter("Editorial", "pencil"), newChapter("", "info")],
  layout: "standard",
  cards: [newCard("warn"), newCard("star"), newCard("gear"), newCard("info")],
  news: [newNews("smile"), newNews("heart"), newNews("check")],
  provider: "claude",
});

// ---------- generated text ----------
//
// Once text has been generated for a box it is kept on that box as `draft`,
// plain text the editor can change by hand or have revised. From then on the
// draft is what goes into the document: it is sent as verbatim text, so it is
// never rewritten again unless the editor asks. `draftFrom` remembers the notes
// it was written from, to flag drafts whose notes have since changed.

export const hasDraft = (x) => typeof x.draft === "string";
export const draftStale = (x) => hasDraft(x) && (x.draftFrom ?? "") !== x.text;

const chapterUsed = (c) => Boolean(c.heading.trim() || c.text.trim() || c.boxes.length);

/** True when "Generate text" has something to write for this box. */
export const wantsDraft = (x) =>
  !hasDraft(x) &&
  x.treatment !== "verbatim" &&
  Boolean(x.text.trim() || (x.boxes || []).some((b) => !(b.title.trim() && b.text.trim())));

const BULLET_RE = /^\s*[-*\u2022\u2013]\s+/;
const MARKER_RE = /^\s*\[(ACTION|INFO)\]\s*/i;

/** Mirror of text_to_blocks in backend/app/generate.py, for the preview. */
export function textToBlocks(text) {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) blocks.push({ kind: "bullets", items: bullets });
    bullets = [];
  };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const m = line.match(MARKER_RE);
    if (m) {
      flush();
      const kind = m[1].toUpperCase() === "ACTION" ? "action_box" : "info_box";
      const body = line.replace(MARKER_RE, "").trim();
      const cut = body.indexOf(":");
      const rest = cut >= 0 ? body.slice(cut + 1).trim() : "";
      blocks.push(
        rest
          ? { kind, title: body.slice(0, cut).trim(), text: rest }
          : { kind, title: kind === "action_box" ? "Action required" : "Good to know", text: body }
      );
      continue;
    }
    if (BULLET_RE.test(line)) {
      bullets.push(line.replace(BULLET_RE, "").trim());
      continue;
    }
    flush();
    blocks.push({ kind: "body", text: line.trim() });
  }
  flush();
  return blocks;
}

/**
 * A chapter's generated text split for in-place editing: runs of ordinary text
 * and the highlight boxes between them. segmentsToText reverses it exactly, so
 * the draft stays one string (what is saved, revised and sent).
 */
export function draftSegments(text) {
  const segs = [];
  let run = [];
  const flush = () => {
    if (run.length) segs.push({ kind: "text", text: run.join("\n") });
    run = [];
  };
  for (const line of String(text || "").split("\n")) {
    const m = line.match(MARKER_RE);
    if (!m) {
      run.push(line);
      continue;
    }
    flush();
    const body = line.replace(MARKER_RE, "").trim();
    const cut = body.indexOf(":");
    segs.push({
      kind: m[1].toUpperCase() === "ACTION" ? "action_box" : "info_box",
      title: cut >= 0 ? body.slice(0, cut).trim() : "",
      text: cut >= 0 ? body.slice(cut + 1).trim() : body,
    });
  }
  flush();
  return segs;
}

export function segmentsToText(segs) {
  return segs
    .map((g) =>
      g.kind === "text"
        ? g.text
        : // A box is one line in the draft, so line breaks typed in it become spaces.
          `[${g.kind === "action_box" ? "ACTION" : "INFO"}] ${g.title.replace(/:/g, " -")}: ${g.text.replace(/\s*\n\s*/g, " ")}`
    )
    .join("\n");
}

/** Generated blocks back to the editable text form textToBlocks reads. */
export function blocksToText(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (b.kind === "bullets") {
      if (out.length) out.push("");
      out.push(...b.items.map((t) => "- " + t));
      out.push("");
    } else if (b.kind === "body") out.push(b.text);
    else out.push(`[${b.kind === "action_box" ? "ACTION" : "INFO"}] ${b.title}: ${b.text}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Boxes that still need text written, in the layout that is active. */
export function pendingDrafts(s) {
  return s.layout === "one_pager"
    ? [...s.cards.filter(cardFilled), ...s.news.filter(newsFilled)].filter(wantsDraft)
    : s.chapters.filter(chapterUsed).filter(wantsDraft);
}

/**
 * Store a /api/draft response on the boxes it was written for. The response
 * lists the used boxes in the order toPayload sent them, so they are matched
 * by position. Boxes that already had a draft keep it.
 */
export function applyDrafts(s, res) {
  const put = (items, used, rendered, toText) => {
    let k = 0;
    return items.map((x) => {
      if (!used(x)) return x;
      const r = rendered[k++];
      if (!r || !wantsDraft(x)) return x;
      return { ...x, draft: toText(r), draftFrom: x.text };
    });
  };
  if (s.layout === "one_pager")
    return {
      ...s,
      cards: put(s.cards, cardFilled, res.cards || [], (r) => blocksToText(r.blocks)),
      news: put(s.news, newsFilled, res.news || [], (r) => r.lines.join("\n")),
    };
  return {
    ...s,
    chapters: put(s.chapters, chapterUsed, res.chapters || [], (r) => blocksToText(r.blocks)),
  };
}

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
    // A box with a draft sends the draft as finished text. For a chapter the
    // draft already carries its highlight boxes as [ACTION]/[INFO] lines.
    chapters: s.chapters.filter(chapterUsed).map((c) =>
      hasDraft(c)
        ? {
            heading: c.heading, icon: c.icon || "",
            treatment: "verbatim", text: c.draft, box_policy: "none", boxes: [],
          }
        : {
            heading: c.heading,
            icon: c.icon || "",
            treatment: c.treatment,
            text: c.text,
            box_policy: c.treatment === "verbatim" ? "none" : c.box_policy,
            boxes: c.boxes.map((b) => ({ type: b.type, title: b.title, text: b.text })),
          }
    ),
  };

  if (s.layout !== "one_pager") return { ...base, cards: [], news: [] };

  // Unused boxes are dropped here, not in the renderer: the remaining boxes
  // then receive their share of the page.
  return {
    ...base,
    chapters: [],
    cards: s.cards.filter(cardFilled).map((c) => ({
      icon: c.icon, title: c.title, subtitle: c.subtitle,
      text: hasDraft(c) ? c.draft : c.text,
      treatment: hasDraft(c) ? "verbatim" : c.treatment,
    })),
    news: s.news.filter(newsFilled).map((n) => ({
      icon: n.icon, label: n.label,
      text: hasDraft(n) ? n.draft : n.text,
      treatment: hasDraft(n) ? "verbatim" : n.treatment,
    })),
  };
}

/** A card's body as [text, isBullet] pairs: its generated text if any, else the notes. */
function cardParagraphs(c) {
  return textToBlocks(hasDraft(c) ? c.draft : c.text).flatMap((b) =>
    b.kind === "bullets"
      ? b.items.map((t) => [t, true])
      : b.kind === "body"
        ? [[b.text, false]]
        : [[b.title, false], [b.text, false]]
  );
}

/** The one text size, in points, used for every card and short-news row. */
export function onePagerSize(s) {
  const lines = (n) =>
    (hasDraft(n) ? n.draft : n.text).split("\n").map((l) => l.trim()).filter(Boolean);
  return fitSize(s.cards.filter(cardFilled).map(cardParagraphs), s.news.filter(newsFilled).map(lines));
}
