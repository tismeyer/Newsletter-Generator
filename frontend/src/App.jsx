import { useEffect, useMemo, useState } from "react";
import Masthead from "./components/Masthead.jsx";
import StylePanel from "./components/StylePanel.jsx";
import Chapters from "./components/Chapters.jsx";
import OnePager from "./components/OnePager.jsx";
import Preview from "./components/Preview.jsx";
import Drafts from "./components/Drafts.jsx";
import ImportWord, { ImportBanner } from "./components/ImportWord.jsx";
import { LAYOUTS, applyDrafts, emptyState, pendingDrafts, toPayload } from "./model.js";
import { draft, getProviders, renderDocument } from "./api.js";

const PROVIDER_LABEL = {
  claude: "Claude",
  copilot: "Microsoft Copilot",
  manual: "No AI (my text only)",
};

export default function App() {
  const [state, setState] = useState(emptyState);
  const [providers, setProviders] = useState({ available: { manual: true }, default: "manual" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // Generated text lives on each box (see model.js), so edits elsewhere no
  // longer throw it away.
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const notify = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2600);
  };

  useEffect(() => {
    getProviders()
      .then((p) => {
        setProviders(p);
        setState((s) => ({ ...s, provider: p.default }));
      })
      .catch(() => notify("Server not reachable. Text generation is unavailable."));
  }, []);

  const payload = useMemo(() => toPayload(state), [state]);

  const hasContent =
    state.layout === "one_pager"
      ? payload.cards.length || payload.news.length
      : payload.chapters.length;

  // Writes text for every box that has none yet. Boxes that already have
  // text are left alone, so revisions and hand edits survive.
  const generate = async (s) => applyDrafts(s, await draft(toPayload(s)));

  const onDraft = async () => {
    if (!hasContent)
      return notify(
        state.layout === "one_pager"
          ? "Fill at least one card or short-news row first."
          : "Add at least one chapter first."
      );
    if (!pendingDrafts(state).length)
      return notify("Every box already has text. Use \u201cBack to my notes\u201d on a box to write it again.");
    setBusy("draft");
    try {
      setState(await generate(state));
      notify("Text written. Edit it in place, or ask for changes box by box.");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };

  const onRender = async () => {
    if (!hasContent)
      return notify(
        state.layout === "one_pager"
          ? "Fill at least one card or short-news row first."
          : "Add at least one chapter first."
      );
    setBusy("render");
    try {
      let s = state;
      if (pendingDrafts(s).length) {
        s = await generate(s);
        setState(s);
      }
      const name = await renderDocument(toPayload(s));
      notify(`Downloaded ${name}`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };

  const usable = Object.entries(providers.available).filter(([, ok]) => ok);

  return (
    <>
      <header className="appbar">
        <h1>Newsletter Builder</h1>
        <span className="sub">Helvetic Airways &mdash; internal publications</span>
        <span className="spacer" />
        <div className="tools">
          <select
            value={state.provider}
            onChange={(e) => patch({ provider: e.target.value })}
            aria-label="Text generator"
          >
            {usable.map(([k]) => (
              <option key={k} value={k}>
                {PROVIDER_LABEL[k] || k}
              </option>
            ))}
          </select>
          <ImportWord state={state} load={setState} notify={notify} busy={busy} setBusy={setBusy} />
          <Drafts state={state} load={setState} notify={notify} />
          <button className="btn go small" onClick={onDraft} disabled={Boolean(busy)}>
            {busy === "draft" ? "Writing\u2026" : "Generate text"}
          </button>
          <button className="btn primary small" onClick={onRender} disabled={Boolean(busy)}>
            {busy === "render" ? "Building\u2026" : "Create document"}
          </button>
        </div>
      </header>

      <div className="split">
        <div className="editor">
          <ImportBanner state={state} patch={patch} />
          <fieldset>
            <legend>Layout</legend>
            <div className="seg" role="group" aria-label="Layout">
              {LAYOUTS.map((l) => (
                <button
                  key={l.v}
                  type="button"
                  aria-pressed={state.layout === l.v}
                  onClick={() => patch({ layout: l.v })}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <span className="hint">
              {LAYOUTS.find((l) => l.v === state.layout)?.hint}
            </span>
          </fieldset>

          <Masthead state={state} patch={patch} />
          <StylePanel style={state.style} patch={patch} />
          {state.layout === "one_pager" ? (
            <OnePager state={state} patch={patch} notify={notify} />
          ) : (
            <Chapters
              chapters={state.chapters}
              patch={patch}
              notify={notify}
              style={state.style}
              provider={state.provider}
            />
          )}
          <fieldset>
            <legend>Payload sent to the backend</legend>
            <pre className="json">{JSON.stringify(payload, null, 2)}</pre>
          </fieldset>
        </div>

        <aside className="stage">
          <Preview state={state} />
        </aside>
      </div>

      <div className={"toast" + (msg ? " on" : "")}>{msg}</div>
    </>
  );
}
