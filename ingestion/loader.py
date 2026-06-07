from __future__ import annotations

import logging

from dal.repositories import AssetRepository, DataSourceRepository, TimeSeriesRepository
from dal.models import Asset, DataSource, TimeSeriesPoint
from ingestion.transformer import _TransformResult

logger = logging.getLogger(__name__)

_BATCH_SIZE = 200  # rows per Cassandra batch


class Loader:
    """Persists transformed objects into Cassandra."""

    def __init__(self) -> None:
        self._asset_repo = AssetRepository()
        self._ds_repo = DataSourceRepository()
        self._ts_repo = TimeSeriesRepository()

    def load(self, result: _TransformResult) -> _LoadStats:
        stats = _LoadStats()

        # 1. Upsert data source (create-if-missing is idempotent in Cassandra)
        self._ds_repo.upsert(result.data_source)
        stats.data_sources_stored += 1

        # 2. Upsert assets in batch
        if result.assets:
            # Deduplicate: keep one entry per ticker (they're all identical here)
            seen: dict[str, Asset] = {a.id: a for a in result.assets}
            self._asset_repo.upsert_batch(list(seen.values()))
            stats.assets_stored += len(seen)

        # 3. Store time-series in batches
        for i in range(0, len(result.ts_points), _BATCH_SIZE):
            chunk = result.ts_points[i : i + _BATCH_SIZE]
            self._ts_repo.insert_batch(chunk)
            stats.ts_points_stored += len(chunk)

        stats.skipped = result.skipped
        return stats


class _LoadStats:
    def __init__(self) -> None:
        self.data_sources_stored = 0
        self.assets_stored = 0
        self.ts_points_stored = 0
        self.skipped = 0

    def __iadd__(self, other: "_LoadStats") -> "_LoadStats":
        self.data_sources_stored += other.data_sources_stored
        self.assets_stored += other.assets_stored
        self.ts_points_stored += other.ts_points_stored
        self.skipped += other.skipped
        return self

    def __repr__(self) -> str:
        return (
            f"LoadStats(data_sources={self.data_sources_stored}, "
            f"assets={self.assets_stored}, "
            f"ts_points={self.ts_points_stored}, "
            f"skipped={self.skipped})"
        )
