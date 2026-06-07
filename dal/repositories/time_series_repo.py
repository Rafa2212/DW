from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterator

from cassandra.concurrent import execute_concurrent_with_args
from cassandra.query import PreparedStatement

from dal.connection import get_session
from dal.models import TimeSeriesPoint


class TimeSeriesRepository:
    _INSERT = """
        INSERT INTO data (
            asset_id, data_source_id, business_date_year,
            business_date, system_date,
            values_double, values_int, values_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    # Fetch range for one year partition — ordered business_date ASC, system_date DESC
    _SELECT_RANGE = """
        SELECT * FROM data
        WHERE asset_id = ?
          AND data_source_id = ?
          AND business_date_year = ?
          AND business_date >= ?
          AND business_date < ?
    """

    def __init__(self) -> None:
        self._session = get_session()
        self._stmt_insert: PreparedStatement = self._session.prepare(self._INSERT)
        self._stmt_range: PreparedStatement = self._session.prepare(self._SELECT_RANGE)

    def insert(self, point: TimeSeriesPoint) -> None:
        self._session.execute(
            self._stmt_insert,
            (
                point.asset_id,
                point.data_source_id,
                point.business_date_year,
                point.business_date,
                point.system_date,
                point.values_double or {},
                point.values_int or {},
                point.values_text or {},
            ),
        )

    def insert_batch(self, points: list[TimeSeriesPoint]) -> None:
        """Concurrent insert to reduce round-trips for large batches."""
        params = [
            (
                p.asset_id,
                p.data_source_id,
                p.business_date_year,
                p.business_date,
                p.system_date,
                p.values_double or {},
                p.values_int or {},
                p.values_text or {},
            )
            for p in points
        ]
        execute_concurrent_with_args(
            self._session, self._stmt_insert, params, concurrency=50
        )

    def get_range(
        self,
        asset_id: str,
        data_source_id: str,
        start_date: date,
        end_date: date,
    ) -> list[TimeSeriesPoint]:
        """
        Return time-series records in [start_date, end_date).
        Spans multiple year partitions when needed.
        Only the most-recent system_date per business_date is returned
        (latest temporal version).
        """
        years = range(start_date.year, end_date.year + 1)
        raw: list[TimeSeriesPoint] = []
        for year in years:
            rows = self._session.execute(
                self._stmt_range,
                (asset_id, data_source_id, year, start_date, end_date),
            )
            for r in rows:
                raw.append(
                    TimeSeriesPoint(
                        asset_id=r.asset_id,
                        data_source_id=r.data_source_id,
                        business_date_year=r.business_date_year,
                        business_date=r.business_date,
                        system_date=r.system_date,
                        values_double=dict(r.values_double) if r.values_double else {},
                        values_int=dict(r.values_int) if r.values_int else {},
                        values_text=dict(r.values_text) if r.values_text else {},
                    )
                )

        return _deduplicate_latest(raw)

    def mark_deleted(
        self,
        asset_id: str,
        data_source_id: str,
        from_date: date,
    ) -> None:
        """Temporal deletion marker starting from from_date."""
        now = datetime.now(timezone.utc)
        point = TimeSeriesPoint(
            asset_id=asset_id,
            data_source_id=data_source_id,
            business_date_year=from_date.year,
            business_date=from_date,
            system_date=now,
            values_text={"deleted": "true"},
        )
        self.insert(point)


def _deduplicate_latest(points: list[TimeSeriesPoint]) -> list[TimeSeriesPoint]:
    """Keep only the newest system_date per business_date, newest business_date first."""
    seen: dict[date, TimeSeriesPoint] = {}
    for p in points:
        if p.business_date not in seen or p.system_date > seen[p.business_date].system_date:
            seen[p.business_date] = p
    # Return in descending business_date order (newest first, as per API spec)
    return sorted(seen.values(), key=lambda x: x.business_date, reverse=True)
