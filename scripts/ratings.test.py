"""Source contract checks: clinic aggregates must not use competitors or ratings-only counts."""
import json
from unittest import TestCase, main
from unittest.mock import patch
from ratings import merge_snapshot, parse_source, refresh, render, review_label, star_fill_percent, validated


class RatingsTests(TestCase):
    def test_yandex_selects_the_correct_clinic_and_text_reviews(self):
        state = {"stack": [{"results": {"items": [
            {"id": "competitor", "ratingData": {"ratingValue": 1, "reviewCount": 999}},
            {"id": "1132881772", "ratingData": {"ratingValue": 4.8, "ratingCount": 400, "reviewCount": 120}},
        ]}}]}
        html = '<script class="state-view">' + json.dumps(state) + '</script>'
        self.assertEqual(parse_source("yandex", html), (4.8, 120))

    def test_2gis_uses_review_tab_not_ratings_or_competitors(self):
        html = '''<link href="https://2gis.ru/spb/firm/5348552838508509/tab/reviews" rel="canonical">
        <h1>Метелица</h1>Стоматологическая клиника <span>4.6</span>88 оценок
        Контакты Инфо <a>Отзывы <span>59</span></a> Цены 1 Фото 78
        Похожие организации: Конкурент 5.0 1000 оценок Отзывы 300'''
        self.assertEqual(parse_source("2gis", html), ("4.6", 59))
        with_ad = html.replace("Контакты Инфо", "Реклама Конкурент 5.0 100 отзывов Контакты Инфо")
        self.assertEqual(parse_source("2gis", with_ad), ("4.6", 59))
        with self.assertRaises(ValueError):
            parse_source("2gis", html.replace("5348552838508509", "another"))

    def test_aggregate_excludes_individual_reviews(self):
        html = '''<div itemprop="reviewRating"><meta itemprop="ratingValue" content="1"></div>
        <div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
        <meta itemprop="ratingValue" content="4.5"><meta itemprop="ratingCount" content="53">
        <meta itemprop="reviewCount" content = "15"></div>'''
        for source in ["zoon", "otzovik"]:
            self.assertEqual(parse_source(source, html), ("4.5", 15))
        with self.assertRaises(ValueError):
            parse_source("zoon", html.replace('itemprop="aggregateRating"', 'class="unavailable"'))

    def test_failure_preserves_the_last_verified_value(self):
        source = dict(id="yandex", name="Яндекс Карты", url="https://example.test", rating=4.9, reviewCount=500, checkedAt="2026-11-20")
        with patch("ratings.download", side_effect=TimeoutError("source unavailable")):
            self.assertEqual(refresh([source]), [source])
        newer = dict(source, rating=5, reviewCount=510, checkedAt="2026-11-27", url="https://untrusted.test")
        merged = merge_snapshot([dict(source)], {"version": 1, "sources": [newer]})
        self.assertEqual(merged[0]["reviewCount"], 510)
        self.assertEqual(merged[0]["url"], source["url"])

    def test_validation_and_count_labels(self):
        for count, word in [(1, "отзыв"), (2, "отзыва"), (11, "отзывов"), (22, "отзыва"), (111, "отзывов"), (674, "отзыва")]:
            self.assertEqual(review_label(count), word)
        with self.assertRaises(ValueError):
            validated(dict(id="zoon", rating=7, reviewCount=53, checkedAt="2026-11-27"))
        with self.assertRaises(ValueError):
            validated(dict(id="zoon", rating=4, reviewCount=53.5, checkedAt="2026-11-27"))
        html = render([dict(id="otzovik", name="Отзовик", url="https://otzovik.com/", rating=3.61, reviewCount=23)])
        self.assertIn('data-rating="3.6"', html)
        self.assertIn('aria-label="Рейтинг 3.6 из 5"', html)
        self.assertIn("23 отзыва", html)

    def test_fractional_fill_uses_star_ink_bounds_instead_of_the_whole_row(self):
        self.assertEqual(star_fill_percent(5), "100")
        self.assertEqual(star_fill_percent(0), "0")
        stop = float(star_fill_percent("4.5")) / 100 * 218
        self.assertAlmostEqual(stop, 199.4235005, places=5)
        self.assertGreater(float(star_fill_percent("4.6")), float(star_fill_percent("4.5")))


if __name__ == "__main__":
    main()
