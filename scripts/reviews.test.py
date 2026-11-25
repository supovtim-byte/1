import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("collect_reviews", Path(__file__).with_name("collect-reviews.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ReviewCollectorTest(unittest.TestCase):
    def test_yandex_links_to_the_clinic_review_by_author(self):
        item = {
            "businessId": collector.YANDEX_ORG,
            "author": {"publicId": "reviewauthor12345678", "name": "Анна"},
            "text": "Проверочный отзыв\nВторой абзац",
            "updatedTime": "2026-11-25T02:00:00Z",
            "rating": 4,
        }
        entity = {
            "id": collector.YANDEX_ORG,
            "reviewResults": {"reviews": [item, {**item, "businessId": "another-clinic"}]},
        }
        state = {"stack": [{"results": {"items": [entity]}}]}
        html = f'<script type="application/json" class="state-view">{json.dumps(state)}</script>'
        self.assertEqual(collector.yandex_reviews(html), [{
            "url": collector.YANDEX_URL + "?reviews%5BpublicId%5D=reviewauthor12345678",
            "date": "2026-11-25",
            "author": "Анна",
            "text": "Проверочный отзыв\nВторой абзац",
            "excerpt": "Проверочный отзыв Второй абзац",
            "rating": 4,
        }])

    def test_only_unambiguous_mentions_of_current_doctors_can_link_a_clinic_review(self):
        doctors = [
            {"id": "first", "name": "Орлова Анна Олеговна", "publication": {"catalog": True}},
            {"id": "second", "name": "Соколова Анна Олеговна", "publication": {"catalog": False}},
        ]
        self.assertEqual(collector.doctor_mentions(doctors), {
            " орлова анна ": "first", " анна орлова ": "first",
        })

    def test_startsmile_extracts_text_and_links_to_the_review_anchor(self):
        html = """
        <h1>Профиль</h1>
        <li class="doc-main__feedbacks__item hreview " id="review1234">
          <span class="dtreviewed">2026-11-25 11:00:00</span>
          <div class="best__c-b-r-count value">4.0</div>
          <div class="reviewer vcard"><a class="url fn">Ирина</a></div>
          <div class="doc-main__feedbacks__item-text description">Первый &amp; второй<br>абзац</div>
        </li>
        """
        url = collector.STARTSMILE_CLINIC
        self.assertEqual(collector.startsmile_reviews(html, url), [{
            "url": url + "#review1234",
            "date": "2026-11-25",
            "author": "Ирина",
            "text": "Первый & второй\nабзац",
            "excerpt": "Первый & второй абзац",
            "rating": "4.0",
        }])

    def test_32top_matches_review_dates_to_their_own_anchors(self):
        item = {
            "@type": "Review", "reviewBody": "Запись прошла хорошо.\nВторой абзац.",
            "author": {"@type": "Person", "name": "Александр"},
            "datePublished": "2026-11-25", "reviewRating": {"ratingValue": 4},
        }
        html = f"""
        <script type="application/ld+json">{json.dumps({"review": [item]})}</script>
        <div id="comment_4321"><div class="js-commentText">Ответ на отзыв.</div></div>
        <div id="comment_1234"><div class="js-commentText">Запись прошла хорошо.<br>Второй абзац.</div></div>
        """
        self.assertEqual(collector.top32_reviews(html), [{
            "url": collector.TOP32_CLINIC + "#comment_1234", "date": "2026-11-25",
            "author": "Александр", "text": "Запись прошла хорошо.\nВторой абзац.",
            "excerpt": "Запись прошла хорошо. Второй абзац.",
            "rating": 4,
        }])

    def test_rating_filter_and_manual_selection(self):
        url = collector.TOP32_CLINIC
        cards = [
            {"url": f"{url}#comment_{index}", "date": "2026-11-25", "rating": rating}
            for index, rating in enumerate([1, 2, 3, 4, 5, None], start=1)
        ]
        self.assertEqual(
            collector.latest(cards, {"hide": set(), "show": set()}),
            [{field: value for field, value in card.items() if field != "rating"} for card in cards[2:5]],
        )
        rules = {
            "hide": {collector.review_key(f"{url}#comment_4")},
            "show": {collector.review_key(f"{url}?utm_source=share#comment_2"), collector.review_key(f"{url}#comment_4")},
        }
        self.assertEqual(collector.latest(cards, rules), [
            {"url": f"{url}#comment_2", "date": "2026-11-25", "manualOnly": True},
            {"url": f"{url}#comment_3", "date": "2026-11-25"},
            {"url": f"{url}#comment_5", "date": "2026-11-25"},
        ])

    def test_restored_snapshot_rechecks_manual_rules_and_discards_unfiltered_versions(self):
        url = collector.YANDEX_URL
        hidden = f"{url}?reviews%5BpublicId%5D=hiddenauthor1234"
        previously_selected = f"{url}?reviews%5BpublicId%5D=manualauthor1234"
        visible = f"{url}?reviews%5BpublicId%5D=visibleauthor1234"
        hidden_share_url = hidden.replace("yandex.ru", "yandex.com") + "&utm_source=review"
        rules = {"hide": {collector.review_key(hidden_share_url)}, "show": set()}
        groups = {"yandex:clinic": [{"url": hidden}, {"url": previously_selected, "manualOnly": True}, {"url": visible}]}
        self.assertEqual(collector.parse_snapshot(json.dumps({"version": 1, "sources": groups}), rules), {})
        self.assertEqual(
            collector.parse_snapshot(json.dumps({"version": collector.SNAPSHOT_VERSION, "sources": groups}), rules),
            {"yandex:clinic": [{"url": visible}]},
        )

    def test_rate_limit_keeps_previous_cards_for_the_source(self):
        older = {"startsmile:clinic": [{"url": "previous"}], "startsmile:doctor": [{"url": "previous-doctor"}]}
        sources = {
            "startsmile:clinic": collector.STARTSMILE_CLINIC,
            "startsmile:doctor": "https://spb.startsmile.ru/stomatologi/doctor.html",
            "yandex:clinic": collector.YANDEX_URL,
        }
        throttled = HTTPError(collector.STARTSMILE_CLINIC, 429, "Too Many Requests", None, None)
        with patch.object(collector, "refresh", side_effect=[throttled, {"yandex:clinic": [{"url": "fresh"}]}]) as refresh:
            result = collector.collect(sources, older, {"hide": set(), "show": set()})
            self.assertEqual(result, {**older, "yandex:clinic": [{"url": "fresh"}]})
            self.assertEqual(refresh.call_count, 2)


if __name__ == "__main__":
    unittest.main()
