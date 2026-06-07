from __future__ import annotations

from datetime import datetime, timezone

from cassandra.concurrent import execute_concurrent_with_args
from cassandra.query import PreparedStatement

from dal.connection import get_session
from dal.models import DataSource


class DataSourceRepository:
    _INSERT = """
        INSERT INTO data_source (id, system_date, name, description, attributes)
        VALUES (?, ?, ?, ?, ?)
    """
    _SELECT_ALL_IDS = "SELECT id FROM data_source"
    _SELECT_BY_ID = "SELECT * FROM data_source WHERE id = ?"

    def __init__(self) -> None:
        self._session = get_session()
        self._stmt_insert: PreparedStatement = self._session.prepare(self._INSERT)
        self._stmt_by_id: PreparedStatement = self._session.prepare(self._SELECT_BY_ID)

    def upsert(self, ds: DataSource) -> None:
        self._session.execute(
            self._stmt_insert,
            (ds.id, ds.system_date, ds.name, ds.description, ds.attributes),
        )

    def upsert_batch(self, sources: list[DataSource]) -> None:
        params = [
            (s.id, s.system_date, s.name, s.description, s.attributes) for s in sources
        ]
        execute_concurrent_with_args(self._session, self._stmt_insert, params, concurrency=20)

    def get_all_ids(self, offset: int = 0, limit: int = 20) -> list[str]:
        rows = self._session.execute(self._SELECT_ALL_IDS)
        ids = sorted({row.id for row in rows})
        return ids[offset : offset + limit]

    def get_by_id(self, source_id: str) -> list[DataSource]:
        rows = self._session.execute(self._stmt_by_id, (source_id,))
        return [
            DataSource(
                id=r.id,
                system_date=r.system_date,
                name=r.name or "",
                description=r.description or "",
                attributes=set(r.attributes) if r.attributes else set(),
            )
            for r in rows
        ]

    def mark_deleted(self, source_id: str) -> None:
        now = datetime.now(timezone.utc)
        marker = DataSource(
            id=source_id,
            system_date=now,
            attributes={"deleted"},
        )
        # Reuse insert — attributes set with 'deleted' sentinel
        self._session.execute(
            self._stmt_insert,
            (source_id, now, "", "", {"deleted"}),
        )
