"""The request/response contract shared with the frontend.

Field names here are the vocabulary used across the form, the prompts and the
Word styles, so a change in one place is easy to trace to the others.
"""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .config import settings


class Treatment(str, Enum):
    """What the editor wants done with the text they typed."""

    VERBATIM = "verbatim"   # use word for word; never reaches a model
    POLISH = "polish"       # correct spelling/grammar/punctuation only
    DRAFT = "draft"         # rough notes; the model writes the finished text


class BoxPolicy(str, Enum):
    INHERIT = "inherit"     # follow the document-level setting
    AI = "ai"               # the model may add highlight boxes
    NONE = "none"           # never add boxes beyond the ones written by hand


class BoxType(str, Enum):
    ACTION = "action_box"   # red: deadline, must-do, acknowledgement
    INFO = "info_box"       # blue: background, FYI, did-you-know


class Box(BaseModel):
    type: BoxType
    title: str = ""
    text: str = ""


class Chapter(BaseModel):
    heading: str = ""
    treatment: Treatment = Treatment.DRAFT
    text: str = ""
    box_policy: BoxPolicy = BoxPolicy.INHERIT
    boxes: list[Box] = Field(default_factory=list)

    @field_validator("boxes")
    @classmethod
    def _cap_boxes(cls, v: list[Box]) -> list[Box]:
        if len(v) > 6:
            raise ValueError("a chapter takes at most 6 highlight boxes")
        return v


class Layout(str, Enum):
    STANDARD = "standard"     # the multi-page newsletter / bulletin
    ONE_PAGER = "one_pager"   # four cards plus short news, on a single page


ICONS = ["warn", "star", "gear", "info", "smile", "heart", "check"]


class Card(BaseModel):
    """One grey box of the one-page layout. Empty cards are dropped."""

    icon: str = "info"
    title: str = ""
    subtitle: str = ""
    text: str = ""
    treatment: Treatment = Treatment.DRAFT

    @field_validator("icon")
    @classmethod
    def _known_icon(cls, v: str) -> str:
        return v if v in ICONS else "info"

    @property
    def filled(self) -> bool:
        return bool(self.title.strip() or self.text.strip())


class NewsItem(BaseModel):
    """One short-news row. Empty rows are dropped, so the band shrinks."""

    icon: str = "smile"
    label: str = ""
    text: str = ""
    treatment: Treatment = Treatment.DRAFT

    @field_validator("icon")
    @classmethod
    def _known_icon(cls, v: str) -> str:
        return v if v in ICONS else "smile"

    @property
    def filled(self) -> bool:
        return bool(self.label.strip() or self.text.strip())


class Masthead(BaseModel):
    header_kicker: str
    doc_type: str = "Newsletter"
    doc_issue: str = ""
    doc_headline: str = ""
    publication_date: date
    footer_revision: str = "01"
    footer_issued_by: str = ""

    @field_validator("footer_issued_by")
    @classmethod
    def _default_issued_by(cls, v: str, info) -> str:
        if v.strip():
            return v.strip()
        kicker = (info.data.get("header_kicker") or "").strip()
        for suffix in (" Newsletter", " Bulletin"):
            if kicker.endswith(suffix):
                return kicker[: -len(suffix)]
        return kicker


class StyleSpec(BaseModel):
    structure: Literal["prose", "balanced", "bullets"] = "balanced"
    tone: Literal["neutral", "formal", "direct"] = "neutral"
    length: Literal["brief", "standard", "detailed"] = "standard"
    box_policy: Literal["ai", "none"] = "ai"
    style_notes: str = ""


class DocumentRequest(BaseModel):
    masthead: Masthead
    style: StyleSpec = Field(default_factory=StyleSpec)
    layout: Layout = Layout.STANDARD
    # standard layout
    chapters: list[Chapter] = Field(default_factory=list)
    # one-pager layout
    cards: list[Card] = Field(default_factory=list)
    news: list[NewsItem] = Field(default_factory=list)
    provider: Literal["claude", "copilot", "manual"] | None = None

    @field_validator("cards")
    @classmethod
    def _cap_cards(cls, v: list[Card]) -> list[Card]:
        if len(v) > 4:
            raise ValueError("the one-page layout takes at most 4 cards")
        return v

    @field_validator("news")
    @classmethod
    def _cap_news(cls, v: list[NewsItem]) -> list[NewsItem]:
        if len(v) > 3:
            raise ValueError("the one-page layout takes at most 3 short-news rows")
        return v

    @field_validator("chapters")
    @classmethod
    def _cap_chapters(cls, v: list[Chapter]) -> list[Chapter]:
        if len(v) > settings.max_chapters:
            raise ValueError(f"at most {settings.max_chapters} chapters")
        return v


# ----- what comes back -----

class RenderedBlock(BaseModel):
    kind: Literal["body", "bullets", "action_box", "info_box"]
    title: str = ""
    text: str = ""
    items: list[str] = Field(default_factory=list)


class RenderedChapter(BaseModel):
    heading: str
    blocks: list[RenderedBlock]
    provider_used: str


class RenderedCard(BaseModel):
    icon: str
    title: str
    subtitle: str = ""
    blocks: list[RenderedBlock]
    provider_used: str


class RenderedNews(BaseModel):
    icon: str
    label: str
    lines: list[str]
    provider_used: str


class DraftResponse(BaseModel):
    """The generated text, before it becomes a .docx.

    Returned on its own so the editor can review and correct it in the browser;
    the same object is then posted back to /render.
    """

    masthead: Masthead
    layout: Layout = Layout.STANDARD
    chapters: list[RenderedChapter] = Field(default_factory=list)
    cards: list[RenderedCard] = Field(default_factory=list)
    news: list[RenderedNews] = Field(default_factory=list)


class RenderRequest(BaseModel):
    masthead: Masthead
    layout: Layout = Layout.STANDARD
    chapters: list[RenderedChapter] = Field(default_factory=list)
    cards: list[RenderedCard] = Field(default_factory=list)
    news: list[RenderedNews] = Field(default_factory=list)
