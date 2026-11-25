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
TOP32_CLINIC = "https://www.32top.ru/spb/clinics/3886/comments/"
USER_AGENT = "MetelitsaReviews/1.0 (+https://github.com/supovtim-byte/1)"
MAX_BYTES = 4_000_000
CARDS_PER_SOURCE = 8
EXCERPT_LENGTH = 220

STARTSMILE_ITEM = re.compile(
    r'<li\b(?=[^>]*\bclass="[^"]*\bhreview\b[^"]*")'
    r'(?=[^>]*\bid="(?P<id>review[0-9]+)")[^>]*>',
    re.IGNORECASE,
)
TOP32_ITEM = re.compile(r'<div\b[^>]*\bid="(?P<id>comment_[0-9]+)"[^>]*>', re.IGNORECASE)


class SourceBlocked(Exception):
    pass


def download(url, allowed_hosts):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ru"})
    with urlopen(request, timeout=15) as response:
        final = urlsplit(response.url)
        if (final.scheme != "https" or final.hostname not in allowed_hosts
                or final.path.rstrip("/") != urlsplit(url).path.rstrip("/")):
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


def review(url, timestamp, author, text):
    day = date.fromisoformat(timestamp[:10]).isoformat()
    author = " ".join(author.split()) if isinstance(author, str) else ""
    full_text = "\n".join(line.rstrip() for line in text.splitlines()).strip()
    return {"url": url, "date": day, "author": author, "text": full_text, "excerpt": excerpt(full_text)}


def normalized_name(text):
    return " ".join(re.findall(r"[а-я-]+", text.lower().replace("ё", "е")))


def doctor_mentions(doctors):
    aliases = {}
    for doctor in doctors:
        parts = normalized_name(doctor["name"]).split()
        if len(parts) != 3:
            continue
        last, first, middle = parts
        for phrase in (f"{last} {first}", f"{first} {last}", f"{first} {middle}"):
            aliases.setdefault(f" {phrase} ", []).append(doctor)
    return {
        phrase: matches[0]["id"] for phrase, matches in aliases.items()
        if len(matches) == 1 and matches[0]["publication"]["catalog"]
    }


def yandex_reviews(html, mentions=None):
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
        author = item.get("author") or {}
        author_id = author.get("publicId", "")
        text = item.get("text", "")
        if (str(item.get("businessId")) != YANDEX_ORG
                or not re.fullmatch(r"[a-z0-9]{15,40}", author_id or "")
                or not isinstance(text, str) or not text.strip()):
            continue
        link = YANDEX_URL + "?" + urlencode({"reviews[publicId]": author_id})
        card = review(link, item["updatedTime"], author.get("name"), text)
        if mentions:
            normalized = f" {normalized_name(text)} "
            doctors = sorted({doctor for phrase, doctor in mentions.items() if phrase in normalized})
            if doctors:
                card["doctors"] = doctors
        cards.append(card)
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
    content = re.sub(r'<(?:br\s*/?|/p)>', '\n', result[2], flags=re.IGNORECASE)
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
        author = field(section, "reviewer")
        cards.append(review(url + "#" + match["id"], timestamp, author, text))
    if matches and not cards:
        raise ValueError("review descriptions are unavailable")
    return cards


def top32_reviews(html):
    items = {}
    scripts = re.findall(r'<script\b[^>]*\btype="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
    for script in scripts:
        data = json.loads(script)
        if isinstance(data, dict):
            for item in data.get("review", []):
                if item.get("@type") == "Review":
                    body = " ".join(unescape(item["reviewBody"]).split())
                    items[body] = item
    matches = list(TOP32_ITEM.finditer(html))
    cards = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(html)
        text = " ".join(field(html[match.end():end], "js-commentText").split())
        item = items.get(text)
        if item:
            author = (item.get("author") or {}).get("name")
            cards.append(review(f"{TOP32_CLINIC}#{match['id']}", item["datePublished"], author, unescape(item["reviewBody"])))
    if not cards:
        raise ValueError("review data and permalinks are unavailable")
    return cards


def configured_sources(doctors):
    sources = {
        "yandex:clinic": YANDEX_URL,
        "32top:clinic": TOP32_CLINIC,
        "startsmile:clinic": STARTSMILE_CLINIC,
    }
    for doctor in doctors:
        for link in doctor["reviews"]["links"]:
            source = doctor["sources"][link["sourceRef"]]
            url = urlsplit(source["url"])
            if (source["label"] == "Startsmile" and url.scheme == "https"
                    and url.netloc == "spb.startsmile.ru"
                    and re.fullmatch(r"/stomatologi/[a-z0-9_-]+\.html", url.path)):
                sources[f"startsmile:{doctor['id']}"] = f"https://{url.netloc}{url.path}"
    return sources


def latest(cards):
    unique = {card["url"]: card for card in cards}
    return sorted(unique.values(), key=lambda card: card["date"], reverse=True)[:CARDS_PER_SOURCE]


def refresh(source, mentions):
    key, url = source
    if key.startswith("yandex:"):
        cards = yandex_reviews(download(url, {"yandex.ru", "yandex.com"}), mentions)
        groups = {key: cards}
        for card in cards:
            for doctor in card.pop("doctors", []):
                groups.setdefault(f"yandex:{doctor}", []).append(card)
        return {subject: latest(entries) for subject, entries in groups.items()}
    if key == "32top:clinic":
        return {key: latest(top32_reviews(download(url, {"www.32top.ru"})))}
    return {key: latest(startsmile_reviews(download(url, {"spb.startsmile.ru"}), url))}


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


def collect(sources, previous, mentions=None):
    collected = {}
    blocked = set()
    for key, url in sources.items():
        host = urlsplit(url).hostname
        if host in blocked:
            if key in previous:
                collected[key] = previous[key]
            continue
        try:
            refreshed = refresh((key, url), mentions)
            collected.update(refreshed)
            print(f"{key}: {len(refreshed[key])} cards, {len(refreshed) - 1} doctor profiles")
        except (OSError, SourceBlocked, AttributeError, TypeError, KeyError, ValueError) as error:
            if isinstance(error, SourceBlocked) or (isinstance(error, HTTPError) and error.code in (403, 429)):
                blocked.add(host)
            if key in previous:
                collected[key] = previous[key]
            if key == "yandex:clinic":
                for doctor in sorted(set((mentions or {}).values())):
                    subject = f"yandex:{doctor}"
                    if subject in previous:
                        collected[subject] = previous[subject]
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
    doctors = [
        json.loads(filename.read_text(encoding="utf-8"))
        for filename in sorted((ROOT / "data/doctors").glob("*.json"))
    ]
    collected = collect(configured_sources(doctors), previous_sources(args.restore), doctor_mentions(doctors))
    snapshot = {"version": 1, "sources": collected}
    with TemporaryDirectory(dir=ROOT) as directory:
        temporary = Path(directory) / "reviews.json"
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(SNAPSHOT)
    print(f"Collected {sum(map(len, collected.values()))} cards from {len(collected)} pages.")


if __name__ == "__main__":
    main()
