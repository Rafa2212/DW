from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from dal.models import TimeSeriesPoint
from dal.repositories.time_series_repo import _deduplicate_latest


class TestDeduplicateLatest:
    def _point(self, bd: date, sd: datetime) -> TimeSeriesPoint:
        return TimeSeriesPoint(
            asset_id="A",
            data_source_id="DS",
            business_date_year=bd.year,
            business_date=bd,
            system_date=sd,
        )

    def test_keeps_newest_system_date(self) -> None:
        d = date(2024, 1, 1)
        old = self._point(d, datetime(2024, 3, 1, tzinfo=timezone.utc))
        new = self._point(d, datetime(2024, 6, 1, tzinfo=timezone.utc))
        result = _deduplicate_latest([old, new])
        assert len(result) == 1
        assert result[0].system_date == new.system_date

    def test_returns_newest_business_date_first(self) -> None:
        sd = datetime(2024, 6, 1, tzinfo=timezone.utc)
        p1 = self._point(date(2024, 1, 1), sd)
        p2 = self._point(date(2024, 1, 3), sd)
        p3 = self._point(date(2024, 1, 2), sd)
        result = _deduplicate_latest([p1, p2, p3])
        dates = [r.business_date for r in result]
        assert dates == sorted(dates, reverse=True)

    def test_empty_input(self) -> None:
        assert _deduplicate_latest([]) == []

    def test_deletion_marker_preserved(self) -> None:
        d = date(2024, 1, 1)
        marker = TimeSeriesPoint(
            asset_id="A",
            data_source_id="DS",
            business_date_year=d.year,
            business_date=d,
            system_date=datetime(2024, 6, 1, tzinfo=timezone.utc),
            values_text={"deleted": "true"},
        )
        result = _deduplicate_latest([marker])
        assert result[0].is_deleted
