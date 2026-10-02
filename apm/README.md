# helvetic APM Content Generator (Rosie for Editors)

> **Moved here from `tismeyer/apmwriter` on 2 October 2026.** This folder is
> still its own server and its own Railway service. In Railway, point that
> service at this repository with **Root Directory** `/apm`; nothing else
> changes (same variables, same `railway.toml`).
>
> Editors now reach Rosie through the editorial tools website (`frontend/`,
> page `#/apm`), which calls this server. Its address is set in Vercel as
> `VITE_APM_API_BASE`; without it the site uses the current Railway URL.
> The page this server still serves at `/` keeps working as before.
>
> **No manuals.** Publishing whole or partial manuals in Rosie is not allowed
> for now, so the manual store (PDF upload, Supabase, Voyage search) was
> removed on 2 October 2026. Rosie works from the editor's notes and the 84
> APM rules only. `VOYAGE_API_KEY`, `SUPABASE_URL` and `SUPABASE_KEY` are no
> longer used.
>
> **Length and WebManuals pages.** The editor sets the length with a slider
> (`target_chars`). With "Fit to WebManuals pages" (`fit_pages`) Rosie plans
> for whole pages, tightens a draft that runs over (up to twice), and the
> response lists where each page ends (`pages`). A WebManuals page holds
> about 3000 characters of running text; the page model and its calibration
> live in `pages.py`.

Editors enter rough notes → the tool generates style-compliant manual content,
verified against all 84 rules from APM chapters 1 and 3.2.

---

## Files in this folder

| File | What it does |
|---|---|
| `index.html` | The editor-facing web interface |
| `app.py` | FastAPI backend — serves the UI and the `/generate` API |
| `prompt_builder.py` | Builds the AI system prompt from the ruleset |
| `checker.py` | Runs deterministic style checks on every draft |
| `APM_rules.json` | The ruleset — drives both the generator and the checker |
| `requirements.txt` | Python dependencies |
| `Procfile` | Tells Railway how to start the app |

---

## Step 1 — Create a GitHub repository

1. Go to **github.com** → click the **+** in the top right → **New repository**
2. Name it (e.g. `apm-generator`), set it to **Private**, click **Create repository**
3. On your computer, open a terminal in the folder containing these files and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/apm-generator.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.
The files are now on GitHub and Railway will pull from there.

---

## Step 2 — Deploy on Railway

1. Go to **railway.app** and sign in (use your GitHub account — easiest)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `apm-generator` repository
4. Railway detects Python automatically and starts deploying

That's it. No Docker, no config files, no build commands to set up.

---

## Step 3 — Add your Anthropic API key

1. In Railway, click on your service (the box that appeared after deploy)
2. Click the **Variables** tab
3. Click **New Variable** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...` (your key from console.anthropic.com)
4. Click **Add** — Railway restarts the app automatically

---

## Step 4 — Get your public URL

1. In Railway, click your service → **Settings** tab → **Networking**
2. Click **Generate Domain**
3. You get a URL like `https://apm-generator-production.up.railway.app`

Open that URL in a browser — the editor interface loads immediately.
Share this URL with your editors. No login system yet; add your SHA-256
password gate from the Style Checker if you want access control.

---

## Step 5 — Test it

Open your Railway URL and try this in the notes box:

```
fourth cabin crew member required on all flights with flight time over 4 hours.
reference ORO.MLR.100.
inform the Safety Manager (SM) and the Nominated Person Flight Operations.
```

Select **OM-A section** as document type, click **Generate**.
You should get a compliant paragraph with proper passive voice, correct
abbreviation handling, and a style-check panel at the bottom.

---

## Step 6 — Test it locally (optional, for development)

If you want to run it on your own machine before or instead of Railway:

```bash
# 1. Install Python 3.11+ if you don't have it (python.org)

# 2. Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Mac/Linux
# or: .venv\Scripts\activate     # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set your API key
export ANTHROPIC_API_KEY=sk-ant-...   # Mac/Linux
# or: set ANTHROPIC_API_KEY=sk-ant-...  # Windows

# 5. Start the server
uvicorn app:app --reload --port 8000

# 6. Open http://localhost:8000 in your browser
```

---

## How it works

1. Editor enters notes + selects document type → clicks Generate
2. The ruleset (`APM_rules.json`) is assembled into a system prompt
3. Claude drafts the content following all 81 rule fragments
4. The checker runs 29 deterministic checks (terms, forbidden words, grammar patterns)
5. Any hard errors are fed back to Claude for a second pass (up to 2 iterations)
6. The final draft + any remaining warnings appear in the interface
7. Editor reviews, clicks "Copy HTML", pastes into WebManuals

The editor always sees the original notes beside the draft so they can
verify nothing was invented. The AI is instructed to insert `[TO CONFIRM]`
for anything not present in the notes.

---

## Updating the ruleset

The ruleset lives in `APM_rules.json`. To add or change a rule:
1. Edit `APM_rules.json`
2. `git add APM_rules.json && git commit -m "Update rule X" && git push`
3. Railway redeploys automatically — both the generator and checker pick up the change

No code changes needed for most rule updates.

---

## Troubleshooting

**The page loads but "backend offline" shows in the header**
→ Check Railway logs; the API key variable may be missing or the deploy failed.

**Generation returns an error**
→ Check that `ANTHROPIC_API_KEY` is set correctly in Railway variables.

**Railway is slow on the first request**
→ Free-tier Railway services sleep after inactivity; the first request wakes them
  (~5 seconds). Upgrade to a paid instance to eliminate cold starts.
