from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass
class Asset:
    id: str
    system_date: datetime
    name: str = ""
    description: str = ""
    attributes: dict[str, str] = field(default_factory=dict)


@dataclass
class DataSource:
    id: str
    system_date: datetime
    name: str = ""
    description: str = ""
    attributes: set[str] = field(default_factory=set)


@dataclass
class TimeSeriesPoint:
    asset_id: str
    data_source_id: str
    business_date_year: int
    business_date: date
    system_date: datetime
    values_double: dict[str, float] = field(default_factory=dict)
    values_int: dict[str, int] = field(default_factory=dict)
    values_text: dict[str, str] = field(default_factory=dict)

    @property
    def is_deleted(self) -> bool:
        return self.values_text.get("deleted") == "true"
