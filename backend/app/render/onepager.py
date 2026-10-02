"""Renders the one-page bulletin: up to four cards plus up to three news rows.

Design lives in template_onepager.docx; this module only decides which named
style each piece gets and how the boxes are arranged. Two arrangement rules
matter:

* Cards sit two per row. An odd last card spans the full width instead of
  leaving a hole, so two cards fill a page as comfortably as four.
* Empty cards and empty news rows are dropped before layout, so an unused box
  costs nothing and the remaining boxes get the space.
"""
from __future__ import annotations

import io
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.shared import Pt, RGBColor, Twips

from ..budget import card_rows, is_full_width
from ..schemas import Masthead, RenderedCard, RenderedNews
from . import docxutil as X

ASSETS = Path(__file__).resolve().parent.parent / "assets"
TEMPLATE = ASSETS / "template_onepager.docx"

RED = "E4032E"
CARD_BG = "F2F3F4"
CARD_LINE = "DDE0E2"

CONTENT_W = 9978          # A4 less the layout's 1.7 cm margins
GAP = 280
HALF = (CONTENT_W - GAP) // 2
NEWS_LABEL_W = 2850

# Row minimums: with one row of cards there is far more height to give it.
MIN_ROW_ONE = 7200
MIN_ROW_TWO = 3200


def _icon_run(paragraph, icon: str, size_pt: int = 11):
    from docx.shared import Pt as _Pt

    path = ASSETS / f"ic_{icon}.png"
    if path.exists():
        paragraph.add_run().add_picture(str(path), width=_Pt(size_pt), height=_Pt(size_pt))
        paragraph.add_run("   ")


def _fill_card(cell, card: RenderedCard) -> None:
    X.shade_cell(cell, CARD_BG)
    X.cell_borders(cell, left=CARD_LINE, bottom=CARD_LINE, size=4)
    # cell_borders clears the sides it is not given, so restore the full frame
    X.all_borders(cell, CARD_LINE, 4)
    X.cell_margins(cell, top=120, bottom=120, left=160, right=160)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP

    title = cell.paragraphs[0]
    X.set_style(title, "CardTitle")
    _icon_run(title, card.icon)
    title.add_run(card.title.upper())

    if card.subtitle.strip():
        X.set_style(cell.add_paragraph(card.subtitle), "CardSubtitle")

    bullet_numpr = getattr(cell, "_bullet_numpr", None)
    for block in card.blocks:
        if block.kind == "bullets":
            for item in block.items:
                p = cell.add_paragraph(item)
                X.set_style(p, "CardBody")
                X.apply_numpr(p, bullet_numpr)
        elif block.kind == "body":
            for line in [t for t in block.text.split("\n") if t.strip()]:
                X.set_style(cell.add_paragraph(line.strip()), "CardBody")
        else:
            # A highlight box inside a card would fight the card itself, so the
            # box title becomes a sub-heading and its text ordinary body copy.
            if block.title:
                X.set_style(cell.add_paragraph(block.title), "CardSub")
            X.set_style(cell.add_paragraph(block.text), "CardBody")


def _card_tables(doc, cards: list[RenderedCard], bullet_numpr):
    rows = card_rows(len(cards))
    min_height = MIN_ROW_ONE if rows == 1 else MIN_ROW_TWO
    tables = []
    i = 0
    while i < len(cards):
        full = is_full_width(i, len(cards))
        table = doc.add_table(rows=1, cols=1 if full else 3)
        X.table_no_borders(table)
        table.autofit = False
        row = table.rows[0]
        X.row_min_height(row, min_height)
        X.row_cannot_split(row)

        if full:
            X.fixed_columns(table, [CONTENT_W])
            cell = row.cells[0]
            cell._bullet_numpr = bullet_numpr
            _fill_card(cell, cards[i])
            i += 1
        else:
            X.fixed_columns(table, [HALF, GAP, HALF])
            left, gap, right = row.cells
            X.clear_borders(gap)
            left._bullet_numpr = bullet_numpr
            right._bullet_numpr = bullet_numpr
            _fill_card(left, cards[i])
            _fill_card(right, cards[i + 1])
            i += 2
        tables.append(table)
        doc.add_paragraph()  # gap below the row
    return tables


def _news_table(doc, news: list[RenderedNews]) -> None:
    if not news:
        return
    table = doc.add_table(rows=len(news), cols=2)
    X.table_no_borders(table)
    table.autofit = False
    X.fixed_columns(table, [NEWS_LABEL_W, CONTENT_W - NEWS_LABEL_W])
    for idx, item in enumerate(news):
        row = table.rows[idx]
        X.row_cannot_split(row)
        label_cell, text_cell = row.cells
        for cell, right_margin in ((label_cell, 180), (text_cell, 0)):
            X.cell_borders(cell, bottom=CARD_LINE, size=4, top=CARD_LINE if idx == 0 else None)
            X.cell_margins(cell, top=62, bottom=62, left=0, right=right_margin)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP

        label = label_cell.paragraphs[0]
        X.set_style(label, "NewsLabel")
        _icon_run(label, item.icon, 10)
        label.add_run(item.label.upper())

        first = True
        for line in [l for l in item.lines if l.strip()]:
            p = text_cell.paragraphs[0] if first else text_cell.add_paragraph()
            if first:
                p.text = line.strip()
                first = False
            else:
                p.text = line.strip()
            X.set_style(p, "NewsBody")


def render_one_pager(
    masthead: Masthead, cards: list[RenderedCard], news: list[RenderedNews]
) -> bytes:
    doc = Document(str(TEMPLATE))
    bullet_numpr = X.find_bullet_numpr(doc)
    X.clear_body(doc)

    mapping = {
        "KICKER": masthead.header_kicker,
        "ISSUED_BY": masthead.footer_issued_by,
        "REVISION": masthead.footer_revision,
        "PUB_DATE": masthead.publication_date.strftime("%d.%m.%Y"),
    }
    for section in doc.sections:
        X.replace_in_part(section.header, mapping)
        X.replace_in_part(section.footer, mapping)

    title = doc.add_paragraph()
    X.set_style(title, "DocTitle")
    title.add_run(f"{masthead.doc_type} \u2013 ")
    title.add_run(masthead.doc_issue).font.color.rgb = RGBColor.from_string(RED)

    X.set_style(doc.add_paragraph(masthead.doc_headline), "DocHeadline")
    X.set_style(
        doc.add_paragraph(masthead.publication_date.strftime("%d.%m.%Y")), "DocDate"
    )

    usable_cards = [c for c in cards if c.title.strip() or c.blocks]
    usable_news = [n for n in news if n.label.strip() or any(l.strip() for l in n.lines)]

    _card_tables(doc, usable_cards, bullet_numpr)
    _news_table(doc, usable_news)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
