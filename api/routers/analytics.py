from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from dal.repositories.analytics_repo import AnalyticsRepository
from dal.repositories.time_series_repo import TimeSeriesRepository

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_date(s: str, name: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date '{s}' for {name} (YYYY-MM-DD)")


def _load_series(asset_id: str, data_source_id: str, start: date, end: date) -> list[dict[str, Any]]:
    repo = TimeSeriesRepository()
    points = repo.get_range(asset_id=asset_id, data_source_id=data_source_id,
                            start_date=start, end_date=end)
    active = [p for p in points if not p.is_deleted]
    # oldest-first for time-ordered computations
    active.sort(key=lambda p: str(p.business_date))
    result = []
    for p in active:
        merged: dict[str, Any] = {}
        merged.update(p.values_double)
        merged.update(p.values_int)
        merged.update(p.values_text)
        result.append({"date": str(p.business_date), "values": merged})
    return result


def _numeric_series(records: list[dict], col: str) -> list[tuple[str, float]]:
    out = []
    for r in records:
        v = r["values"].get(col)
        if v is not None:
            try:
                out.append((r["date"], float(v)))
            except (TypeError, ValueError):
                pass
    return out


_INDICATOR_FALLBACK = ["close", "last", "mid", "value", "open"]


def _resolve_indicator(records: list[dict], preferred: str) -> str:
    """Return preferred if it has data, else try common price columns in order."""
    if _numeric_series(records, preferred):
        return preferred
    for col in _INDICATOR_FALLBACK:
        if col != preferred and _numeric_series(records, col):
            return col
    return preferred


# ── Spark results endpoints (unchanged) ──────────────────────────────────────

@router.get("/analytics/totals", summary="Spark aggregation results – record counts per asset per year")
def get_totals(asset_id: str | None = Query(default=None)) -> list[dict]:
    return AnalyticsRepository().get_totals(asset_id=asset_id)


@router.get("/analytics/predictions", summary="Spark ML regression predictions")
def get_predictions() -> list[dict]:
    return AnalyticsRepository().get_regression_results()


# ── UC3 live analytics ────────────────────────────────────────────────────────

@router.get("/analytics/stats", summary="Descriptive statistics for an asset over a date range")
def get_stats(
    assetId: str = Query(...),
    dataSourceId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    indicator: str = Query(default="close", description="Which indicator column to analyse"),
) -> dict:
    start = _parse_date(startDate, "startDate")
    end   = _parse_date(endDate, "endDate")
    records = _load_series(assetId, dataSourceId, start, end)
    indicator = _resolve_indicator(records, indicator)
    series  = _numeric_series(records, indicator)

    if not series:
        raise HTTPException(status_code=404,
                            detail=f"No numeric data for indicator '{indicator}'")

    values = [v for _, v in series]
    n = len(values)
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    std = math.sqrt(variance)
    sorted_v = sorted(values)
    median = sorted_v[n // 2] if n % 2 else (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2

    # daily returns for Sharpe-like ratio
    returns = [(values[i] - values[i - 1]) / values[i - 1]
               for i in range(1, n) if values[i - 1] != 0]
    avg_ret = sum(returns) / len(returns) if returns else 0
    std_ret = math.sqrt(sum((r - avg_ret) ** 2 for r in returns) / len(returns)) if returns else 0
    sharpe = (avg_ret / std_ret * math.sqrt(252)) if std_ret else None

    return {
        "assetId": assetId,
        "dataSourceId": dataSourceId,
        "indicator": indicator,
        "period": {"start": series[0][0], "end": series[-1][0]},
        "count": n,
        "min": round(min(values), 6),
        "max": round(max(values), 6),
        "mean": round(mean, 6),
        "median": round(median, 6),
        "std": round(std, 6),
        "net_change": round(values[-1] - values[0], 6),
        "pct_change": round((values[-1] - values[0]) / values[0] * 100, 4) if values[0] else None,
        "annualised_sharpe": round(sharpe, 4) if sharpe is not None else None,
    }


@router.get("/analytics/moving-average", summary="Simple and exponential moving averages")
def get_moving_average(
    assetId: str = Query(...),
    dataSourceId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    indicator: str = Query(default="close"),
    window: int = Query(default=20, ge=2, le=200, description="SMA window in trading days"),
) -> dict:
    start = _parse_date(startDate, "startDate")
    end   = _parse_date(endDate, "endDate")
    records = _load_series(assetId, dataSourceId, start, end)
    indicator = _resolve_indicator(records, indicator)
    series  = _numeric_series(records, indicator)

    if len(series) < window:
        raise HTTPException(status_code=400,
                            detail=f"Not enough data ({len(series)} points) for window={window}")

    dates  = [d for d, _ in series]
    values = [v for _, v in series]

    # SMA
    sma = [None] * (window - 1)
    for i in range(window - 1, len(values)):
        sma.append(round(sum(values[i - window + 1: i + 1]) / window, 6))

    # EMA
    k = 2 / (window + 1)
    ema: list[float | None] = [None] * (window - 1)
    ema_val = sum(values[:window]) / window
    ema.append(round(ema_val, 6))
    for v in values[window:]:
        ema_val = v * k + ema_val * (1 - k)
        ema.append(round(ema_val, 6))

    return {
        "assetId": assetId,
        "indicator": indicator,
        "window": window,
        "data": [{"date": d, "value": v, "sma": s, "ema": e}
                 for d, v, s, e in zip(dates, values, sma, ema)],
    }


@router.get("/analytics/compare", summary="Compare two assets over a shared date range (normalised to 100)")
def compare_assets(
    assetId1: str = Query(...),
    dataSourceId1: str = Query(...),
    assetId2: str = Query(...),
    dataSourceId2: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    indicator: str = Query(default="close"),
) -> dict:
    start = _parse_date(startDate, "startDate")
    end   = _parse_date(endDate, "endDate")

    r1 = _load_series(assetId1, dataSourceId1, start, end)
    r2 = _load_series(assetId2, dataSourceId2, start, end)
    indicator = _resolve_indicator(r1, indicator)
    s1 = _numeric_series(r1, indicator)
    s2 = _numeric_series(r2, indicator)

    if not s1 or not s2:
        raise HTTPException(status_code=404, detail="No data for one or both assets")

    base1, base2 = s1[0][1], s2[0][1]

    def normalise(series: list[tuple[str, float]], base: float) -> list[dict]:
        return [{"date": d, "value": round(v / base * 100, 4)} for d, v in series]

    raw1 = [{"date": d, "value": round(v, 6)} for d, v in s1]
    raw2 = [{"date": d, "value": round(v, 6)} for d, v in s2]

    return {
        "indicator": indicator,
        "asset1": {"assetId": assetId1, "dataSourceId": dataSourceId1,
                   "raw": raw1, "normalised": normalise(s1, base1)},
        "asset2": {"assetId": assetId2, "dataSourceId": dataSourceId2,
                   "raw": raw2, "normalised": normalise(s2, base2)},
        "correlation": _pearson([v for _, v in s1], [v for _, v in s2]),
    }


@router.get("/analytics/forecast", summary="Simple next-day price forecast using linear trend extrapolation")
def get_forecast(
    assetId: str = Query(...),
    dataSourceId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    indicator: str = Query(default="close"),
    horizon: int = Query(default=5, ge=1, le=30, description="Days ahead to forecast"),
) -> dict:
    start = _parse_date(startDate, "startDate")
    end   = _parse_date(endDate, "endDate")
    records = _load_series(assetId, dataSourceId, start, end)
    indicator = _resolve_indicator(records, indicator)
    series  = _numeric_series(records, indicator)

    if len(series) < 5:
        raise HTTPException(status_code=400, detail="Need at least 5 data points to forecast")

    values = [v for _, v in series]
    n = len(values)
    xs = list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(values) / n
    cov = sum((xs[i] - x_mean) * (values[i] - y_mean) for i in range(n))
    var = sum((x - x_mean) ** 2 for x in xs)
    slope = cov / var if var else 0
    intercept = y_mean - slope * x_mean

    last_date = date.fromisoformat(series[-1][0])
    forecasts = []
    for h in range(1, horizon + 1):
        pred_val = intercept + slope * (n - 1 + h)
        pred_date = last_date + timedelta(days=h)
        forecasts.append({"date": pred_date.isoformat(), "forecast": round(pred_val, 6)})

    return {
        "assetId": assetId,
        "dataSourceId": dataSourceId,
        "indicator": indicator,
        "method": "linear_trend",
        "last_known": {"date": series[-1][0], "value": round(series[-1][1], 6)},
        "slope_per_day": round(slope, 6),
        "forecasts": forecasts,
    }


@router.get("/analytics/risk", summary="Risk signals: volatility, drawdown, VaR")
def get_risk(
    assetId: str = Query(...),
    dataSourceId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    indicator: str = Query(default="close"),
    var_confidence: float = Query(default=0.95, ge=0.5, le=0.999),
) -> dict:
    start = _parse_date(startDate, "startDate")
    end   = _parse_date(endDate, "endDate")
    records = _load_series(assetId, dataSourceId, start, end)
    indicator = _resolve_indicator(records, indicator)
    series  = _numeric_series(records, indicator)

    if len(series) < 3:
        raise HTTPException(status_code=400, detail="Not enough data for risk calculation")

    values = [v for _, v in series]
    returns = [(values[i] - values[i - 1]) / values[i - 1]
               for i in range(1, len(values)) if values[i - 1] != 0]

    if not returns:
        raise HTTPException(status_code=400, detail="Cannot compute returns from data")

    n = len(returns)
    avg_ret = sum(returns) / n
    vol = math.sqrt(sum((r - avg_ret) ** 2 for r in returns) / n)
    ann_vol = vol * math.sqrt(252)

    # Max drawdown
    peak = values[0]
    max_dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak else 0
        if dd > max_dd:
            max_dd = dd

    # Historical VaR
    sorted_returns = sorted(returns)
    var_idx = int((1 - var_confidence) * n)
    var_value = sorted_returns[var_idx] if var_idx < n else sorted_returns[0]

    return {
        "assetId": assetId,
        "dataSourceId": dataSourceId,
        "indicator": indicator,
        "period": {"start": series[0][0], "end": series[-1][0]},
        "daily_volatility": round(vol, 6),
        "annualised_volatility": round(ann_vol, 6),
        "max_drawdown": round(max_dd, 6),
        "max_drawdown_pct": round(max_dd * 100, 4),
        f"historical_var_{int(var_confidence*100)}pct": round(var_value, 6),
        f"historical_var_{int(var_confidence*100)}pct_pct": round(var_value * 100, 4),
    }


# ── internal ─────────────────────────────────────────────────────────────────

def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = min(len(xs), len(ys))
    if n < 2:
        return None
    xs, ys = xs[:n], ys[:n]
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    sx  = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy  = math.sqrt(sum((y - my) ** 2 for y in ys))
    return round(cov / (sx * sy), 6) if sx and sy else None
