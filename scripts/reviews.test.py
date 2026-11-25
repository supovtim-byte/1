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
            "author": {"publicId": "reviewauthor12345678"},
            "text": "Проверочный отзыв",
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
            "rating": 4,
            "excerpt": "Проверочный отзыв",
        }])

    def test_startsmile_extracts_text_and_links_to_the_review_anchor(self):
        html = """
        <h1>Профиль</h1>
        <li class="doc-main__feedbacks__item hreview " id="review1234">
          <span class="dtreviewed">2026-11-25 11:00:00</span>
          <div class="best__c-b-r-count value">4.0</div>
          <div class="doc-main__feedbacks__item-text description">Первый &amp; второй<br>абзац</div>
        </li>
        """
        url = collector.STARTSMILE_CLINIC
        self.assertEqual(collector.startsmile_reviews(html, url), [{
            "url": url + "#review1234",
            "date": "2026-11-25",
            "rating": 4,
            "excerpt": "Первый & второй абзац",
        }])

    def test_rate_limit_keeps_previous_cards_for_the_source(self):
        older = {"startsmile:clinic": [{"url": "previous"}], "startsmile:doctor": [{"url": "previous-doctor"}]}
        sources = {
            "startsmile:clinic": collector.STARTSMILE_CLINIC,
            "startsmile:doctor": "https://spb.startsmile.ru/stomatologi/doctor.html",
            "yandex:clinic": collector.YANDEX_URL,
        }
        throttled = HTTPError(collector.STARTSMILE_CLINIC, 429, "Too Many Requests", None, None)
        with patch.object(collector, "refresh", side_effect=[throttled, [{"url": "fresh"}]]) as refresh:
            self.assertEqual(collector.collect(sources, older), {**older, "yandex:clinic": [{"url": "fresh"}]})
            self.assertEqual(refresh.call_count, 2)


if __name__ == "__main__":
    unittest.main()
