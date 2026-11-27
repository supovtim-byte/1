"""Build lightweight rating cards and refresh their public source totals at deploy time."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "data/clinic-ratings.json"
SNAPSHOT = ROOT / "dist/clinic-ratings.json"
PUBLISHED = "https://supovtim-byte.github.io/1/clinic-ratings.json"
START, END = "<!-- clinic-ratings:start -->", "<!-- clinic-ratings:end -->"
HOSTS = {
    "yandex": {"yandex.ru", "yandex.com", "yandex.eu"},
    "2gis": {"2gis.ru"},
    "zoon": {"zoon.ru"},
    "otzovik": {"otzovik.com", "www.otzovik.com"},
}


def download(url, hosts):
    request = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; MetelitsaRatings/1.0)",
        "Accept-Language": "ru",
    })
    with urlopen(request, timeout=15) as response:
        final = urlsplit(response.url)
        if (final.scheme != "https" or final.hostname not in hosts
                or final.path.rstrip("/") != urlsplit(url).path.rstrip("/")):
            raise ValueError("unexpected source destination")
        body = response.read(4_000_001)
        if len(body) > 4_000_000:
            raise ValueError("source response is too large")
        return body.decode(response.headers.get_content_charset() or "utf-8")


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, value):
        if not self.hidden:
            self.parts.append(value)


def parse_source(source_id, html):
    if source_id == "yandex":
        match = re.search(r'<script\b[^>]*class="state-view"[^>]*>(.*?)</script>', html, re.S)
        if not match:
            raise ValueError("Yandex state is unavailable")
        state = json.loads(match[1])
        org = next(item for view in state["stack"]
                   for item in view.get("results", {}).get("items", [])
                   if str(item.get("id")) == "1132881772")
        return org["ratingData"]["ratingValue"], org["ratingData"]["reviewCount"]
    if source_id == "2gis":
        if not re.search(r'<link\b[^>]*href="https://2gis.ru/spb/firm/5348552838508509(?:/tab/reviews)?"', html):
            raise ValueError("2GIS clinic identity is unavailable")
        parser = VisibleText()
        parser.feed(html)
        text = " ".join(" ".join(parser.parts).split())
        # The public tab total is a review count; the nearby ratings total also
        # includes ratings without text and must not be labelled as reviews.
        match = re.search(r'Метелица\s+Стоматологическая клиника\s+([0-5][.,]\d)\s+\d[\d\s]*\s+оцен\w+.{0,1000}?\s+Контакты\s+Инфо\s+Отзывы\s+(\d+)', text)
        if not match:
            raise ValueError("2GIS clinic totals are unavailable")
        return match[1].replace(",", "."), int(match[2])
    # Restrict microdata to the clinic aggregate, excluding individual reviews
    # and related clinics which also contain ratingValue fields.
    block = re.search(r'itemprop="aggregateRating"[^>]*>[\s\S]*?(?:</span>|</div>)', html)
    if not block:
        raise ValueError("clinic aggregate is unavailable")
    def meta(name):
        match = re.search(r'<meta\b[^>]*itemprop="' + name + r'"[^>]*content\s*=\s*"([^"]+)"', block[0])
        if not match:
            raise ValueError("missing aggregate " + name)
        return unescape(match[1])
    return meta("ratingValue"), int(meta("reviewCount"))


def validated(entry):
    rating, count = float(entry["rating"]), entry["reviewCount"]
    if not (0 <= rating <= 5) or type(count) is not int or not 0 <= count <= 10_000_000:
        raise ValueError("invalid source totals")
    date.fromisoformat(entry["checkedAt"])
    return {"id": entry["id"], "rating": rating, "reviewCount": count, "checkedAt": entry["checkedAt"]}


def merge_snapshot(sources, snapshot):
    if snapshot.get("version") != 1:
        raise ValueError("unknown ratings snapshot version")
    known = {source["id"]: source for source in sources}
    for entry in snapshot.get("sources", []):
        clean = validated(entry)
        previous = known.get(clean["id"])
        if previous and clean["checkedAt"] >= previous["checkedAt"]:
            previous.update(clean)
    return sources


def load_sources():
    sources = json.loads(CONFIG.read_text())["sources"]
    for source in sources:
        validated(source)
    if SNAPSHOT.exists():
        sources = merge_snapshot(sources, json.loads(SNAPSHOT.read_text()))
    return sources


def refresh(sources, restore=False):
    if restore:
        try:
            sources = merge_snapshot(sources, json.loads(download(PUBLISHED, {"supovtim-byte.github.io"})))
        except Exception as error:
            print("Ratings: retaining local snapshot:", str(error))
    def fetch(source):
        try:
            rating, count = parse_source(source["id"], download(source["url"], HOSTS[source["id"]]))
            current = validated(dict(id=source["id"], rating=rating, reviewCount=count, checkedAt=date.today().isoformat()))
            print(source["id"], "rating:", current["rating"], "reviews:", count)
            return dict(source, **current)
        except Exception as error:
            print(source["id"], "retaining previous rating:", str(error))
            return source
    with ThreadPoolExecutor(max_workers=4) as executor:
        return list(executor.map(fetch, sources))


def review_label(count):
    return "отзыв" if count % 10 == 1 and count % 100 != 11 else "отзыва" if 2 <= count % 10 <= 4 and not 12 <= count % 100 <= 14 else "отзывов"


def render(sources):
    cards = []
    for source in sources:
        score = str(Decimal(str(source["rating"])).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
        count = source["reviewCount"]
        cards.append(f'''        <li><a class="clinic-rating-card" href="{escape(source['url'], quote=True)}" target="_blank" rel="noopener" data-rating-source="{escape(source['id'], quote=True)}">
          <span class="clinic-rating-score"><span class="clinic-rating-value">{score}</span></span>
          <h3 class="clinic-rating-name">{escape(source['name'])}</h3>
          <span class="clinic-rating-count">{count:,} {review_label(count)}</span>
        </a></li>'''.replace(f"{count:,}", f"{count:,}".replace(",", "\u00a0")))
    return f'''{START}
    <section class="section section-shell clinic-ratings" id="clinic-ratings" aria-labelledby="clinic-ratings-title">
      <div class="section-heading">
        <h2 id="clinic-ratings-title">Оценки пациентов на независимых площадках</h2>
      </div>
      <ul class="clinic-ratings-grid">
{chr(10).join(cards)}
      </ul>
    </section>
    {END}'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--restore", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sources = load_sources()
    if args.refresh:
        sources = refresh(sources, args.restore)
    snapshot = {"version": 1, "sources": [validated(source) for source in sources]}
    if not args.check:
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    page = ROOT / "dist/index.html"
    before = page.read_text()
    if START not in before or END not in before:
        raise ValueError("homepage ratings markers are missing")
    after = re.sub(re.escape(START) + r'[\s\S]*?' + re.escape(END), lambda _: render(sources), before, count=1)
    if args.check:
        if after != before:
            raise SystemExit("Regenerate clinic ratings: npm run build")
    else:
        page.write_text(after)
    print("Verified clinic ratings." if args.check else "Generated clinic ratings.")


if __name__ == "__main__":
    main()
