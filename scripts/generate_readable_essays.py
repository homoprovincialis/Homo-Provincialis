#!/usr/bin/env python3
"""Build readable HTML versions of existing Word essays for GitHub Pages.

The original DOCX files are never modified. The generated HTML files are
created inside the Pages artifact during the deployment workflow.
"""

from html import escape
from pathlib import Path

import mammoth

ROOT = Path(__file__).resolve().parent.parent
ARTICLES_DIR = ROOT / "homoprovincialis-site" / "Articles"

DOCUMENTS = (
    ("Apriori1_en.docx", "Apriori1 — The Prior in Relation to the Subsequent", "en"),
    ("Apriori1_ru.docx", "Apriori1 — Предыдущее по отношению к последующему", "ru"),
    ("Human_Morality_Plan_Introduction.docx", "Human Morality — Plan and Introduction", "en"),
    ("Мораль_Человека_План_введение.docx", "Мораль человека — План и введение", "ru"),
    ("International_Philosophical_Community.docx", "International Philosophical Community", "en"),
    ("Международное_философское_сообщество.docx", "Международное философское сообщество", "ru"),
    ("Philosophical_Clarity.docx", "Philosophical Clarity", "en"),
    ("Философская_ясность.docx", "Философская ясность", "ru"),
)

CSS = """
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#eef1f3;color:#28333d;font:17px/1.7 Georgia,'Times New Roman',serif}
.topbar{background:#fff;border-bottom:1px solid #d7dfe5;padding:13px max(18px,calc((100vw - 920px)/2));font:14px/1.5 Arial,sans-serif}
a{color:#245779;overflow-wrap:anywhere}
.article{max-width:920px;margin:28px auto 50px;padding:clamp(22px,5vw,60px);background:#fff;border:1px solid #d5dde3}
.article>h1{font:normal clamp(27px,4vw,36px)/1.25 Georgia,'Times New Roman',serif;color:#23445c;margin:0 0 20px;padding-bottom:15px;border-bottom:2px solid #d8e2ea}
.word-content{overflow-wrap:anywhere}
.word-content h1,.word-content h2,.word-content h3,.word-content h4{font-family:Georgia,'Times New Roman',serif;color:#23445c;line-height:1.35;margin:1.3em 0 .6em}
.word-content h1{font-size:27px}.word-content h2{font-size:23px}.word-content h3{font-size:20px}
.word-content p{margin:.4em 0 .95em}
.word-content p:empty{min-height:.4em}
.word-content ul,.word-content ol{padding-left:1.6em}
.word-content li{margin-bottom:.3em}
.word-content blockquote{margin:1em 0;padding:.2em 1em;border-left:3px solid #a8bbc9;background:#f8fafb}
.word-content table{display:block;width:100%;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:20px 0}
.word-content td,.word-content th{border:1px solid #c9d3da;padding:7px 10px;vertical-align:top}
.word-content img{max-width:100%;height:auto}
.word-content pre{white-space:pre-wrap;overflow-wrap:anywhere}
.download{font:14px Arial,sans-serif;margin:32px 0 0;padding-top:17px;border-top:1px solid #d7dfe5}
@media(max-width:650px){body{background:#fff;font-size:16px;line-height:1.65}.article{margin:0;padding:18px;border:0}.topbar{padding:12px 18px}}
"""


def build_one(filename: str, title: str, lang: str) -> None:
    source = ARTICLES_DIR / filename
    if not source.is_file():
        raise FileNotFoundError(f"Word article is missing: {source}")

    with source.open("rb") as file_handle:
        result = mammoth.convert_to_html(file_handle)

    converted = result.value.strip()
    if not converted:
        raise ValueError(f"Conversion produced no article text: {filename}")
    for message in result.messages:
        print(f"{filename}: {message}", flush=True)

    page_title = escape(title)
    word_name = escape(filename, quote=True)
    back_label = "← Эссе Рамона Эйкема" if lang == "ru" else "← Essays by Ramon Eyquem"
    download_label = "Скачать исходный документ Word" if lang == "ru" else "Download original Word document"
    html_page = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{page_title} — Homo Provincialis</title>
  <style>{CSS}</style>
</head>
<body>
  <nav class="topbar"><a href="../essays-by-ramon-eyquem.html">{back_label}</a></nav>
  <main class="article">
    <h1>{page_title}</h1>
    <article class="word-content">{converted}</article>
    <p class="download"><a href="{word_name}" download>{download_label} ↓</a></p>
  </main>
</body>
</html>
"""
    output = source.with_suffix(".html")
    output.write_text(html_page, encoding="utf-8")
    print(f"Generated {output.relative_to(ROOT)} ({len(html_page)} characters)", flush=True)


def main() -> None:
    for filename, title, lang in DOCUMENTS:
        build_one(filename, title, lang)


if __name__ == "__main__":
    main()
