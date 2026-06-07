from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are FinDW Assistant, an AI analyst for the Financial Data Warehouse.
You have access to real financial data (crypto, FX rates, stocks) stored in the warehouse.
Always ground your answers in actual data — call the available tools to fetch numbers before answering.
Be concise and precise. When you show numbers, format them nicely. Mention the data source and date range used."""

ANTHROPIC_TOOLS: list[dict] = [
    {
        "name": "list_assets",
        "description": "List all financial asset IDs in the warehouse (crypto, FX, stocks).",
        "input_schema": {"type": "object", "properties": {
            "offset": {"type": "integer", "default": 0},
            "limit":  {"type": "integer", "default": 50},
        }},
    },
    {
        "name": "list_data_sources",
        "description": "List all data source IDs available in the warehouse.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_statistics",
        "description": "Descriptive stats for an asset indicator: min, max, mean, std, % change, Sharpe ratio.",
        "input_schema": {"type": "object", "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            "properties": {
                "assetId":      {"type": "string"},
                "dataSourceId": {"type": "string"},
                "startDate":    {"type": "string", "description": "YYYY-MM-DD"},
                "endDate":      {"type": "string", "description": "YYYY-MM-DD"},
                "indicator":    {"type": "string", "default": "close"},
            }},
    },
    {
        "name": "forecast_price",
        "description": "Linear trend forecast for N days ahead based on historical data.",
        "input_schema": {"type": "object", "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            "properties": {
                "assetId":      {"type": "string"},
                "dataSourceId": {"type": "string"},
                "startDate":    {"type": "string"},
                "endDate":      {"type": "string"},
                "indicator":    {"type": "string", "default": "close"},
                "horizon":      {"type": "integer", "default": 7},
            }},
    },
    {
        "name": "get_risk_metrics",
        "description": "Risk signals: daily/annualised volatility, max drawdown, historical VaR.",
        "input_schema": {"type": "object", "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            "properties": {
                "assetId":       {"type": "string"},
                "dataSourceId":  {"type": "string"},
                "startDate":     {"type": "string"},
                "endDate":       {"type": "string"},
                "indicator":     {"type": "string", "default": "close"},
                "varConfidence": {"type": "number", "default": 0.95},
            }},
    },
    {
        "name": "compare_assets",
        "description": "Compare two assets — normalised performance and Pearson correlation.",
        "input_schema": {"type": "object",
            "required": ["assetId1", "dataSourceId1", "assetId2", "dataSourceId2", "startDate", "endDate"],
            "properties": {
                "assetId1":      {"type": "string"},
                "dataSourceId1": {"type": "string"},
                "assetId2":      {"type": "string"},
                "dataSourceId2": {"type": "string"},
                "startDate":     {"type": "string"},
                "endDate":       {"type": "string"},
                "indicator":     {"type": "string", "default": "close"},
            }},
    },
    {
        "name": "get_moving_averages",
        "description": "SMA and EMA for an asset over a date range.",
        "input_schema": {"type": "object", "required": ["assetId", "dataSourceId", "startDate", "endDate"],
            "properties": {
                "assetId":      {"type": "string"},
                "dataSourceId": {"type": "string"},
                "startDate":    {"type": "string"},
                "endDate":      {"type": "string"},
                "indicator":    {"type": "string", "default": "close"},
                "window":       {"type": "integer", "default": 20},
            }},
    },
    {
        "name": "trigger_ingestion",
        "description": (
            "Ingest financial data into the warehouse from external sources. "
            "Use bitfinex_tickers for crypto (e.g. ['BTCUSD','ETHUSD']), "
            "fx_pairs for FX rates (e.g. ['EURUSD','EURGBP']), "
            "yahoo_stocks for stocks (e.g. ['AAPL','MSFT']). "
            "Provide start_date and end_date as YYYY-MM-DD."
        ),
        "input_schema": {"type": "object", "properties": {
            "bitfinex_tickers": {"type": "array", "items": {"type": "string"}, "description": "Crypto tickers e.g. BTCUSD"},
            "fx_pairs":         {"type": "array", "items": {"type": "string"}, "description": "FX pairs e.g. EURUSD"},
            "yahoo_stocks":     {"type": "array", "items": {"type": "string"}, "description": "Stock tickers e.g. AAPL"},
            "start_date":       {"type": "string", "description": "YYYY-MM-DD"},
            "end_date":         {"type": "string", "description": "YYYY-MM-DD"},
        }},
    },
    {
        "name": "run_spark_compute_total",
        "description": (
            "Run the Spark ComputeTotal aggregation job. "
            "Computes record counts per asset per year and stores results in the `totals` table. "
            "Optionally filter by data_source_id. Runs for all assets if no filter given. "
            "Takes 1-3 minutes."
        ),
        "input_schema": {"type": "object", "properties": {
            "data_source_id": {"type": "string", "description": "Optional: filter to a specific data source"},
        }},
    },
    {
        "name": "run_spark_regression",
        "description": (
            "Run the Spark LinearRegression ML job for a specific asset. "
            "Trains a model on historical price data and stores predictions in `regression_results`. "
            "Requires the asset to have OHLC data already ingested. Takes 2-5 minutes."
        ),
        "input_schema": {"type": "object", "required": ["assetId", "dataSourceId"],
            "properties": {
                "assetId":      {"type": "string", "description": "e.g. QDL/BITFINEX/BTCUSD"},
                "dataSourceId": {"type": "string", "description": "e.g. NASDAQ-DATA-LINK.QDL/BITFINEX"},
            }},
    },
]


def _api_base() -> str:
    cfg = get_settings()
    host = "127.0.0.1" if cfg.api_host in ("0.0.0.0", "") else cfg.api_host
    return f"http://{host}:{cfg.api_port}/api/v1"


def _call_tool(name: str, inputs: dict) -> Any:
    base = _api_base()
    with httpx.Client(timeout=360) as client:
        if name == "list_assets":
            r = client.get(f"{base}/assets", params={"offset": inputs.get("offset", 0), "limit": inputs.get("limit", 50)})
        elif name == "list_data_sources":
            r = client.get(f"{base}/data-sources", params={"limit": 50})
        elif name == "get_statistics":
            r = client.get(f"{base}/analytics/stats", params={
                "assetId": inputs["assetId"], "dataSourceId": inputs["dataSourceId"],
                "startDate": inputs["startDate"], "endDate": inputs["endDate"],
                "indicator": inputs.get("indicator", "close"),
            })
        elif name == "forecast_price":
            r = client.get(f"{base}/analytics/forecast", params={
                "assetId": inputs["assetId"], "dataSourceId": inputs["dataSourceId"],
                "startDate": inputs["startDate"], "endDate": inputs["endDate"],
                "indicator": inputs.get("indicator", "close"), "horizon": inputs.get("horizon", 7),
            })
        elif name == "get_risk_metrics":
            r = client.get(f"{base}/analytics/risk", params={
                "assetId": inputs["assetId"], "dataSourceId": inputs["dataSourceId"],
                "startDate": inputs["startDate"], "endDate": inputs["endDate"],
                "indicator": inputs.get("indicator", "close"),
                "var_confidence": inputs.get("varConfidence", 0.95),
            })
        elif name == "compare_assets":
            r = client.get(f"{base}/analytics/compare", params={
                "assetId1": inputs["assetId1"], "dataSourceId1": inputs["dataSourceId1"],
                "assetId2": inputs["assetId2"], "dataSourceId2": inputs["dataSourceId2"],
                "startDate": inputs["startDate"], "endDate": inputs["endDate"],
                "indicator": inputs.get("indicator", "close"),
            })
        elif name == "get_moving_averages":
            r = client.get(f"{base}/analytics/moving-average", params={
                "assetId": inputs["assetId"], "dataSourceId": inputs["dataSourceId"],
                "startDate": inputs["startDate"], "endDate": inputs["endDate"],
                "indicator": inputs.get("indicator", "close"), "window": inputs.get("window", 20),
            })
        elif name == "trigger_ingestion":
            r = client.post(f"{base}/ingest", json={
                "bitfinex_tickers": inputs.get("bitfinex_tickers"),
                "fx_pairs":         inputs.get("fx_pairs"),
                "yahoo_stocks":     inputs.get("yahoo_stocks"),
                "start_date":       inputs.get("start_date"),
                "end_date":         inputs.get("end_date"),
            }, timeout=300)
        elif name == "run_spark_compute_total":
            r = client.post(f"{base}/spark/compute-total", json={
                "keyspace": "financial_dw",
                "data_source_id": inputs.get("data_source_id"),
            }, timeout=360)
        elif name == "run_spark_regression":
            r = client.post(f"{base}/spark/regression", json={
                "keyspace":       "financial_dw",
                "asset_id":       inputs["assetId"],
                "data_source_id": inputs["dataSourceId"],
            }, timeout=360)
        else:
            return {"error": f"Unknown tool: {name}"}

        if r.status_code >= 400:
            return {"error": f"API error {r.status_code}: {r.text}"}
        return r.json()


def _proxy_request(cfg, messages: list[dict], tools: list[dict]) -> dict:
    base = cfg.anthropic_base_url.rstrip("/")
    if base.endswith("/anthropic"):
        url = base + "/v1/messages"
    else:
        url = base + "/anthropic/v1/messages"

    headers = {
        "Authorization": f"Bearer {cfg.anthropic_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "anthropic--claude-sonnet-latest",
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "tools": tools,
        "messages": messages,
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code,
                                detail=f"Proxy error {resp.status_code}: {resp.text}")
        return resp.json()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse, summary="AI assistant powered by Claude")
def chat(request: ChatRequest) -> ChatResponse:
    cfg = get_settings()
    if not cfg.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured in .env")

    messages: list[dict] = [{"role": m.role, "content": m.content} for m in request.messages]

    try:
        for _ in range(10):
            data = _proxy_request(cfg, messages, ANTHROPIC_TOOLS)
            stop_reason = data.get("stop_reason")
            content = data.get("content", [])

            if stop_reason == "end_turn":
                text = next((b["text"] for b in content if b.get("type") == "text"), "")
                return ChatResponse(reply=text)

            if stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": content})
                tool_results = []
                for block in content:
                    if block.get("type") == "tool_use":
                        logger.info("Tool call: %s %s", block["name"], block["input"])
                        result = _call_tool(block["name"], block["input"])
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": json.dumps(result, default=str),
                        })
                messages.append({"role": "user", "content": tool_results})
            else:
                text = next((b["text"] for b in content if b.get("type") == "text"), "")
                return ChatResponse(reply=text or "No response.")

        return ChatResponse(reply="Reached maximum tool calls. Please ask a simpler question.")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Chat error")
        raise HTTPException(status_code=500, detail=str(e))
