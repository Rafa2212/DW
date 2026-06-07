from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator

from cassandra.concurrent import execute_concurrent_with_args
from cassandra.query import PreparedStatement

from dal.connection import get_session
from dal.models import Asset


class AssetRepository:
    _INSERT = """
        INSERT INTO asset (id, system_date, name, description, attributes)
        VALUES (?, ?, ?, ?, ?)
    """
    _SELECT_ALL_IDS = "SELECT id FROM asset"
    _SELECT_BY_ID = "SELECT * FROM asset WHERE id = ?"

    def __init__(self) -> None:
        self._session = get_session()
        self._stmt_insert: PreparedStatement = self._session.prepare(self._INSERT)
        self._stmt_by_id: PreparedStatement = self._session.prepare(self._SELECT_BY_ID)

    def upsert(self, asset: Asset) -> None:
        """Insert a new temporal version of an asset."""
        self._session.execute(
            self._stmt_insert,
            (
                asset.id,
                asset.system_date,
                asset.name,
                asset.description,
                asset.attributes,
            ),
        )

    def upsert_batch(self, assets: list[Asset]) -> None:
        """Batch-insert multiple asset versions (reduces round-trips)."""
        params = [
            (a.id, a.system_date, a.name, a.description, a.attributes) for a in assets
        ]
        execute_concurrent_with_args(self._session, self._stmt_insert, params, concurrency=20)

    def get_all_ids(self, offset: int = 0, limit: int = 20) -> list[str]:
        """Return a deduplicated, sorted page of asset IDs."""
        rows = self._session.execute(self._SELECT_ALL_IDS)
        ids = sorted({row.id for row in rows})
        return ids[offset : offset + limit]

    def get_by_id(self, asset_id: str) -> list[Asset]:
        """Return all temporal versions for an asset (newest first)."""
        rows = self._session.execute(self._stmt_by_id, (asset_id,))
        return [
            Asset(
                id=r.id,
                system_date=r.system_date,
                name=r.name or "",
                description=r.description or "",
                attributes=dict(r.attributes) if r.attributes else {},
            )
            for r in rows
        ]

    def mark_deleted(self, asset_id: str) -> None:
        """Temporal deletion: insert a marker record."""
        now = datetime.now(timezone.utc)
        marker = Asset(
            id=asset_id,
            system_date=now,
            attributes={"deleted": "true"},
        )
        self.upsert(marker)
