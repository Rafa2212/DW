from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from config import get_settings

logger = logging.getLogger(__name__)


def _api_base() -> str:
    cfg = get_settings()
    host = "127.0.0.1" if cfg.api_host in ("0.0.0.0", "") else cfg.api_host
    return f"http://{host}:{cfg.api_port}/api/v1"


def _get(path: str, params: dict | None = None) -> dict:
    url = f"{_api_base()}{path}"
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


server = Server("financial-dw")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="list_assets",
            description=(
                "Returns a paginated list of financial asset identifiers available in the warehouse. "
                "Assets include crypto pairs (QDL/BITFINEX/*), FX rates (FX/*), and stocks (STOCKS/*). "
                "Use offset/limit to paginate."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "offset": {"type": "integer", "default": 0, "minimum": 0},
                    "limit":  {"type": "integer", "default": 20, "minimum": 1, "maximum": 200},
                },
            },
        ),
        Tool(
            name="get_asset_details",
            description=(
                "Returns all temporal versions of a financial asset including its metadata attributes. "
                "The first entry is the most-recent version."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId": {"type": "string", "description": "e.g. 'QDL/BITFINEX/BTCUSD'"},
                },
                "required": ["assetId"],
            },
        ),
        Tool(
            name="list_data_sources",
            description="Returns a paginated list of data-source identifiers (provider + dataset).",
            inputSchema={
                "type": "object",
                "properties": {
                    "offset": {"type": "integer", "default": 0},
                    "limit":  {"type": "integer", "default": 20, "maximum": 200},
                },
            },
        ),
        Tool(
            name="get_data_source_details",
            description=(
                "Returns details about a data source including its indicator attributes "
                "(e.g. open, high, low, close, volume)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "dataSourceId": {"type": "string", "description": "e.g. 'NASDAQ-DATA-LINK.QDL/BITFINEX'"},
                },
                "required": ["dataSourceId"],
            },
        ),
        Tool(
            name="get_time_series_data",
            description=(
                "Returns daily time-series records for a specific asset and data source. "
                "Records are ordered newest-first. Max 365 days per call."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":           {"type": "string"},
                    "dataSourceId":      {"type": "string"},
                    "startBusinessDate": {"type": "string", "description": "YYYY-MM-DD inclusive"},
                    "endBusinessDate":   {"type": "string", "description": "YYYY-MM-DD exclusive"},
                    "includeAttributes": {"type": "boolean", "default": False},
                },
                "required": ["assetId", "dataSourceId", "startBusinessDate", "endBusinessDate"],
            },
        ),
        Tool(
            name="summarize_trend",
            description=(
                "Fetches time-series data and returns a statistical summary per indicator: "
                "min, max, avg, first, last, net_change, count. "
                "Use this before deeper analysis to understand the price range and direction."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":           {"type": "string"},
                    "dataSourceId":      {"type": "string"},
                    "startBusinessDate": {"type": "string"},
                    "endBusinessDate":   {"type": "string"},
                },
                "required": ["assetId", "dataSourceId", "startBusinessDate", "endBusinessDate"],
            },
        ),
        Tool(
            name="get_statistics",
            description=(
                "Returns descriptive statistics for a single indicator of an asset: "
                "min, max, mean, median, std, net change, % change, and annualised Sharpe ratio. "
                "Use this for quantitative analysis of a specific metric."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":      {"type": "string"},
                    "dataSourceId": {"type": "string"},
                    "startDate":    {"type": "string", "description": "YYYY-MM-DD"},
                    "endDate":      {"type": "string", "description": "YYYY-MM-DD"},
                    "indicator":    {"type": "string", "default": "close",
                                     "description": "Indicator column: open, high, low, close, volume, last, mid…"},
                },
                "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            },
        ),
        Tool(
            name="compare_assets",
            description=(
                "Compares two assets over the same date range for a chosen indicator. "
                "Returns raw values, values normalised to 100 at period start, and Pearson correlation. "
                "Use this to answer 'how did X perform vs Y?' questions."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId1":      {"type": "string"},
                    "dataSourceId1": {"type": "string"},
                    "assetId2":      {"type": "string"},
                    "dataSourceId2": {"type": "string"},
                    "startDate":     {"type": "string"},
                    "endDate":       {"type": "string"},
                    "indicator":     {"type": "string", "default": "close"},
                },
                "required": ["assetId1", "dataSourceId1", "assetId2", "dataSourceId2",
                             "startDate", "endDate"],
            },
        ),
        Tool(
            name="forecast_price",
            description=(
                "Produces a short-term price forecast using linear trend extrapolation on historical data. "
                "Returns predicted values for each day in the forecast horizon. "
                "Suitable for simple trend-based next-day or next-week estimates."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":      {"type": "string"},
                    "dataSourceId": {"type": "string"},
                    "startDate":    {"type": "string"},
                    "endDate":      {"type": "string"},
                    "indicator":    {"type": "string", "default": "close"},
                    "horizon":      {"type": "integer", "default": 5, "minimum": 1, "maximum": 30,
                                     "description": "Number of calendar days to forecast ahead"},
                },
                "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            },
        ),
        Tool(
            name="get_risk_metrics",
            description=(
                "Computes risk signals for an asset: daily volatility, annualised volatility, "
                "maximum drawdown, and historical Value-at-Risk (VaR) at a chosen confidence level. "
                "Use this to assess how risky an asset has been over a period."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":        {"type": "string"},
                    "dataSourceId":   {"type": "string"},
                    "startDate":      {"type": "string"},
                    "endDate":        {"type": "string"},
                    "indicator":      {"type": "string", "default": "close"},
                    "varConfidence":  {"type": "number", "default": 0.95, "minimum": 0.5, "maximum": 0.999,
                                      "description": "Confidence level for VaR, e.g. 0.95 for 95%"},
                },
                "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            },
        ),
        Tool(
            name="get_moving_averages",
            description=(
                "Returns a time series with the original values plus SMA (simple moving average) "
                "and EMA (exponential moving average) for a chosen window. "
                "Useful for identifying trends and crossover signals."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "assetId":      {"type": "string"},
                    "dataSourceId": {"type": "string"},
                    "startDate":    {"type": "string"},
                    "endDate":      {"type": "string"},
                    "indicator":    {"type": "string", "default": "close"},
                    "window":       {"type": "integer", "default": 20, "minimum": 2, "maximum": 200},
                },
                "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        result = await _dispatch(name, arguments)
    except httpx.HTTPStatusError as exc:
        result = {"error": f"API error {exc.response.status_code}: {exc.response.text}"}
    except Exception as exc:
        result = {"error": str(exc)}
    return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]


