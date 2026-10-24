#!/usr/bin/env python3
"""Generate DOCX copies of published literary-essay translations."""
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "homoprovincialis-site" / "Articles"
FILES = (
    "Love_and_Moral_Responsibility_in_Three_Literary_Works_EN",
    "Lyubov_i_moralnaya_otvetstvennost_v_tryokh_literaturnykh_proizvedeniyakh_RU",
)
HEADINGS = {6, 19, 32, 50, 62, 76}

for name in FILES:
    lines = (FOLDER / (name + ".txt")).read_text(encoding="utf-8").splitlines()
    if len(lines) != 89 or any(not x.strip() for x in lines):
        raise ValueError("Translation requires exactly 89 paragraphs: " + name)
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
    normal.paragraph_format.line_spacing = 1.16
    title = doc.styles["Title"]
    title.font.name = "Cambria"
    title.font.size = Pt(21)
    title.font.color.rgb = RGBColor(34, 68, 93)
    title.paragraph_format.space_after = Pt(10)
    heading = doc.styles["Heading 2"]
    heading.font.name = "Cambria"
    heading.font.size = Pt(13.5)
    heading.font.color.rgb = RGBColor(34, 68, 93)
    heading.paragraph_format.space_before = Pt(14)
    heading.paragraph_format.space_after = Pt(6)
    for i, content in enumerate(lines):
        doc.add_paragraph(content, style="Title" if i == 0 else "Heading 2" if i in HEADINGS else "Normal")
    doc.core_properties.title = lines[0]
    doc.core_properties.author = "Ramon Eyquem"
    dest = FOLDER / (name + ".docx")
    doc.save(dest)
    print("Generated", dest.relative_to(ROOT))
