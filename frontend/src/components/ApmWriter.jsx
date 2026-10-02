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
const LENGTH = [
  { v: "concise", label: "Concise" },
  { v: "standard", label: "Standard" },
  { v: "comprehensive", label: "Comprehensive" },
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

const SEVERITY = { error: "Error", warning: "Warning", info: "Note" };

// ---------- writing ----------

function Writer({ notify }) {
  const [notes, setNotes] = useState("");
  const [opts, setOpts] = useState({
    structure: "mixed",
    tone: "balanced",
    audience: "flight_crew",
    length: "standard",
    target: "html",
  });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // {draft, violations, iterations, target}
  const [copied, setCopied] = useState(false);
  const set = (k) => (v) => setOpts((o) => ({ ...o, [k]: v }));

  const generate = async () => {
    if (!notes.trim() || busy) return;
    setBusy(true);
    try {
      const r = await postJSON("/generate", { notes: notes.trim(), ...opts });
      setRes({ ...r, target: opts.target });
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(res.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Copying failed. Select the text and copy it by hand.");
    }
  };

  const html = useMemo(() => (res && res.target === "html" ? clean(res.draft) : ""), [res]);
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
              "Rosie never invents facts. Anything missing is marked [TO CONFIRM] for you to fill in."
            }
          />
        </fieldset>

        <fieldset>
          <legend>Writing style</legend>
          <div className="grid g2">
            <Segmented label="Structure" options={STRUCTURE} value={opts.structure} onChange={set("structure")} />
            <Segmented label="Tone" options={TONE} value={opts.tone} onChange={set("tone")} />
            <Segmented label="Length" options={LENGTH} value={opts.length} onChange={set("length")} />
            <Segmented label="Output" options={TARGET} value={opts.target} onChange={set("target")} />
          </div>
          <div className="mt10">
            <Segmented label="Audience" options={AUDIENCE} value={opts.audience} onChange={set("audience")} />
          </div>
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
            <div className="apm-paper">
              <div className="apm-paperbar">
                <span className="apm-label">Draft</span>
                <span className="spacer" />
                <button className="btn small" onClick={copy}>
                  {copied ? "Copied" : res.target === "html" ? "Copy HTML" : "Copy text"}
                </button>
              </div>
              {res.target === "html" ? (
                <div className="apm-draft" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <pre className="apm-draft plain">{res.draft}</pre>
              )}
            </div>

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
