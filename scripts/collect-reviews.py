#!/usr/bin/env python3
"""Refresh review cards from the public pages that expose permalinks."""

import argparse
from datetime import date
from html import unescape
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "dist/reviews.json"
PUBLISHED_SNAPSHOT = "https://supovtim-byte.github.io/1/reviews.json"
YANDEX_ORG = "1132881772"
YANDEX_URL = f"https://yandex.ru/maps/org/metelitsa/{YANDEX_ORG}/reviews/"
STARTSMILE_CLINIC = "https://spb.startsmile.ru/stomatologii/metelitsa-otzyvy.html"
USER_AGENT = "MetelitsaReviews/1.0 (+https://github.com/supovtim-byte/1)"
MAX_BYTES = 4_000_000
CARDS_PER_SOURCE = 8
EXCERPT_LENGTH = 220

STARTSMILE_ITEM = re.compile(
    r'<li\b(?=[^>]*\bclass="[^"]*\bhreview\b[^"]*")'
    r'(?=[^>]*\bid="(?P<id>review[0-9]+)")[^>]*>',
    re.IGNORECASE,
)


class SourceBlocked(Exception):
    pass


def download(url, allowed_hosts):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ru"})
    with urlopen(request, timeout=15) as response:
        final = urlsplit(response.url)
        if final.scheme != "https" or final.hostname not in allowed_hosts:
            raise ValueError("unexpected destination")
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("response is too large")
        return body.decode(response.headers.get_content_charset() or "utf-8")


def excerpt(value):
    value = " ".join(value.split())
    if len(value) <= EXCERPT_LENGTH:
        return value
    return value[:EXCERPT_LENGTH].rsplit(" ", 1)[0] + "…"


def review(url, timestamp, rating, text):
    day = date.fromisoformat(timestamp[:10]).isoformat()
    if rating is not None and not 1 <= rating <= 5:
        raise ValueError("invalid rating")
    return {"url": url, "date": day, "rating": rating, "excerpt": excerpt(text)}


