# Newsletter Builder

Produces Helvetic Airways department newsletters and bulletins as branded Word
documents. Editors supply facts; a language model supplies sentences; the Word
template supplies the design.

The design lives in `backend/app/assets/template.docx` and nowhere else. To
change how documents look, edit that file in Word — no code changes.

```
frontend/   React + Vite. The form, the live A4 preview, the download.
backend/    FastAPI. Prompts, providers, .docx rendering.
```

## Running locally

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api proxied to :8000
```

Without an API key the app still runs: the provider selector falls back to
**No AI**, which uses the editor's text exactly as typed.

## Layouts

Two designs share one header, footer and brand palette:

| layout | shape | template file |
|---|---|---|
| `standard` | chapters over as many pages as needed | `template.docx` |
| `one_pager` | up to 4 cards plus up to 3 short-news rows, one page | `template_onepager.docx` |

The one-page layout arranges itself around what is actually filled in:

* Cards sit two per row. An odd last card spans the full width instead of
  leaving a hole, so two or three cards fill the page as well as four.
* Empty cards and empty short-news rows are dropped before layout, and the
  space returns to the boxes that remain.
* Because fitting on one page is the point, every box has a character
  allowance computed in `app/budget.py` from how many boxes are in use. The
  form shows a live counter against it, and the limit is also stated in the
  prompt so generated text is written to fit. `GET /api/budget?cards=&news=`
  returns the current allowances; `frontend/src/budget.js` mirrors the
  calculation so the counter updates without a round trip. **If you change one,
  change the other.**

## How text is produced

Each chapter carries a `treatment` that decides what happens to what the editor
wrote:

| treatment  | what happens                                                   |
|------------|----------------------------------------------------------------|
| `verbatim` | used word for word; **never sent to a model**                  |
| `polish`   | spelling, grammar and punctuation corrected; wording untouched  |
| `draft`    | notes turned into finished prose in the house style             |

`verbatim` short-circuits before any network call, so text that must not change
cannot change — and it costs nothing to generate.

Highlight boxes follow a three-level policy: a document default, a per-chapter
override, and a hard rule that `verbatim` chapters never receive generated
boxes.

## Providers

`backend/app/providers/` holds one class per generator behind a single
interface:

- `claude.py` — Anthropic Messages API. Works today.
- `copilot.py` — Microsoft Graph Copilot Chat API. Fill in the three
  `COPILOT_*` variables once the Entra app registration exists. The endpoint is
  in preview, so its request/response shapes are the part most likely to need
  updating; nothing outside this file depends on them.
- `manual.py` — no model at all.

Prompts live in `prompts.py`, above the interface, so every provider receives
identical instructions and output stays comparable when you switch.

`GET /api/providers` reports which are configured; the frontend only offers
those.

## API

| method | path            | purpose                                        |
|--------|-----------------|------------------------------------------------|
| GET    | `/api/health`   | liveness                                        |
| GET    | `/api/providers`| which generators are configured                 |
| GET    | `/api/budget`   | character allowances for the one-page layout    |
| POST   | `/api/draft`    | generate text, return it for review             |
| POST   | `/api/revise`   | amend one generated box as the editor asks      |
| POST   | `/api/render`   | build the `.docx` from reviewed text            |
| POST   | `/api/document` | draft and build in one call                     |

Splitting draft from render is deliberate: editors see the generated text before
it becomes a file, and corrections do not cost another generation.

Once generated, the text is kept on each box (chapter, card or short-news row) in
the browser. Editors can change it by hand, ask for changes to that one box
(`/api/revise`, which revises the current text including hand edits), or go back
to their notes. **Generate text** only writes boxes that have no text yet, and
**Create document** sends existing text as `verbatim`, so nothing an editor has
approved is rewritten. In chapters, generated highlight boxes appear in the text
as `[ACTION] Title: text` and `[INFO] Title: text` lines.

## Deploying

Two services from one repository. Each one only builds its own folder.

### Backend on Railway

1. New project -> Deploy from GitHub repo.
2. **Settings -> Source -> Root Directory: `/backend`.** Save, then redeploy.
   Without this the builder analyses the repository root, finds no application
   and fails with "could not determine how to build the app".
3. Variables: `ANTHROPIC_API_KEY`, `DEFAULT_PROVIDER=claude`, and
   `CORS_ORIGINS` once the frontend URL exists. `ANTHROPIC_MODEL` is optional
   and defaults to `claude-sonnet-5`; set it to `claude-opus-5` if you want
   higher quality per document, or pin a dated snapshot for stable output.
4. Settings -> Networking -> Generate Domain.

The start command comes from `backend/Procfile`. To override it, use
Settings -> Deploy -> Custom Start Command:
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Note on config files: a `railway.json` is always read from the **repository
root**, even when Root Directory is set to `/backend`. A build command written
there therefore runs with the wrong working directory and fails with
"Could not open requirements file: backend/requirements.txt". Use the Root
Directory setting plus `backend/Procfile` instead, and keep no `railway.json`
in the repository. (If Root Directory is genuinely unavailable on your plan, the
alternative is a root-level `railway.json` **and** a root `requirements.txt`
containing `-r backend/requirements.txt` - but then do not also set Root
Directory, or the two conflict.)

Optional: Settings -> Watch Paths -> `/backend/**` so frontend commits do not
rebuild the API.

### Frontend on Vercel

1. Import the same repository.
2. Root Directory: `frontend`. Framework preset: Vite.
3. Environment variable `VITE_API_BASE` = the Railway URL, scheme and host
   only: `https://your-api.up.railway.app`. No trailing slash and no `/api`
   suffix - the client appends `/api/...` itself, and both mistakes produce
   404s that look like a server fault. The value is compiled in at build time,
   so changing it requires a redeploy, not just a save.

Then go back to Railway and set `CORS_ORIGINS` to the Vercel URL. Each service
needs the other's address, so one of them gets configured twice.

## Changing the template

1. Open `backend/app/assets/template.docx` in Word.
2. Edit styles, header or footer. Keep the style **IDs** and the `{{KICKER}}`,
   `{{ISSUED_BY}}`, `{{REVISION}}`, `{{PUB_DATE}}` placeholders.
   `template.docx` uses `Body`, `Lead`, `Heading1`, `Heading2`, `CalloutTitle`,
   `Callout`, `DocTitle`, `DocHeadline`, `DocDate`.
   `template_onepager.docx` uses `CardTitle`, `CardSubtitle`, `CardSub`,
   `CardBody`, `NewsLabel`, `NewsBody` and the same three title styles.
   If you change type size or leading there, re-check the constants in
   `app/budget.py` - they are measured from the rendered page, not derived.
3. Save. The next generated document picks it up.

The renderer clears the template body and writes fresh content, so any sample
text left in the file is discarded — but the header, footer, page setup,
numbering and styles are kept.
