import { useEffect, useMemo, useState } from "react";
import Masthead from "./components/Masthead.jsx";
import StylePanel from "./components/StylePanel.jsx";
import Chapters from "./components/Chapters.jsx";
import OnePager from "./components/OnePager.jsx";
import Preview from "./components/Preview.jsx";
import { LAYOUTS, emptyState, toPayload } from "./model.js";
import { draft, getProviders, renderDocx } from "./api.js";

const DRAFT_KEY = "nlb:draft";

const PROVIDER_LABEL = {
  claude: "Claude",
  copilot: "Microsoft Copilot",
  manual: "No AI (my text only)",
};

export default function App() {
  const [state, setState] = useState(emptyState);
  const [drafted, setDrafted] = useState(null);
  const [providers, setProviders] = useState({ available: { manual: true }, default: "manual" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const patch = (p) => {
    setState((s) => ({ ...s, ...p }));
    setDrafted(null); // any edit invalidates the generated text
  };
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

  const onDraft = async () => {
    if (!hasContent)
      return notify(
        state.layout === "one_pager"
          ? "Fill at least one card or short-news row first."
          : "Add at least one chapter first."
      );
    setBusy("draft");
    try {
      setDrafted(await draft(payload));
      notify("Text generated. Review it, then create the document.");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };

  const onRender = async () => {
    setBusy("render");
    try {
      const source = drafted ?? (await draft(payload));
      setDrafted(source);
      const name = await renderDocx(source.masthead, source.chapters);
      notify(`Downloaded ${name}`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
      notify("Draft saved in this browser.");
    } catch {
      notify("This browser will not store the draft.");
    }
  };

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return notify("No saved draft found.");
      setState(JSON.parse(raw));
      setDrafted(null);
      notify("Draft loaded.");
    } catch {
      notify("The saved draft could not be read.");
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
          <button className="btn small" onClick={saveDraft}>Save draft</button>
          <button className="btn small" onClick={loadDraft}>Load draft</button>
          <button className="btn small" onClick={onDraft} disabled={Boolean(busy)}>
            {busy === "draft" ? "Writing\u2026" : "Generate text"}
          </button>
          <button className="btn primary small" onClick={onRender} disabled={Boolean(busy)}>
            {busy === "render" ? "Building\u2026" : "Create document"}
          </button>
        </div>
      </header>

      <div className="split">
        <div className="editor">
          {drafted && (
            <div className="note">
              Showing generated text. Editing any field clears it and you can generate again.
            </div>
          )}
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
            <OnePager state={state} patch={patch} />
          ) : (
            <Chapters chapters={state.chapters} patch={patch} notify={notify} />
          )}
          <fieldset>
            <legend>Payload sent to the backend</legend>
            <pre className="json">{JSON.stringify(payload, null, 2)}</pre>
          </fieldset>
        </div>

        <aside className="stage">
          <Preview state={state} drafted={drafted} />
        </aside>
      </div>

      <div className={"toast" + (msg ? " on" : "")}>{msg}</div>
    </>
  );
}
