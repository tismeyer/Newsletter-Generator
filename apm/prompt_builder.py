"""
prompt_builder.py
Assembles the generator system prompt from APM_rules.json.

The system prompt = a short preamble + style modifiers (structure, tone,
audience, length) + every rule's prompt_fragment grouped by category +
output instructions.
"""

import json
import math
from pathlib import Path

CATEGORY_ORDER = [
    "tone", "terminology", "capitalisation", "grammar", "units", "references",
    "bullets", "line_breaks", "headings", "tables", "notes", "colours",
    "cross_references", "emphasis", "process",
]

CATEGORY_TITLES = {
    "tone": "Tone and audience",
    "terminology": "Terminology and company names",
    "capitalisation": "Capitalisation",
    "grammar": "Grammar and word usage",
    "units": "Units",
    "references": "References",
    "bullets": "Bullet lists",
    "line_breaks": "Line breaks and spacing",
    "headings": "Headings and subtitles",
    "tables": "Tables",
    "notes": "Notes, cautions, warnings",
    "colours": "Colours",
    "cross_references": "Cross-references",
    "emphasis": "Emphasis and formatting",
    "process": "Process",
}

PREAMBLE = (
    "You are a documentation assistant for helvetic (Helvetic Airways AG). "
    "Expand the editor's rough notes into finished manual content that strictly "
    "follows the house style rules below. Do not invent facts, figures, procedures, "
    "altitudes, speeds or steps that are not present in the notes; if information is "
    "missing, leave a clearly marked placeholder like [TO CONFIRM] rather than "
    "guessing. You own wording and presentation; the editor owns factual correctness.\n\n"
    "House style rules:"
)

# ---------------------------------------------------------------------------
# Style modifier sets — injected between the preamble and the rule list.
# Each dimension is independent; all four are always applied together.
# ---------------------------------------------------------------------------

STYLE_STRUCTURE = {
    "prose": (
        "Structure: write in continuous prose paragraphs. Use bullet lists only when "
        "the content is genuinely enumerable (four or more parallel items with no "
        "natural sentence flow). Prefer well-constructed sentences over fragmented lists."
    ),
    "mixed": (
        "Structure: balance prose and bullet lists according to the content. Use prose "
        "for context, explanation and policy statements. Use bullet lists for parallel "
        "items, requirements and step sequences. This is the default helvetic style."
    ),
    "bullets": (
        "Structure: favour bullet lists for all enumerable content. Use prose only for "
        "introductory sentences, context-setting and content that cannot naturally be "
        "broken into list items. Keep list items concise — one idea per bullet."
    ),
}

STYLE_TONE = {
    "procedural": (
        "Tone: write procedurally — action-oriented, step-focused, direct. "
        "Each statement describes what shall be done and by whom. "
        "Favour short, unambiguous sentences. Omit background explanation unless "
        "it is essential for safety or compliance."
    ),
    "descriptive": (
        "Tone: write descriptively — explain the purpose and context of each "
        "requirement, not just the requirement itself. Give the reader enough "
        "background to understand why something is done, not only what to do. "
        "Longer, more contextual sentences are appropriate."
    ),
    "balanced": (
        "Tone: balance procedural clarity with enough descriptive context for "
        "the reader to understand intent. State what shall be done and give a "
        "brief reason where it aids understanding. This is the default helvetic style."
    ),
}

STYLE_AUDIENCE = {
    "flight_crew": (
        "Audience — flight crew: the reader has full professional aviation knowledge. "
        "Standard ICAO and aviation technical terminology may be used without definition "
        "(V-speeds, FCOM, ECAM, FMA, FD, AP, thrust ratings, etc.)."
    ),
    "mixed_crew": (
        "Audience — mixed crew (flight crew and cabin crew): avoid flight-deck-specific "
        "technical terms where possible. If a technical term is necessary, briefly define "
        "it on first use. Write so that an experienced cabin crew member can follow the "
        "content without aviation flight training."
    ),
    "cabin_crew": (
        "Audience — cabin crew: the reader has no flight deck training and is not "
        "familiar with piloting, avionics or aircraft systems terminology. "
        "Do not use pilot-specific terms (V-speeds, FMA, ECAM, thrust ratings, "
        "flight phases by technical name, etc.). Describe aircraft states and events "
        "in plain, operational language (e.g. 'when the aircraft is climbing' rather "
        "than 'during the climb phase after thrust reduction'). "
        "Keep sentences short and vocabulary straightforward."
    ),
    "ground_staff": (
        "Audience — ground staff and non-crew employees: the reader works in an "
        "aviation environment but does not operate aircraft. Avoid both flight deck "
        "and cabin crew operational jargon. Use plain professional language. "
        "Define any aviation regulatory term on first use."
    ),
}

