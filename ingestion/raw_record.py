from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass
class RawRecord:
    """A single row exactly as returned by the provider API."""
    ticker: str
    record_date: date
    columns: list[str]
    row: list[Any]
    provider_id: str  # e.g. "NASDAQ-DATA-LINK"
    dataset_code: str  # e.g. "QDL/BITFINEX"

    def as_dict(self) -> dict[str, Any]:
        return dict(zip(self.columns, self.row))


@dataclass
class ProviderPage:
    """One page of raw records from a paginated endpoint."""
    records: list[RawRecord]
    next_cursor: str | None  # None = no more pages
    columns: list[str]
    dataset_code: str
    provider_id: str