async def _dispatch(name: str, args: dict) -> dict:
    if name == "list_assets":
        return _get("/assets", {"offset": args.get("offset", 0), "limit": args.get("limit", 20)})

    if name == "get_asset_details":
        return _get(f"/assets/{_req(args, 'assetId')}")

    if name == "list_data_sources":
        return _get("/data-sources", {"offset": args.get("offset", 0), "limit": args.get("limit", 20)})

    if name == "get_data_source_details":
        return _get(f"/data-sources/{_req(args, 'dataSourceId')}")

    if name == "get_time_series_data":
        _check_dates(args, "startBusinessDate", "endBusinessDate")
        return _get("/data", {
            "assetId":           _req(args, "assetId"),
            "dataSourceId":      _req(args, "dataSourceId"),
            "startBusinessDate": _req(args, "startBusinessDate"),
            "endBusinessDate":   _req(args, "endBusinessDate"),
            "includeAttributes": args.get("includeAttributes", False),
        })

    if name == "summarize_trend":
        _check_dates(args, "startBusinessDate", "endBusinessDate")
        raw = _get("/data", {
            "assetId":           _req(args, "assetId"),
            "dataSourceId":      _req(args, "dataSourceId"),
            "startBusinessDate": _req(args, "startBusinessDate"),
            "endBusinessDate":   _req(args, "endBusinessDate"),
            "includeAttributes": True,
        })
        return _compute_summary(raw)

    if name == "get_statistics":
        return _get("/analytics/stats", {
            "assetId":      _req(args, "assetId"),
            "dataSourceId": _req(args, "dataSourceId"),
            "startDate":    _req(args, "startDate"),
            "endDate":      _req(args, "endDate"),
            "indicator":    args.get("indicator", "close"),
        })

    if name == "compare_assets":
        return _get("/analytics/compare", {
            "assetId1":      _req(args, "assetId1"),
            "dataSourceId1": _req(args, "dataSourceId1"),
            "assetId2":      _req(args, "assetId2"),
            "dataSourceId2": _req(args, "dataSourceId2"),
            "startDate":     _req(args, "startDate"),
            "endDate":       _req(args, "endDate"),
            "indicator":     args.get("indicator", "close"),
        })

    if name == "forecast_price":
        return _get("/analytics/forecast", {
            "assetId":      _req(args, "assetId"),
            "dataSourceId": _req(args, "dataSourceId"),
            "startDate":    _req(args, "startDate"),
            "endDate":      _req(args, "endDate"),
            "indicator":    args.get("indicator", "close"),
            "horizon":      args.get("horizon", 5),
        })

    if name == "get_risk_metrics":
        return _get("/analytics/risk", {
            "assetId":        _req(args, "assetId"),
            "dataSourceId":   _req(args, "dataSourceId"),
            "startDate":      _req(args, "startDate"),
            "endDate":        _req(args, "endDate"),
            "indicator":      args.get("indicator", "close"),
            "var_confidence": args.get("varConfidence", 0.95),
        })

    if name == "get_moving_averages":
        return _get("/analytics/moving-average", {
            "assetId":      _req(args, "assetId"),
            "dataSourceId": _req(args, "dataSourceId"),
            "startDate":    _req(args, "startDate"),
            "endDate":      _req(args, "endDate"),
            "indicator":    args.get("indicator", "close"),
            "window":       args.get("window", 20),
        })

    raise ValueError(f"Unknown tool: {name}")