STYLE_LENGTH = {
    "concise": (
        "Length: be as concise as possible. Use the minimum words needed to convey "
        "the requirement clearly and unambiguously. Cut every word that does not add "
        "meaning. Short bullets and short sentences are preferred."
    ),
    "standard": (
        "Length: write to a standard depth — enough detail for the reader to act "
        "correctly without needing to refer elsewhere, but without padding or "
        "unnecessary repetition. This is the default helvetic style."
    ),
    "comprehensive": (
        "Length: write comprehensively — include full context, relevant examples, "
        "and explanatory background. The reader should not need to consult another "
        "source to understand and apply the content. Err on the side of more detail."
    ),
}

# Defaults used when no style option is selected
STYLE_DEFAULTS = {
    "structure": "mixed",
    "tone": "balanced",
    "audience": "flight_crew",
    "length": "standard",
}


PAGE_CHARS = 3000  # plain text on one WebManuals page; see pages.py


def length_instruction(target_chars: int, fit_pages: bool) -> str:
    """Length as a number of characters, from the slider in the editor."""
    n = int(target_chars)
    if fit_pages:
        # Headings, bullets and boxes eat into a page, so a text meant to fill
        # its last page is aimed lower; an overrun costs a whole extra page.
        pages = max(1, math.ceil(n / PAGE_CHARS))
        n = min(n, round(pages * PAGE_CHARS * 0.8 / 50) * 50)
    text = (
        f"Length: aim for about {n} characters of text the reader sees, including "
        f"spaces (roughly {max(1, round(n / 6.5))} words), and stay within 15% of that. "
        "HTML tags do not count. Fit the depth of detail to this length: fewer, "
        "tighter points for a short text, more explanation for a long one. Never "
        "pad, and never drop a fact from the notes to reach the length."
    )
    if fit_pages:
        text += (
            " The text is published in WebManuals, where a page holds about "
            f"{PAGE_CHARS} characters of running text and does not break by itself: "
            "anything beyond the page is not printed. Headings, bullets with their "
            "blank lines, and Note/Caution/Warning boxes take more room than their "
            "characters."
        )
        if pages == 1:
            text += (" The whole text must fit on one page, so treat the length "
                     "as a ceiling rather than a target.")
        else:
            text += (
                f" It will be split into {pages} pages. Let a heading fall roughly "
                f"every {PAGE_CHARS - 500} characters so each page can start with one, "
                "and keep each list or box short enough to stay on one page."
            )
    return text


def build_style_block(structure: str = None, tone: str = None,
                      audience: str = None, length: str = None,
                      target_chars: int = None, fit_pages: bool = False) -> str:
    s = STYLE_STRUCTURE.get(structure or STYLE_DEFAULTS["structure"], "")
    t = STYLE_TONE.get(tone or STYLE_DEFAULTS["tone"], "")
    a = STYLE_AUDIENCE.get(audience or STYLE_DEFAULTS["audience"], "")
    l = (length_instruction(target_chars, fit_pages) if target_chars
         else STYLE_LENGTH.get(length or STYLE_DEFAULTS["length"], ""))
    parts = [x for x in [s, t, a, l] if x]
    if not parts:
        return ""
    return "\n\nWriting style for this draft:\n" + "\n".join(f"- {p}" for p in parts)


# ---------------------------------------------------------------------------
# Note / Caution / Warning exact WebManuals HTML templates
# Colour = font only (no background). Total width 718px = WebManuals page.
# ---------------------------------------------------------------------------
_NOTE_HTML = (
    '<table border="0" cellpadding="0" cellspacing="0" '
    'style="border-collapse:collapse; margin:0px; width:718px">'
    "<tbody><tr>"
    '<td style="text-align:inherit; vertical-align:top; width:60px">'
    '<p><span style="color:#2ecc71"><strong>Note:</strong></span></p></td>'
    '<td style="text-align:inherit; vertical-align:top; width:656px">'
    '<p><span style="color:#2ecc71">NOTE TEXT HERE</span></p></td>'
    "</tr></tbody></table>"
)

_CAUTION_HTML = (
    '<table border="0" cellpadding="0" cellspacing="0" '
    'style="border-collapse:collapse; margin:0px; width:718px">'
    "<tbody><tr>"
    '<td style="text-align:inherit; vertical-align:top; width:110px">'
    '<p><span style="color:#f39c12"><strong>CAUTION:</strong></span></p></td>'
    '<td style="text-align:inherit; vertical-align:top; width:616px">'
    '<p><span style="color:#f39c12">CAUTION TEXT HERE</span></p></td>'
    "</tr></tbody></table>"
)

_WARNING_HTML = (
    '<table border="0" cellpadding="0" cellspacing="0" '
    'style="border-collapse:collapse; margin:0px; width:718px">'
    "<tbody><tr>"
    '<td style="text-align:inherit; vertical-align:top; width:110px">'
    '<p><span style="color:#e74c3c"><strong>WARNING:</strong></span></p></td>'
    '<td style="text-align:inherit; vertical-align:top; width:606px">'
    '<p><span style="color:#e74c3c">WARNING TEXT HERE</span></p></td>'
    "</tr></tbody></table>"
)