def yandex_reviews(html):
    state_tag = re.search(
        r'<script\b[^>]*\bclass="state-view"[^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not state_tag:
        raise ValueError("review data is unavailable")
    state = json.loads(state_tag[1])
    items = (
        item
        for view in state["stack"]
        for item in view.get("results", {}).get("items", [])
    )
    organization = next((item for item in items if str(item.get("id")) == YANDEX_ORG), None)
    if organization is None:
        raise ValueError("organization was not found")
    reviews = organization["reviewResults"]["reviews"]
    cards = []
    for item in reviews:
        author_id = item.get("author", {}).get("publicId", "")
        text = item.get("text", "")
        if (str(item.get("businessId")) != YANDEX_ORG
                or not re.fullmatch(r"[a-z0-9]{15,40}", author_id or "")
                or not isinstance(text, str) or not text.strip()):
            continue
        link = YANDEX_URL + "?" + urlencode({"reviews[publicId]": author_id})
        cards.append(review(link, item["updatedTime"], item["rating"], text))
    if reviews and not cards:
        raise ValueError("review permalinks are unavailable")
    return cards


def field(html, class_name):
    result = re.search(
        rf'<(?P<tag>div|span)\b[^>]*\bclass="[^"]*\b{re.escape(class_name)}\b[^"]*"[^>]*>'
        r'(.*?)</(?P=tag)>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if not result:
        return ""
    content = re.sub(r'<(?:br\s*/?|/p)>', ' ', result[2], flags=re.IGNORECASE)
    return unescape(re.sub(r'<[^>]+>', '', content)).strip()


def startsmile_reviews(html, url):
    matches = list(STARTSMILE_ITEM.finditer(html))
    if not matches and 'noindex, noarchive' in html[:500].lower():
        raise SourceBlocked("review page was replaced by a verification page")
    if not matches and not re.search(r'<h1\b[^>]*>.*?</h1>', html, re.DOTALL):
        raise ValueError("profile page is unavailable")
    cards = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(html)
        section = html[match.end():end]
        text = field(section, "description")
        if not text:
            continue
        timestamp = field(section, "dtreviewed")
        rating = field(section, "best__c-b-r-count")
        cards.append(review(url + "#" + match["id"], timestamp, float(rating) if rating else None, text))
    if matches and not cards:
        raise ValueError("review descriptions are unavailable")
    return cards


def configured_sources():
    sources = {"yandex:clinic": YANDEX_URL, "startsmile:clinic": STARTSMILE_CLINIC}
    for filename in sorted((ROOT / "data/doctors").glob("*.json")):
        doctor = json.loads(filename.read_text(encoding="utf-8"))
        for link in doctor["reviews"]["links"]:
            source = doctor["sources"][link["sourceRef"]]
            url = urlsplit(source["url"])
            if (source["label"] == "Startsmile" and url.scheme == "https"
                    and url.netloc == "spb.startsmile.ru"
                    and re.fullmatch(r"/stomatologi/[a-z0-9_-]+\.html", url.path)):
                sources[f"startsmile:{doctor['id']}"] = f"https://{url.netloc}{url.path}"
    return sources


def refresh(source):
    key, url = source
    if key.startswith("yandex:"):
        cards = yandex_reviews(download(url, {"yandex.ru", "yandex.com"}))
    else:
        cards = startsmile_reviews(download(url, {"spb.startsmile.ru"}), url)
    unique = {card["url"]: card for card in cards}
    return sorted(unique.values(), key=lambda card: card["date"], reverse=True)[:CARDS_PER_SOURCE]


def parse_snapshot(payload):
    snapshot = json.loads(payload)
    if snapshot["version"] != 1 or not isinstance(snapshot["sources"], dict):
        raise ValueError("unsupported snapshot format")
    return {key: cards for key, cards in snapshot["sources"].items() if isinstance(cards, list)}


def previous_sources(restore):
    if restore:
        try:
            return parse_snapshot(download(PUBLISHED_SNAPSHOT, {"supovtim-byte.github.io"}))
        except HTTPError as error:
            if error.code != 404:
                print(f"::warning::Published review snapshot returned HTTP {error.code}")
        except (OSError, TypeError, KeyError, ValueError) as error:
            print(f"::warning::Published review snapshot is unavailable ({type(error).__name__})")
    if SNAPSHOT.exists():
        return parse_snapshot(SNAPSHOT.read_text(encoding="utf-8"))
    return {}


def collect(sources, previous):
    collected = {}
    blocked = set()
    for key, url in sources.items():
        host = urlsplit(url).hostname
        if host in blocked:
            if key in previous:
                collected[key] = previous[key]
            continue
        try:
            collected[key] = refresh((key, url))
            print(f"{key}: {len(collected[key])} cards")
        except (OSError, SourceBlocked, AttributeError, TypeError, KeyError, ValueError) as error:
            if isinstance(error, SourceBlocked) or (isinstance(error, HTTPError) and error.code in (403, 429)):
                blocked.add(host)
            if key in previous:
                collected[key] = previous[key]
            if isinstance(error, HTTPError):
                reason = f"HTTP {error.code}"
            elif isinstance(error, SourceBlocked):
                reason = str(error)
            else:
                reason = type(error).__name__
            print(f"::warning::{key}: refresh unavailable ({reason})")
    return collected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--restore", action="store_true", help="restore the last GitHub Pages snapshot")
    args = parser.parse_args()
    collected = collect(configured_sources(), previous_sources(args.restore))
    snapshot = {"version": 1, "sources": collected}
    with TemporaryDirectory(dir=ROOT) as directory:
        temporary = Path(directory) / "reviews.json"
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(SNAPSHOT)
    print(f"Collected {sum(map(len, collected.values()))} cards from {len(collected)} pages.")


if __name__ == "__main__":
    main()
