import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "./Bits.jsx";
import rosie from "../assets/rosie-apm.webp";

/*
 * Rosie for Editors: notes in, APM-conformant manual text out.
 *
 * Rosie runs as its own server (the apm/ folder of this repo) with the APM
 * ruleset. She works from the editor's notes only: no manuals are stored or
 * searched. This page only talks to that server. VITE_APM_API_BASE
 * names that server; it defaults to the Railway service Rosie already runs on.
 */
const BASE = (import.meta.env.VITE_APM_API_BASE || "https://web-production-7fe7be.up.railway.app")
  .trim()
  .replace(/\/+$/, "");

async function call(path, opts) {
  let r;
  try {
    r = await fetch(BASE + path, opts);
  } catch {
    throw new Error("Rosie's server is not reachable.");
  }
  if (!r.ok) {
    let detail = `Rosie's server answered with an error (${r.status}).`;
    try {
      const j = await r.json();
      if (j.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* keep the status message */
    }
    throw new Error(detail);
  }
  return r.json();
}

const postJSON = (path, body) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const STRUCTURE = [
  { v: "prose", label: "Prose" },
  { v: "mixed", label: "Mixed" },
  { v: "bullets", label: "Bullet-heavy" },
];
const TONE = [
  { v: "procedural", label: "Procedural" },
  { v: "balanced", label: "Balanced" },
  { v: "descriptive", label: "Descriptive" },
];
const AUDIENCE = [
  { v: "flight_crew", label: "Flight crew" },
  { v: "mixed_crew", label: "Mixed crew" },
  { v: "cabin_crew", label: "Cabin crew" },
  { v: "ground_staff", label: "Ground staff" },
];
// One WebManuals page holds about this much running text and does not break
// by itself (measured by S&P on a text-only page). Mirrors PAGE_CHARS in apm/pages.py.
const PAGE_CHARS = 3000;
const LEN_MIN = 300;
const LEN_MAX = 9000;

const pagesLabel = (n) => {
  const p = n / PAGE_CHARS;
  if (p < 0.2) return "a short paragraph or two";
  if (p < 0.4) return "about a quarter of a page";
  if (p < 0.65) return "about half a page";
  if (p < 0.9) return "about three quarters of a page";
  if (p <= 1.05) return "about one page";
  return `about ${Math.round(p * 2) / 2} pages`.replace(".5", "\u00bd");
};

function LengthSlider({ value, onChange, fit, onFit }) {
  return (
    <div className="apm-length">
      <div className="apm-lenhead">
        <span className="hint block">Length</span>
        <span className="apm-lenval">
          <b>{value.toLocaleString("de-CH")}</b> characters &middot; {pagesLabel(value)}
        </span>
      </div>
      <input
        type="range"
        id="apm-length"
        min={LEN_MIN}
        max={LEN_MAX}
        step={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Length in characters"
        list="apm-length-marks"
      />
      <datalist id="apm-length-marks">
        <option value={PAGE_CHARS} />
        <option value={PAGE_CHARS * 2} />
      </datalist>
      <div className="apm-lenscale" aria-hidden="true">
        <span>Short</span>
        <span style={{ left: `${((PAGE_CHARS - LEN_MIN) / (LEN_MAX - LEN_MIN)) * 100}%` }}>1 page</span>
        <span style={{ left: `${((PAGE_CHARS * 2 - LEN_MIN) / (LEN_MAX - LEN_MIN)) * 100}%` }}>2 pages</span>
        <span>3 pages</span>
      </div>
      <label className="apm-fit">
        <input type="checkbox" id="apm-fit" checked={fit} onChange={(e) => onFit(e.target.checked)} />
        <span>
          <b>Fit to WebManuals pages</b>
          <span className="hint block">
            WebManuals does not break pages and cuts off what runs over. Rosie keeps the
            text within {Math.max(1, Math.ceil(value / PAGE_CHARS))} page
            {Math.ceil(value / PAGE_CHARS) > 1 ? "s and shows where each page ends" : ""}, and
            tightens it if it runs over.
          </span>
        </span>
      </label>
    </div>
  );
}

const SOURCES = [
  { v: "notes", label: "Notes only" },
  { v: "general", label: "Notes + general knowledge" },
];
const TARGET = [
  { v: "html", label: "HTML for WebManuals" },
  { v: "text", label: "Plain text" },
];

/** Generated HTML is shown as it will look; scripts and handlers never run. */
function clean(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta,form").forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.startsWith("on") || ((a.name === "href" || a.name === "src") && v.startsWith("javascript:")))
        el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

const isBlank = (n) => n && n.nodeType === 3 && !n.textContent.replace(/[\s\u00a0]/g, "");

/**
 * The draft as WebManuals keeps it on paste (tested by the S&P team on
 * 2 October 2026): a blank line inside a bullet must be two line breaks, since
 * WebManuals drops "<br />&nbsp;"; and a Note, Caution or Warning needs an
 * empty paragraph before it. The HTML code copy stays as Rosie wrote it.
 */
function forPaste(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("li").forEach((li) => {
    // "<br />&nbsp;" at the end of the bullet's own text (before any sub-list)
    const kids = [...li.childNodes];
    const end = kids.findIndex((n) => n.nodeName === "UL" || n.nodeName === "OL");
    const own = end < 0 ? kids : kids.slice(0, end);
    let i = own.length - 1;
    while (i >= 0 && own[i].nodeType === 3 && !own[i].textContent.trim() && !own[i].textContent.includes("\u00a0")) i--;
    if (i >= 1 && isBlank(own[i]) && own[i - 1].nodeName === "BR") own[i].replaceWith(doc.createElement("br"));
  });
  doc.querySelectorAll("table").forEach((t) => {
    let prev = t.previousSibling;
    while (isBlank(prev)) prev = prev.previousSibling;
    const empty = prev && prev.nodeName === "P" && !prev.textContent.replace(/[\s\u00a0]/g, "");
    if (prev && !empty) {
      const p = doc.createElement("p");
      p.innerHTML = "&nbsp;";
      t.before(p);
    }
  });
  return doc.body.innerHTML;
}

/** Plain-text fallback for the clipboard: block elements become new lines. */
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("li").forEach((li) => li.prepend("\u2022 "));
  doc.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,tr,br").forEach((el) => el.append("\n"));
  return doc.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

/** For browsers without the async clipboard: copy HTML through a copy event. */
function legacyCopy(html) {
  const on = (e) => {
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", htmlToText(html));
    e.preventDefault();
  };
  document.addEventListener("copy", on);
  try {
    if (!document.execCommand("copy")) throw new Error("copy refused");
  } finally {
    document.removeEventListener("copy", on);
  }
}

/** How full a WebManuals page is. */
function Fill({ value }) {
  const pct = Math.round(value * 100);
  return (
    <span className={"apm-fill" + (pct > 100 ? " over" : pct > 92 ? " near" : "")} title="Share of a WebManuals page">
      <span className="apm-fillbar">
        <i style={{ width: Math.min(100, pct) + "%" }} />
      </span>
      {pct}% of a page
    </span>
  );
}

const SEVERITY = { error: "Error", warning: "Warning", info: "Note" };

// ---------- writing ----------

function Writer({ notify }) {
  const [notes, setNotes] = useState("");
  const [opts, setOpts] = useState({
    structure: "mixed",
    tone: "balanced",
    audience: "flight_crew",
    target_chars: 1500,
    fit_pages: true,
    target: "html",
    sources: "notes",
  });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // {draft, violations, iterations, target}
  const [copied, setCopied] = useState("");
  const [ask, setAsk] = useState("");
  const [prev, setPrev] = useState(null); // the draft before the last revision, for undo
  const set = (k) => (v) => setOpts((o) => ({ ...o, [k]: v }));

  const generate = async () => {
    if (!notes.trim() || busy) return;
    setBusy(true);
    try {
      const r = await postJSON("/generate", { notes: notes.trim(), ...opts });
      setRes({ ...r, target: opts.target, sources: opts.sources });
      setPrev(null);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Ask Rosie for changes to the draft on screen. Her checks and the page fit
  // run again on the revised text.
  const revise = async () => {
    if (!ask.trim() || busy || !res) return;
    setBusy(true);
    try {
      const r = await postJSON("/generate", {
        notes: notes.trim() || "(no notes)",
        ...opts,
        target: res.target,
        sources: res.sources,
        current: res.draft,
        instruction: ask.trim(),
      });
      setPrev(res);
      setRes({ ...r, target: res.target, sources: res.sources });
      setAsk("");
      notify("Text revised.");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const done = (what) => {
    setCopied(what);
    setTimeout(() => setCopied(""), 2000);
  };

  // Formatted copy for pasting into WebManuals: only the draft's own HTML goes
  // to the clipboard, never the fonts and sizes this page displays it with.
  const copyFormatted = async (page) => {
    const src = page == null ? html : pageHtml[page];
    try {
      if (res.target !== "html") await navigator.clipboard.writeText(res.draft);
      else if (window.ClipboardItem && navigator.clipboard.write)
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([forPaste(src)], { type: "text/html" }),
            "text/plain": new Blob([htmlToText(src)], { type: "text/plain" }),
          }),
        ]);
      else legacyCopy(forPaste(src));
      done(page == null ? "formatted" : "formatted" + page);
    } catch {
      notify("Copying failed. Select the text and copy it by hand.");
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(res.draft);
      done("code");
    } catch {
      notify("Copying failed. Select the text and copy it by hand.");
    }
  };

  // Selecting text in the draft and pressing Ctrl+C gets the same clean HTML.
  const onCopySelection = (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const box = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
    e.clipboardData.setData("text/html", forPaste(box.innerHTML));
    e.clipboardData.setData("text/plain", sel.toString());
    e.preventDefault();
  };

  const html = useMemo(() => (res && res.target === "html" ? clean(res.draft) : ""), [res]);
  const pages = (res && res.target === "html" && res.pages) || [];
  const pageHtml = useMemo(() => pages.map((p) => clean(p.html)), [res]);
  const v = res?.violations || [];
  const count = (s) => v.filter((x) => x.severity === s).length;

  return (
    <div className="split">
      <div className="editor">
        <fieldset>
          <legend>
            Your notes <span className="soft">{notes.trim().length} characters</span>
          </legend>
          <textarea
            className="apm-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && generate()}
            aria-label="Your notes"
            placeholder={
              "Rough notes: bullet points, fragments, references to other sections.\n\n" +
              (opts.sources === "general"
                ? "Rosie may add general aviation background to your notes, never procedures. Everything she adds is listed for you to check."
                : "Rosie never invents facts. Anything missing is marked [TO CONFIRM] for you to fill in.")
            }
          />
        </fieldset>

        <fieldset>
          <legend>Content</legend>
          <Segmented options={SOURCES} value={opts.sources} onChange={set("sources")} label="What may Rosie use?" />
          <p className="hint apm-srchint">
            {opts.sources === "general"
              ? "For explanatory or descriptive chapters only. Rosie adds well-established background (how and why things work), never procedures, limits or helvetic-specific facts. What she adds is listed below the draft for you to check."
              : "Rosie writes from your notes alone and invents nothing. Use this for procedures and anything helvetic-specific."}
          </p>
        </fieldset>

        <fieldset>
          <legend>Writing style</legend>
          <div className="grid g2">
            <Segmented label="Structure" options={STRUCTURE} value={opts.structure} onChange={set("structure")} />
            <Segmented label="Tone" options={TONE} value={opts.tone} onChange={set("tone")} />
            <Segmented label="Audience" options={AUDIENCE} value={opts.audience} onChange={set("audience")} />
            <Segmented label="Output" options={TARGET} value={opts.target} onChange={set("target")} />
          </div>
          <LengthSlider
            value={opts.target_chars}
            onChange={set("target_chars")}
            fit={opts.fit_pages}
            onFit={set("fit_pages")}
          />
        </fieldset>

        <div className="apm-go">
          <button className="btn go" onClick={generate} disabled={busy || !notes.trim()}>
            {busy ? "Rosie is writing…" : "Generate text"}
          </button>
          <span className="hint">Ctrl+Enter also works. Writing and checking can take up to a minute.</span>
        </div>
      </div>

      <aside className="stage">
        {!res ? (
          <div className="apm-empty">
            <img src={rosie} alt="" />
            <p>
              Write your notes on the left and press <b>Generate text</b>. Rosie writes the
              manual text from your notes alone, checks it against the APM rules, and shows
              here what still needs your eye.
            </p>
          </div>
        ) : (
          <>
            {pages.length > 1 && (
              <div className="apm-pagenote">
                This text needs <b>{pages.length} WebManuals pages</b>. Paste each page
                separately with its own copy button.
              </div>
            )}
            <div className="apm-paper">
              <div className="apm-paperbar">
                <span className="apm-label">{pages.length > 1 ? `Page 1 of ${pages.length}` : "Draft"}</span>
                {pages[0] && <Fill value={pages[0].fill} />}
                <span className="spacer" />
                {res.target === "html" && (
                  <button
                    className="btn link"
                    onClick={copyCode}
                    title="The HTML source, for the WebManuals code view"
                  >
                    {copied === "code" ? "Copied" : "Copy HTML code"}
                  </button>
                )}
                <button
                  className="btn primary small"
                  onClick={() => copyFormatted(pages.length > 1 ? 0 : null)}
                  title="Paste straight into WebManuals; it takes WebManuals' own fonts"
                >
                  {copied === "formatted0" || (copied === "formatted" && pages.length < 2)
                    ? "Copied"
                    : res.target !== "html"
                      ? "Copy text"
                      : pages.length > 1
                        ? "Copy page 1"
                        : "Copy for WebManuals"}
                </button>
              </div>
              {res.target === "html" ? (
                <div
                  className="apm-draft"
                  onCopy={onCopySelection}
                  dangerouslySetInnerHTML={{ __html: pages.length > 1 ? pageHtml[0] : html }}
                />
              ) : (
                <pre className="apm-draft plain">{res.draft}</pre>
              )}
            </div>
            {pages.slice(1).map((pg, k) => (
              <div className="apm-paper" key={k + 1}>
                <div className="apm-paperbar">
                  <span className="apm-label">
                    Page {k + 2} of {pages.length}
                  </span>
                  <Fill value={pg.fill} />
                  <span className="spacer" />
                  <button className="btn primary small" onClick={() => copyFormatted(k + 1)}>
                    {copied === "formatted" + (k + 1) ? "Copied" : `Copy page ${k + 2}`}
                  </button>
                </div>
                <div
                  className="apm-draft"
                  onCopy={onCopySelection}
                  dangerouslySetInnerHTML={{ __html: pageHtml[k + 1] }}
                />
              </div>
            ))}

            <div className="apm-card apm-revise">
              <div className="apm-cardhead">
                <b>Ask Rosie for changes</b>
                <span className="spacer" />
                {prev && (
                  <button
                    type="button"
                    className="btn link"
                    disabled={busy}
                    onClick={() => {
                      setRes(prev);
                      setPrev(null);
                    }}
                  >
                    Undo last change
                  </button>
                )}
              </div>
              <div className="revise-row">
                <input
                  type="text"
                  value={ask}
                  disabled={busy}
                  placeholder="e.g. “shorter”, “add a Caution about tailwind”, “turn the second paragraph into bullets”"
                  aria-label="Ask Rosie for changes to this text"
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && revise()}
                />
                <button type="button" className="btn small" disabled={busy || !ask.trim()} onClick={revise}>
                  {busy ? "Revising…" : "Revise"}
                </button>
              </div>
              <span className="hint">
                Rosie changes only what you ask, then checks the style rules
                {opts.fit_pages && res.target === "html" ? " and the page fit" : ""} again.
              </span>
            </div>

            {res.sources === "general" && (
              <div className="apm-card apm-added">
                <div className="apm-cardhead">
                  <b>Added from general knowledge</b>
                  <span className="apm-badge warning">please check</span>
                </div>
                {res.added && res.added.length ? (
                  <ul>
                    {res.added.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="apm-clear">Rosie reports that she added nothing beyond your notes.</p>
                )}
              </div>
            )}

            <div className="apm-card">
              <div className="apm-cardhead">
                <b>Style check</b>
                {v.length === 0 ? (
                  <span className="apm-badge clear">All clear</span>
                ) : (
                  ["error", "warning", "info"].map(
                    (s) =>
                      count(s) > 0 && (
                        <span key={s} className={"apm-badge " + s}>
                          {count(s)} {SEVERITY[s].toLowerCase()}
                          {count(s) > 1 ? "s" : ""}
                        </span>
                      )
                  )
                )}
                <span className="spacer" />
                {res.iterations > 0 && (
                  <span className="hint">
                    Rosie corrected her own draft {res.iterations === 1 ? "once" : "twice"}
                  </span>
                )}
              </div>
              {v.length === 0 ? (
                <p className="apm-clear">No style rule is broken. Ready for your review.</p>
              ) : (
                <ul className="apm-viol">
                  {v.map((x, i) => (
                    <li key={i} className={x.severity}>
                      <span className={"apm-sev " + x.severity}>{SEVERITY[x.severity] || x.severity}</span>
                      <div>
                        <div>{x.message}</div>
                        {x.context && (
                          <div className="apm-ctx">
                            &hellip;{x.context.replace(/<[^>]*>?/g, " ").replace(/\s+/g, " ").trim()}&hellip;
                          </div>
                        )}
                      </div>
                      <span className="apm-rule" title="APM rule">
                        {x.id}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </>
        )}
      </aside>
    </div>
  );
}

// ---------- page ----------

export default function ApmWriter() {
  const [health, setHealth] = useState("");
  const [msg, setMsg] = useState("");
  const timer = useRef(null);
  const notify = (t) => {
    setMsg(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 4000);
  };

  useEffect(() => {
    call("/health")
      .then((d) => setHealth(`${d.rules} APM rules`))
      .catch(() => setHealth("Rosie's server is offline"));
  }, []);

  return (
    <>
      <header className="appbar">
        <a className="homelink" href="#/" title="Back to the start page">
          &larr; All tools
        </a>
        <img src={rosie} alt="" className="apm-avatar" />
        <h1>Rosie for Editors</h1>
        <span className="sub">APM-conformant manual content</span>
        <span className="spacer" />
        <span className="sub">{health}</span>
      </header>
      <Writer notify={notify} />
      <div className={"toast" + (msg ? " on" : "")}>{msg}</div>
    </>
  );
}
