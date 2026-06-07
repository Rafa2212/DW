from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from dal.repositories import TimeSeriesRepository, DataSourceRepository
from api.schemas import TimeSeriesResponse, TimeSeriesRecord

router = APIRouter()

_MAX_DATE_RANGE_DAYS = 3650  # ~10 years guard rail


@router.get(
    "/data",
    response_model=TimeSeriesResponse,
    summary="[Q5] Return time-series data for an asset and data source",
)
def get_time_series(
    assetId: str = Query(..., description="Asset identifier, e.g. QDL/BITFINEX/BTCUSD"),
    dataSourceId: str = Query(..., description="Data-source identifier, e.g. NASDAQ-DATA-LINK.QDL/BITFINEX"),
    startBusinessDate: str = Query(..., description="Start date inclusive (YYYY-MM-DD)"),
    endBusinessDate: str = Query(..., description="End date exclusive (YYYY-MM-DD)"),
    includeAttributes: bool = Query(default=False, description="Include attribute list in response"),
) -> TimeSeriesResponse:
    try:
        start = date.fromisoformat(startBusinessDate)
        end = date.fromisoformat(endBusinessDate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {exc}")

    if start >= end:
        raise HTTPException(status_code=400, detail="startBusinessDate must be before endBusinessDate")

    if (end - start).days > _MAX_DATE_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large (max {_MAX_DATE_RANGE_DAYS} days)",
        )

    ts_repo = TimeSeriesRepository()
    points = ts_repo.get_range(
        asset_id=assetId,
        data_source_id=dataSourceId,
        start_date=start,
        end_date=end,
    )

    # Filter out deletion markers
    active = [p for p in points if not p.is_deleted]

    records: list[TimeSeriesRecord] = []
    all_attr_keys: set[str] = set()

    for p in active:
        merged: dict[str, Any] = {}
        merged.update(p.values_double)
        merged.update(p.values_int)
        merged.update(p.values_text)
        all_attr_keys.update(merged.keys())
        records.append(
            TimeSeriesRecord(
                businessDate=str(p.business_date),
                values=merged,
            )
        )

    attrs: list[str] | None = None
    if includeAttributes:
        # Fetch canonical attribute list from data source metadata
        ds_repo = DataSourceRepository()
        versions = ds_repo.get_by_id(dataSourceId)
        if versions:
            attrs = sorted(versions[0].attributes)
        else:
            attrs = sorted(all_attr_keys)

    return TimeSeriesResponse(
        assetId=assetId,
        dataSourceId=dataSourceId,
        records=records,
        attributes=attrs,
    )
