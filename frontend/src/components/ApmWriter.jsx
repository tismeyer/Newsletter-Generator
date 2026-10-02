import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "./Bits.jsx";
import rosie from "../assets/rosie.jpg";

/*
 * Rosie for Editors: notes in, APM-conformant manual text out.
 *
 * Rosie runs as its own server (the apm/ folder of this repo), with the manual
 * store and the APM ruleset. This page only talks to it. VITE_APM_API_BASE
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
  const [res, setRes] = useState(null); // {draft, violations, iterations, sources, target}
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
              manual text, checks it against the APM rules, and shows here what still needs
              your eye.
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

            {res.sources?.length > 0 && (
              <div className="apm-card">
                <div className="apm-cardhead">
                  <b>Manual passages used</b>
                  <span className="hint">{res.sources.length}</span>
                </div>
                <ul className="apm-sources">
                  {res.sources.map((s, i) => (
                    <li key={i}>
                      <div className="apm-cite">{s.citation}</div>
                      <div className="apm-snip">{(s.content || "").slice(0, 200)}&hellip;</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

// ---------- manuals ----------

const PART = 4 * 1024 * 1024; // the upload is sent in parts to stay under proxy limits

function Manuals({ notify }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ manual_name: "", revision: "", full_title: "", revision_date: "" });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null); // {pct, message, state}
  const fileRef = useRef(null);
  const busy = progress?.state === "busy";

  const load = () =>
    call("/manuals")
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch((e) => {
        setList([]);
        notify(e.message);
      });

  useEffect(() => {
    load();
  }, []);

  const poll = (job) =>
    new Promise((resolve, reject) => {
      const t = setInterval(async () => {
        try {
          const d = await call(`/ingest-status/${job}`);
          if (d.status === "not_found") {
            clearInterval(t);
            reject(new Error("The upload was lost on the server. Please try again."));
          } else if (d.status === "error") {
            clearInterval(t);
            reject(new Error(d.message || d.error || "Reading the manual failed."));
          } else if (d.status === "done") {
            clearInterval(t);
            resolve(d.result);
          } else {
            setProgress({
              pct: 30 + Math.round((d.progress || 0) * 0.7),
              message: d.message || "Processing…",
              state: "busy",
            });
          }
        } catch {
          /* a network blip: keep polling */
        }
      }, 1500);
    });

  const upload = async () => {
    if (!file || !form.manual_name.trim()) return notify("Choose a PDF and give the manual a name.");
    const id = Math.random().toString(36).slice(2, 10);
    const parts = Math.max(1, Math.ceil(file.size / PART));
    const mb = (file.size / 1024 / 1024).toFixed(1);
    try {
      for (let i = 0; i < parts; i++) {
        setProgress({
          pct: Math.round(2 + (i / parts) * 28),
          message: `Uploading ${mb} MB (part ${i + 1} of ${parts})`,
          state: "busy",
        });
        const fd = new FormData();
        fd.append("file", new File([file.slice(i * PART, (i + 1) * PART)], file.name));
        fd.append("upload_id", id);
        fd.append("chunk_index", i);
        fd.append("total_chunks", parts);
        fd.append("filename", file.name);
        await call("/upload-chunk", { method: "POST", body: fd });
      }
      setProgress({ pct: 30, message: "Uploaded. Reading the manual…", state: "busy" });
      const fd = new FormData();
      for (const [k, val] of Object.entries(form)) fd.append(k, val.trim());
      fd.append("upload_id", id);
      const start = await call("/ingest-assembled", { method: "POST", body: fd });
      if (start.error) throw new Error(start.error);
      const r = await poll(start.job_id);
      setProgress({
        pct: 100,
        message: `${r?.manual_name || form.manual_name} is in: ${r?.chunks ?? "?"} passages stored.`,
        state: "ok",
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      setProgress({ pct: 0, message: e.message, state: "error" });
    }
  };

  const remove = async (m) => {
    const label = m.manual_name + (m.revision ? " rev " + m.revision : "");
    if (!window.confirm(`Delete ${label}?\nRosie will no longer know its content. This cannot be undone.`)) return;
    try {
      const d = await postJSON("/delete-manual", { manual_name: m.manual_name, revision: m.revision || null });
      if (d.error) throw new Error(d.error);
      notify(`Deleted ${label}.`);
      load();
    } catch (e) {
      notify("Delete failed: " + e.message);
    }
  };

  const f = (k, label, ph) => (
    <label className="f">
      <span>{label}</span>
      <input
        type="text"
        value={form[k]}
        placeholder={ph}
        onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))}
      />
    </label>
  );

  return (
    <div className="apm-manuals">
      <fieldset>
        <legend>Add a manual</legend>
        <p className="hint mb10">
          Rosie reads the PDF and stores it in passages, so her drafts match what the manuals
          already say. Uploading a new revision of a manual replaces that revision.
        </p>
        <div className="grid g2">
          {f("manual_name", "Manual", "e.g. OM-A")}
          {f("revision", "Revision", "e.g. 01/19")}
          {f("full_title", "Full title", "e.g. Operations Manual Part A")}
          {f("revision_date", "Revision date", "e.g. 06.01.2026")}
        </div>
        <div className="apm-uprow">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            aria-label="PDF file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn primary" onClick={upload} disabled={busy}>
            {busy ? "Working…" : "Upload and read"}
          </button>
        </div>
        {progress && (
          <div className={"apm-progress " + progress.state}>
            <div>{progress.message}</div>
            {progress.state === "busy" && (
              <div className="apm-bar">
                <div style={{ width: progress.pct + "%" }} />
              </div>
            )}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Manuals Rosie knows</legend>
        {list === null ? (
          <p className="hint">Loading&hellip;</p>
        ) : list.length === 0 ? (
          <p className="hint">No manuals yet, or Rosie's manual store is not connected.</p>
        ) : (
          <table className="apm-table">
            <thead>
              <tr>
                <th>Manual</th>
                <th>Full title</th>
                <th>Revision</th>
                <th>Rev. date</th>
                <th>Passages</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.manual_name + (m.revision || "")}>
                  <td>
                    <b>{m.manual_name}</b>
                  </td>
                  <td>{m.full_title || "—"}</td>
                  <td>{m.revision || "—"}</td>
                  <td>{m.revision_date || "—"}</td>
                  <td>{m.chunk_count}</td>
                  <td>{m.uploaded_at ? new Date(m.uploaded_at).toLocaleDateString("de-CH") : "—"}</td>
                  <td>
                    <button className="btn link" onClick={() => remove(m)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
    </div>
  );
}

// ---------- page ----------

export default function ApmWriter() {
  const [tab, setTab] = useState("write");
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
      .then((d) => setHealth(`${d.rules} APM rules${d.retrieval ? " · manuals connected" : ""}`))
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
        <div className="seg apm-tabs" role="group" aria-label="Section">
          <button type="button" aria-pressed={tab === "write"} onClick={() => setTab("write")}>
            Write
          </button>
          <button type="button" aria-pressed={tab === "manuals"} onClick={() => setTab("manuals")}>
            Manuals
          </button>
        </div>
      </header>
      {/* Both stay mounted so notes and drafts survive a look at the manuals. */}
      <div hidden={tab !== "write"} className="page-fill">
        <Writer notify={notify} />
      </div>
      <div hidden={tab !== "manuals"}>{tab === "manuals" && <Manuals notify={notify} />}</div>
      <div className={"toast" + (msg ? " on" : "")}>{msg}</div>
    </>
  );
}
