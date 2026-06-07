from __future__ import annotations

from cassandra.query import PreparedStatement

from dal.connection import get_session


class AnalyticsRepository:
    _SELECT_TOTALS = "SELECT asset_id, business_date_year, cnt FROM totals"
    _SELECT_TOTALS_BY_ASSET = "SELECT asset_id, business_date_year, cnt FROM totals WHERE asset_id = ?"
    _SELECT_REGRESSION = "SELECT seconds, open, prediction FROM regression_results LIMIT 500"

    def __init__(self) -> None:
        self._session = get_session()
        self._stmt_totals_by_asset: PreparedStatement = self._session.prepare(
            self._SELECT_TOTALS_BY_ASSET
        )

    def get_totals(self, asset_id: str | None = None) -> list[dict]:
        if asset_id:
            rows = self._session.execute(self._stmt_totals_by_asset, (asset_id,))
        else:
            rows = self._session.execute(self._SELECT_TOTALS)
        return [
            {"asset_id": r.asset_id, "year": r.business_date_year, "count": r.cnt}
            for r in rows
        ]

    def get_regression_results(self) -> list[dict]:
        rows = self._session.execute(self._SELECT_REGRESSION)
        return [
            {"seconds": r.seconds, "open": r.open, "prediction": r.prediction}
            for r in rows
        ]
