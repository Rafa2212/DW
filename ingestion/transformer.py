from __future__ import annotations

import logging
from datetime import datetime, timezone

from dal.models import Asset, DataSource, TimeSeriesPoint
from ingestion.raw_record import ProviderPage, RawRecord

logger = logging.getLogger(__name__)

# Numeric column names that should be stored as DOUBLE
_DOUBLE_HINTS = {"open", "high", "low", "close", "last", "mid", "bid", "ask",
                 "volume", "adj. open", "adj. high", "adj. low", "adj. close",
                 "adj. volume", "ex-dividend", "split ratio", "value", "rate"}


def transform_page(page: ProviderPage, system_date: datetime) -> _TransformResult:
    """
    Convert a ProviderPage into canonical DAL objects.

    Returns a _TransformResult containing:
      - assets:       one Asset per unique ticker (upsert-safe)
      - data_source:  one DataSource for this dataset
      - ts_points:    one TimeSeriesPoint per record
    """
    # Derive data-source ID: "<PROVIDER>.<DATASET_CODE>"
    ds_id = f"{page.provider_id}.{page.dataset_code}"

    # Derive indicator column names (everything except 'ticker' and 'date')
    indicator_cols = [
        c for c in page.columns
        if c.lower() not in ("ticker", "date", "symbol", "code")
    ]

    data_source = DataSource(
        id=ds_id,
        system_date=system_date,
        name=f"{page.provider_id} – {page.dataset_code}",
        description=f"Financial time-series from {page.provider_id} dataset {page.dataset_code}",
        attributes=set(indicator_cols),
    )

    seen_tickers: set[str] = set()
    assets: list[Asset] = []
    ts_points: list[TimeSeriesPoint] = []
    skipped = 0

    for record in page.records:
        ticker = record.ticker

        if ticker not in seen_tickers:
            seen_tickers.add(ticker)
            asset_id = _build_asset_id(page.dataset_code, ticker)
            assets.append(
                Asset(
                    id=asset_id,
                    system_date=system_date,
                    name=ticker,
                    description=f"{ticker} from {page.dataset_code}",
                    attributes={
                        "symbol": ticker,
                        "dataset": page.dataset_code,
                        "provider": page.provider_id,
                    },
                )
            )

        point = _record_to_ts_point(record, page.dataset_code, ds_id, system_date, indicator_cols)
        if point is None:
            skipped += 1
            continue
        ts_points.append(point)

    logger.debug(
        "Transformed page: %d assets, %d ts_points, %d skipped",
        len(assets),
        len(ts_points),
        skipped,
    )
    return _TransformResult(
        assets=assets,
        data_source=data_source,
        ts_points=ts_points,
        skipped=skipped,
    )


def _record_to_ts_point(
    record: RawRecord,
    dataset_code: str,
    ds_id: str,
    system_date: datetime,
    indicator_cols: list[str],
) -> TimeSeriesPoint | None:
    row_dict = record.as_dict()
    asset_id = _build_asset_id(dataset_code, record.ticker)

    values_double: dict[str, float] = {}
    values_int: dict[str, int] = {}
    values_text: dict[str, str] = {}

    for col in indicator_cols:
        raw = row_dict.get(col)
        if raw is None:
            continue
        if _is_double_col(col):
            try:
                values_double[col] = float(raw)
            except (TypeError, ValueError):
                values_text[col] = str(raw)
        elif isinstance(raw, int):
            values_int[col] = raw
        elif isinstance(raw, float):
            values_double[col] = raw
        else:
            try:
                values_double[col] = float(raw)
            except (TypeError, ValueError):
                values_text[col] = str(raw)

    return TimeSeriesPoint(
        asset_id=asset_id,
        data_source_id=ds_id,
        business_date_year=record.record_date.year,
        business_date=record.record_date,
        system_date=system_date,
        values_double=values_double,
        values_int=values_int,
        values_text=values_text,
    )


def _build_asset_id(dataset_code: str, ticker: str) -> str:
    """e.g. 'QDL/BITFINEX' + 'BTCUSD' → 'QDL/BITFINEX/BTCUSD'"""
    return f"{dataset_code}/{ticker}"


def _is_double_col(name: str) -> bool:
    return name.lower() in _DOUBLE_HINTS


class _TransformResult:
    def __init__(
        self,
        assets: list[Asset],
        data_source: DataSource,
        ts_points: list[TimeSeriesPoint],
        skipped: int,
    ) -> None:
        self.assets = assets
        self.data_source = data_source
        self.ts_points = ts_points
        self.skipped = skipped