_HTML_OUTPUT_RULES = "\n".join([
    "",
    "",
    "Output format — follow every point exactly:",
    "- Return raw HTML only. Do NOT wrap output in markdown code fences "
      "(no ```html, no ```). Do not add any commentary before or after the HTML.",
    "- Forbidden attributes — never add these to ANY tag except where explicitly "
      "shown in the Note/Caution/Warning templates below: "
      "background-color, color, font-size, margin, margin-left, text-align. "
      "These attributes cause WebManuals to import unwanted styling on paste. "
      "Structural tags must be completely plain with no style= attribute at all: "
      "<p>, <ul>, <li>, <h2>, <h3>, <h4>, <h5>, <table>, <tbody>, <tr>. "
      "The ONLY tags that may carry a style= attribute are the <td> and <span> "
      "elements inside Note/Caution/Warning tables, exactly as shown in the "
      "templates below. No other tag may have any style= attribute.",
    "- Bullet lists: use <ul> and <li>. To create the required blank line after each "
      "main bullet, insert <br />&nbsp; immediately before the closing </li> tag "
      "(not after it). Sub-bullets do not get this extra spacing. Example structure:\n"
      "<ul>\n"
      "  <li>main bullet text<br />&nbsp;</li>\n"
      "  <li>main bullet with sub-bullets\n"
      "    <ul><li>sub-bullet 1</li><li>sub-bullet 2<br />&nbsp;</li></ul>\n"
      "  </li>\n"
      "  <li>last bullet (no trailing space needed)</li>\n"
      "</ul>"
"- Bullet text: start each bullet with a lowercase letter, except for terms that "
      "are always capitalised (proper nouns, job titles, abbreviations). "
      "Example: lowercase: safety, aircraft performance. Uppercase: Safety Manager (SM), ECAM.",
    "- Headings and subtitles: use logically cascading heading tags with NO style= "
      "attribute on the heading tag itself. "
      "The section title is <h2>, first-level subtitles <h3>, "
      "second-level <h4>, third-level <h5>. "
      "Fleet variant colours — when a heading introduces content specific to one "
      "Embraer variant, wrap ONLY the variant name in a <span> with the colour; "
      "the rest of the heading title follows outside the span, unstyled. "
      "Use this exact syntax: "
      "<h3><span style=\"color:#02cda5\">E190-E1</span> Fuel Planning</h3> "
      "Variant colour codes (text only, no background): "
      "E190-E1: #02cda5 | E195-E1: #00665e | E1 (both): #019A82 | "
      "E190-E2: #0057d9 | E195-E2: #000080 | E2 (both): #002CAD. "
      "Only colour variant headings when content genuinely separates by variant. "
      "Headings that apply to all aircraft must have no span and no colour.",
    "- Notes: colour is FONT ONLY — no background. Use this exact table structure:",
    "  " + _NOTE_HTML,
    "- Cautions: same table structure, first-column width 110px, "
      "second-column width 616px, colour #f39c12, label is CAUTION: (all caps):",
    "  " + _CAUTION_HTML,
    "- Warnings: same table structure, first-column width 110px, "
      "second-column width 606px, colour #e74c3c, label is WARNING: (all caps):",
    "  " + _WARNING_HTML,
    "- Note label is mixed case (Note:) — only CAUTION: and WARNING: are all-caps.",
    "- The first sentence of every Note, Caution and Warning starts with a capital letter.",
])

OUTPUT_INSTRUCTIONS = {
    "html": _HTML_OUTPUT_RULES,
    "text": (
        "\n\nOutput: return plain structured text only. "
        "No markdown code fences, no commentary before or after."
    ),
}


def load_rules(path: str = "APM_rules.json") -> list:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["rules"]


def build_system_prompt(rules: list, include_process: bool = False,
                        target: str = "html",
                        structure: str = None, tone: str = None,
                        audience: str = None, length: str = None,
                        target_chars: int = None, fit_pages: bool = False) -> str:
    groups: dict = {}
    for r in rules:
        if r["category"] == "process" and not include_process:
            continue
        groups.setdefault(r["category"], []).append(r)

    lines = [PREAMBLE]

    # Style modifiers come first so they frame how the rules are applied
    style_block = build_style_block(structure, tone, audience, length,
                                    target_chars, fit_pages)
    if style_block:
        lines.append(style_block)

    for cat in CATEGORY_ORDER:
        if cat not in groups:
            continue
        lines.append(f"\n### {CATEGORY_TITLES.get(cat, cat)}")
        for r in groups[cat]:
            lines.append(f"- {r['prompt_fragment']}")

    lines.append(OUTPUT_INSTRUCTIONS.get(target, OUTPUT_INSTRUCTIONS["html"]))
    return "\n".join(lines)


if __name__ == "__main__":
    rules = load_rules()
    sp = build_system_prompt(rules, structure="bullets", tone="procedural",
                             audience="cabin_crew", length="concise")
    print(sp[:600], "\n...\n")
    print(f"--- {len(sp)} chars total ---")