def _req(args: dict, key: str) -> str:
    val = args.get(key)
    if not val:
        raise ValueError(f"Required argument '{key}' is missing.")
    return val


def _check_dates(args: dict, start_key: str, end_key: str) -> None:
    try:
        s = date.fromisoformat(_req(args, start_key))
        e = date.fromisoformat(_req(args, end_key))
    except ValueError as exc:
        raise ValueError(f"Invalid date (YYYY-MM-DD): {exc}")
    if s >= e:
        raise ValueError(f"{start_key} must be before {end_key}.")
    if (e - s).days > 366:
        raise ValueError("Date range exceeds 366 days. Use multiple calls.")


def _compute_summary(raw: dict) -> dict:
    records = raw.get("records", [])
    if not records:
        return {"summary": "No records found."}

    numeric: dict[str, list[float]] = {}
    for rec in records:
        for k, v in rec.get("values", {}).items():
            try:
                numeric.setdefault(k, []).append(float(v))
            except (TypeError, ValueError):
                pass

    summary = {}
    for col, values in numeric.items():
        summary[col] = {
            "min":        round(min(values), 6),
            "max":        round(max(values), 6),
            "avg":        round(sum(values) / len(values), 6),
            "first":      round(values[-1], 6),
            "last":       round(values[0], 6),
            "net_change": round(values[0] - values[-1], 6),
            "count":      len(values),
        }

    return {
        "assetId":       raw.get("assetId"),
        "dataSourceId":  raw.get("dataSourceId"),
        "period_start":  records[-1]["businessDate"] if records else None,
        "period_end":    records[0]["businessDate"] if records else None,
        "record_count":  len(records),
        "indicators":    summary,
    }


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
