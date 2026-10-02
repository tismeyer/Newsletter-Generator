"""Prompt construction.

These rules sit above the provider interface on purpose: Claude and Copilot get
byte-identical instructions, so output stays comparable and switching provider
is not also a change of house style.
"""
from __future__ import annotations

from .schemas import BoxPolicy, Chapter, StyleSpec, Treatment

HOUSE_STYLE = """You write internal staff publications for Helvetic Airways, a Swiss
regional airline. Readers are crew and operational staff.

Rules:
- Swiss/British English. Plain, specific language. Active voice.
- Never invent facts, figures, dates, manual references or names. Use only what
  the editor supplied. If something is missing, write around it.
- Keep aviation terminology and abbreviations exactly as the editor wrote them.
- No marketing tone, no filler openers, no closing summaries.
- Output plain text only: no markdown, no headings, no bold, no quotation marks
  around the whole answer."""

STRUCTURE = {
    "prose": "Write continuous paragraphs. Use a bulleted list only if the content is genuinely a list.",
    "balanced": "Mix short paragraphs with bulleted lists where a list is clearer.",
    "bullets": "Prefer bulleted lists. Keep connecting prose to one or two sentences.",
}

TONE = {
    "neutral": "Neutral, factual, collegial.",
    "formal": "Formal and impersonal. Avoid contractions and direct address.",
    "direct": "Direct and brief. Address the reader as 'you'. Lead with the action.",
}

LENGTH = {
    "brief": "About 60-90 words per chapter.",
    "standard": "About 120-180 words per chapter.",
    "detailed": "About 220-300 words per chapter.",
}

# Per-block rules. The keys match BoxType values and the Word styles.
BLOCK_RULES = {
    "action_box": (
        "Write a highlight box for something the reader must DO. "
        "1-2 sentences, imperative, max 40 words. State the deadline and where "
        "to do it if the editor supplied them. "
        "Title: max 4 words, no final punctuation."
    ),
    "info_box": (
        "Write a highlight box with background the reader should know. "
        "1-3 sentences, max 50 words, no call to action. "
        "Title: max 4 words, no final punctuation."
    ),
}


def style_block(style: StyleSpec) -> str:
    parts = [
        STRUCTURE[style.structure],
        TONE[style.tone],
        LENGTH[style.length],
    ]
    if style.style_notes.strip():
        parts.append("Editor's instructions (these override the above): " + style.style_notes.strip())
    return "\n".join("- " + p for p in parts)


def effective_box_policy(chapter: Chapter, style: StyleSpec) -> bool:
    """True when the model may invent highlight boxes for this chapter."""
    if chapter.treatment is Treatment.VERBATIM:
        return False
    if chapter.box_policy is BoxPolicy.AI:
        return True
    if chapter.box_policy is BoxPolicy.NONE:
        return False
    return style.box_policy == "ai"


def chapter_prompt(chapter: Chapter, style: StyleSpec, may_add_boxes: bool) -> str:
    """Prompt for the running text of one chapter."""
    if chapter.treatment is Treatment.POLISH:
        task = (
            "Proofread the text inside the <text> element below. Correct "
            "spelling, grammar, punctuation and obvious typos ONLY. Do not "
            "rewrite, reorder, shorten, expand or restyle anything. Keep the "
            "author's wording, sentence structure, line breaks and list "
            "formatting.\n"
            "Output the corrected text only. Do not output the <text> tags, the "
            "chapter heading, or any label, heading or separator line that is "
            "part of these instructions."
        )
        constraints = ""
    else:
        task = (
            "Turn the editor's notes below into the finished text of one chapter "
            "of the publication. Do not repeat the chapter heading."
        )
        constraints = "\nWrite in this style:\n" + style_block(style)

    box_note = ""
    if may_add_boxes:
        box_note = (
            "\nIf one point clearly deserves highlighting, you may mark it by "
            "putting it on its own line starting with [ACTION] (something the "
            "reader must do) or [INFO] (background). At most one such line."
        )
    elif chapter.treatment is not Treatment.POLISH:
        box_note = "\nDo not add highlight boxes or markers of any kind."

    return (
        f"{task}{constraints}{box_note}\n\n"
        f"<heading>{chapter.heading or '(none)'}</heading>\n"
        f"<text>\n{chapter.text.strip()}\n</text>"
    )


def box_prompt(box_type: str, title: str, text: str, style: StyleSpec) -> str:
    return (
        f"{BLOCK_RULES[box_type]}\n"
        f"Tone: {TONE[style.tone]}\n\n"
        f"Editor's title: {title or '(write one)'}\n"
        f"Editor's notes: {text.strip() or '(none - use the chapter context only)'}\n\n"
        "Return exactly two lines: the title on line 1, the box text on line 2."
    )
