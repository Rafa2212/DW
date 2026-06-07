from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ingestion.pipeline import run_ingestion
from api.schemas import IngestionRequest, IngestionResponse

router = APIRouter()


@router.post(
    "/ingest",
    response_model=IngestionResponse,
    summary="[UC1] Trigger data ingestion from Nasdaq Data Link",
)
def trigger_ingestion(request: IngestionRequest) -> IngestionResponse:
    """
    Runs the ETL pipeline synchronously.
    For production use, move this to a background task queue.
    """
    start: date | None = None
    end: date | None = None
    try:
        if request.start_date:
            start = date.fromisoformat(request.start_date)
        if request.end_date:
            end = date.fromisoformat(request.end_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date: {exc}")

    result = run_ingestion(
        bitfinex_tickers=request.bitfinex_tickers,
        ecb_pairs=request.fx_pairs,
        yahoo_stocks=request.yahoo_stocks,
        start_date=start,
        end_date=end,
    )
    return IngestionResponse(**result)
