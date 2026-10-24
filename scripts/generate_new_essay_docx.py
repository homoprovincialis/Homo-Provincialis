#!/usr/bin/env python3
"""Create downloadable Word versions of recently published HTML essays.

The published HTML is the content source. If an original DOCX has already
been added to Articles, do not overwrite it.
"""
from pathlib import Path

from bs4 import BeautifulSoup
from docx import Document
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
ARTICLES = ROOT / "homoprovincialis-site" / "Articles"
STEMS = (
    "Filtering_Brothers_Grimm_Tales_Part_1_EN",
    "Filtering_Mother_Goose_Tales_Revised_EN",
    "Filtratsiya_Skazok_Bratev_Grimm_Chast_1_RU",
    "Filtratsiya_Skazok_Matushki_Gusyni_Novaya_Versiya_RU",
    "Maitreyi_Continuare_RO_EN_FR_RU",
    "Iubirea_si_responsabilitatea_morala_in_trei_opere_literare_RO",
)
LANGUAGES = {"ro": "Română", "en": "English", "fr": "Français", "ru": "Русский"}


def article_blocks(soup):
    main = soup.select_one("main.paper")
    if main is None:
        raise ValueError("Article HTML has no main.paper element")

    for element in main.find_all(["section", "h1", "h2", "h3", "p"]):
        if element.name == "section":
            if "lang-section" in element.get("class", []):
                code = element.get("lang") or element.get("id")
                yield ("Heading 1", LANGUAGES.get(code, code))
            continue

        if element.find_parent(["nav", "script", "style"]):
            continue
        if element.name == "p" and element.find_parent("p"):
            continue
        value = element.get_text(" ", strip=True)
        if not value:
            continue
        style = {"h1": "Title", "h2": "Heading 2", "h3": "Heading 3", "p": "Normal"}[element.name]
        yield (style, value)


def build(name):
    source = ARTICLES / (name + ".html")
    target = ARTICLES / (name + ".docx")
    if target.exists():
        print("Keeping existing original:", target.name)
        return
    if not source.is_file():
        raise FileNotFoundError("Missing article: " + str(source))

    html = source.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    blocks = list(article_blocks(soup))
    if len(blocks) < 10 or sum(len(value) for _, value in blocks) < 1000:
        raise ValueError("Unexpectedly little content in article: " + name)

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(2.25)
    section.bottom_margin = Cm(2.1)
    section.left_margin = Cm(2.55)
    section.right_margin = Cm(2.55)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.15
    for heading in ("Title", "Heading 1", "Heading 2", "Heading 3"):
        doc.styles[heading].font.name = "Cambria"
        doc.styles[heading].font.color.rgb = RGBColor(35, 65, 88)

    for style, value in blocks:
        doc.add_paragraph(value, style=style)
    doc.core_properties.title = soup.title.get_text(" ", strip=True) if soup.title else name
    doc.core_properties.author = "Ramon Eyquem"
    doc.save(target)
    print("Generated:", target.name, "paragraphs:", len(blocks), "bytes:", target.stat().st_size)


if __name__ == "__main__":
    for stem in STEMS:
        build(stem)
