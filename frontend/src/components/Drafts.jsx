import { useRef, useState } from "react";
import { useDismiss } from "./Bits.jsx";
import { emptyState } from "../model.js";

// Named drafts live in this browser only. A draft file carries the same thing
// out of the browser: to another computer, or to a colleague by email.
const STORE_KEY = "nlb:drafts";
const OLD_KEY = "nlb:draft"; // the single slot used before named drafts
const FILE_APP = "newsletter-builder";
const FILE_VERSION = 1;

function readStore() {
  let drafts = {};
  try {
    drafts = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      drafts["Earlier draft"] ??= { savedAt: null, state: JSON.parse(old) };
      localStorage.setItem(STORE_KEY, JSON.stringify(drafts));
      localStorage.removeItem(OLD_KEY);
    }
  } catch {
    /* unreadable or blocked storage: behave as empty */
  }
  return drafts;
}

function writeStore(drafts) {
  localStorage.setItem(STORE_KEY, JSON.stringify(drafts));
}

/** A draft from storage or a file, filled up with anything newer versions added. */
const restore = (state) => ({ ...emptyState(), ...state });

const suggestName = (s) =>
  [s.masthead.header_kicker, s.masthead.doc_issue].filter(Boolean).join(" ").trim() || "Draft";

const fileName = (name) =>
  (name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "draft") + ".newsletter.json";

const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function Drafts({ state, load, notify }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [name, setName] = useState("");
  const ref = useDismiss(open, setOpen);
  const fileRef = useRef(null);

  const toggle = () => {
    if (!open) {
      setDrafts(readStore());
      setName(suggestName(state));
    }
    setOpen((o) => !o);
  };

  const save = () => {
    const key = name.trim();
    if (!key) return notify("Give the draft a name first.");
    const next = { ...readStore(), [key]: { savedAt: new Date().toISOString(), state } };
    try {
      writeStore(next);
      setDrafts(next);
      notify(`Saved “${key}” in this browser.`);
    } catch {
      notify("This browser will not store drafts. Download a draft file instead.");
    }
  };

  const loadOne = (key) => {
    load(restore(drafts[key].state));
    setOpen(false);
    notify(`Loaded “${key}”.`);
  };

  const remove = (key) => {
    if (!window.confirm(`Delete the draft “${key}” from this browser?`)) return;
    const next = { ...readStore() };
    delete next[key];
    try {
      writeStore(next);
    } catch {
      /* nothing more to do */
    }
    setDrafts(next);
  };

  const download = () => {
    const key = name.trim() || suggestName(state);
    const body = JSON.stringify(
      { app: FILE_APP, version: FILE_VERSION, name: key, savedAt: new Date().toISOString(), state },
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(key);
    a.click();
    URL.revokeObjectURL(url);
    notify(`Downloaded ${fileName(key)}`);
  };

  const openFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow opening the same file again
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== FILE_APP || !data.state?.masthead) throw new Error();
      load(restore(data.state));
      setOpen(false);
      notify(`Opened “${data.name || file.name}”.`);
    } catch {
      notify("That file is not a newsletter draft.");
    }
  };

  const keys = Object.keys(drafts).sort(
    (a, b) => (drafts[b].savedAt || "").localeCompare(drafts[a].savedAt || "")
  );

  return (
    <span className="drafts" ref={ref}>
      <button type="button" className="btn small" aria-expanded={open} onClick={toggle}>
        Drafts
      </button>
      {open && (
        <div className="draftsmenu">
          <div className="dm-title">Save in this browser</div>
          <div className="dm-row">
            <input
              type="text"
              value={name}
              aria-label="Draft name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button type="button" className="btn small" onClick={save}>
              {drafts[name.trim()] ? "Replace" : "Save"}
            </button>
          </div>

          <div className="dm-title">Saved in this browser</div>
          {keys.length ? (
            <ul className="dm-list">
              {keys.map((k) => (
                <li key={k}>
                  <button type="button" className="dm-load" onClick={() => loadOne(k)}>
                    <span className="dm-name">{k}</span>
                    <span className="dm-when">{when(drafts[k].savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="ed-x"
                    title="Delete this draft"
                    aria-label={`Delete ${k}`}
                    onClick={() => remove(k)}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dm-empty">Nothing saved yet.</p>
          )}

          <div className="dm-title">Draft file</div>
          <div className="dm-row">
            <button type="button" className="btn small" onClick={download}>
              Download draft file
            </button>
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
              Open draft file&hellip;
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={openFile}
            />
          </div>
          <p className="dm-empty">
            A file can be emailed to a colleague or opened on another computer. Drafts saved
            in this browser stay on this computer only.
          </p>
        </div>
      )}
    </span>
  );
}
