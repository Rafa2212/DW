from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AssetIdPage(BaseModel):
    items: list[str]
    offset: int
    limit: int
    total_returned: int


class AssetDetail(BaseModel):
    id: str
    system_date: datetime
    name: str
    description: str
    attributes: dict[str, str]


class DataSourceIdPage(BaseModel):
    items: list[str]
    offset: int
    limit: int
    total_returned: int


class DataSourceDetail(BaseModel):
    id: str
    system_date: datetime
    name: str
    description: str
    attributes: list[str]


class TimeSeriesRecord(BaseModel):
    businessDate: str
    values: dict[str, Any]


class TimeSeriesResponse(BaseModel):
    assetId: str
    dataSourceId: str
    records: list[TimeSeriesRecord]
    attributes: list[str] | None = None


class IngestionRequest(BaseModel):
    bitfinex_tickers: list[str] | None = None
    fx_pairs: list[str] | None = None
    yahoo_stocks: list[str] | None = None
    start_date: str | None = None  # YYYY-MM-DD
    end_date: str | None = None    # YYYY-MM-DD


class IngestionResponse(BaseModel):
    status: str
    data_sources_stored: int
    assets_stored: int
    ts_points_stored: int
    skipped: int
    errors: list[str]
