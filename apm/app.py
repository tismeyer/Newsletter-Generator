"""
app.py
FastAPI service for Rosie for Editors:
  1. GET  /          — serves the stand-alone editor page (index.html)
  2. POST /generate  — notes → APM-compliant draft, checked against the ruleset
  3. GET  /health    — model and rule count, for the page header

Rosie works from the editor's notes and the APM ruleset only. It does not
store, search or quote manuals.

Environment variables (set in Railway):
  ANTHROPIC_API_KEY   — Claude API key

Optional:
  APM_MODEL           — defaults to claude-sonnet-4-6
"""

import os
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from anthropic import Anthropic

from prompt_builder import load_rules, build_system_prompt
from checker import run_checks, format_violations

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

MODEL          = os.environ.get("APM_MODEL", "claude-sonnet-4-6")
MAX_REVISIONS  = 2

RULES  = load_rules("APM_rules.json")
client = Anthropic()

app = FastAPI(title="helvetic APM content generator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── frontend ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def frontend():
    return HTMLResponse(content=Path("index.html").read_text(encoding="utf-8"))


# ── health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "ok":    True,
        "model": MODEL,
        "rules": len(RULES),
    }


# ── generate ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    notes:     str
    target:    str           = "html"
    structure: Optional[str] = None
    tone:      Optional[str] = None
    audience:  Optional[str] = None
    length:    Optional[str] = None


class GenerateResponse(BaseModel):
    draft:      str
    violations: List[dict]
    iterations: int


def _call(system: str, messages: List[dict]) -> str:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=messages,
    )
    return "".join(b.text for b in msg.content if b.type == "text").strip()


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    # ── 1. Build system prompt ────────────────────────────────────────────
    system = build_system_prompt(
        RULES,
        target    = req.target,
        structure = req.structure,
        tone      = req.tone,
        audience  = req.audience,
        length    = req.length,
    )

    # ── 2. Generate ───────────────────────────────────────────────────────
    messages   = [{"role": "user", "content": f"Editor's notes:\n{req.notes}"}]
    draft      = _call(system, messages)
    violations = run_checks(draft, RULES)
    iterations = 0

    # ── 3. Auto-revise on hard errors ────────────────────────────────────
    while iterations < MAX_REVISIONS:
        hard = [v for v in violations if v.get("severity") == "error"]
        if not hard:
            break
        messages.append({"role": "assistant", "content": draft})
        messages.append({
            "role":    "user",
            "content": (
                "The draft violates these house-style rules. "
                "Fix only these issues and return the full corrected content "
                "with no commentary:\n" + format_violations(hard)
            ),
        })
        draft      = _call(system, messages)
        violations = run_checks(draft, RULES)
        iterations += 1

    return GenerateResponse(
        draft      = draft,
        violations = violations,
        iterations = iterations,
    )
