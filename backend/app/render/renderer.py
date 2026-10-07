"""Turns generated blocks into a branded .docx.

The template file carries every style, the header, the footer and the page
setup. Nothing about the design lives in this module: it only chooses which
named style each piece of content gets, so a design change is made in Word and
never here.
"""
from __future__ import annotations

import io
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor, Twips

from .. import images
from ..schemas import Masthead, RenderedChapter
from . import docxutil as X

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "template.docx"

RED = RGBColor(0xE4, 0x03, 0x2E)
BLUE_BAR = "3E6E9E"
BLUE_BG = "E7EEF5"
RED_BG = "FBE7EA"
RED_BAR = "E4032E"

CONTENT_W = Twips(9638)  # A4 minus 2 cm margins, matching the template
ASSETS = TEMPLATE.parent
ICON_PT = 20             # round chapter icon beside the heading
HEADING_RAISE_PT = 6     # lifts the 10 pt heading text to the icon's middle
IMAGE_MAX_H = Cm(8)      # a chapter picture is full width unless that is taller


def _fmt_date(d) -> str:
    return d.strftime("%d.%m.%Y")


def _box(doc, kind: str, title: str, text: str) -> None:
    """A highlight box: one-cell table, tinted fill, coloured left bar."""
    bar, bg = (RED_BAR, RED_BG) if kind == "action_box" else (BLUE_BAR, BLUE_BG)
    table = doc.add_table(rows=1, cols=1)
    X.table_no_borders(table)
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = CONTENT_W
    X.shade_cell(cell, bg)
    X.cell_borders(cell, left=bar, size=24)
    X.cell_margins(cell, top=150, bottom=150, left=240, right=240)
    X.row_cannot_split(table.rows[0])

    p = cell.paragraphs[0]
    X.set_style(p, "CalloutTitle")
    run = p.add_run(title.upper())
    run.font.color.rgb = RGBColor.from_string(bar)

    for line in [t for t in text.split("\n") if t.strip()]:
        cp = cell.add_paragraph(line.strip())
        X.set_style(cp, "Callout")
        cp.paragraph_format.space_after = Pt(3)

    doc.add_paragraph()  # breathing room after the box


def _picture(doc, data_url: str) -> None:
    """A chapter's picture: full content width, uncropped, at most IMAGE_MAX_H tall."""
    stream, ratio = images.as_stream(data_url)
    width = CONTENT_W
    height = int(width * ratio)
    if height > IMAGE_MAX_H:
        height = IMAGE_MAX_H
        width = int(height / ratio)
    p = doc.add_paragraph()
    X.set_style(p, "Body")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # Body text has an exact line height, which would clip the picture.
    p.paragraph_format.line_spacing = 1.0
    p.add_run().add_picture(stream, width=width, height=height)


def render_document(masthead: Masthead, chapters: list[RenderedChapter]) -> bytes:
    doc = Document(str(TEMPLATE))
    bullet_numpr = X.find_bullet_numpr(doc)
    X.clear_body(doc)

    # ---- header / footer placeholders ----
    mapping = {
        "KICKER": masthead.header_kicker,
        "ISSUED_BY": masthead.footer_issued_by,
        "REVISION": masthead.footer_revision,
        "PUB_DATE": _fmt_date(masthead.publication_date),
    }
    for section in doc.sections:
        X.replace_in_part(section.header, mapping)
        X.replace_in_part(section.footer, mapping)

    # ---- title block ----
    title = doc.add_paragraph()
    X.set_style(title, "DocTitle")
    title.add_run(f"{masthead.doc_type} \u2013 ")
    issue = title.add_run(masthead.doc_issue)
    issue.font.color.rgb = RED

    X.set_style(doc.add_paragraph(masthead.doc_headline), "DocHeadline")
    X.set_style(doc.add_paragraph(_fmt_date(masthead.publication_date)), "DocDate")

    # ---- chapters ----
    for chapter in chapters:
        heading = doc.add_paragraph()
        X.set_style(heading, "Heading1")
        icon = ASSETS / f"ic_{chapter.icon}.png"
        if chapter.icon and icon.exists():
            heading.add_run().add_picture(str(icon), width=Pt(ICON_PT), height=Pt(ICON_PT))
            # An inline picture sits on the text baseline, so the text would hug
            # the icon's bottom edge; raise it to line up with the icon's centre.
            text = heading.add_run("\u2002" + chapter.heading)
            X.raise_run(text, HEADING_RAISE_PT)
        else:
            heading.add_run(chapter.heading)
        if chapter.image:
            _picture(doc, chapter.image)
        for block in chapter.blocks:
            if block.kind == "body":
                for para in [t for t in block.text.split("\n") if t.strip()]:
                    X.set_style(doc.add_paragraph(para.strip()), "Body")
            elif block.kind == "bullets":
                for item in block.items:
                    p = doc.add_paragraph(item)
                    X.set_style(p, "Body")
                    X.apply_numpr(p, bullet_numpr)
            else:
                _box(doc, block.kind, block.title, block.text)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def filename_for(masthead: Masthead) -> str:
    dept = masthead.footer_issued_by.replace(" ", "_") or "Publication"
    issue = masthead.doc_issue.replace(" ", "_") or _fmt_date(masthead.publication_date)
    return f"{dept}_{masthead.doc_type}_{issue}.docx"
