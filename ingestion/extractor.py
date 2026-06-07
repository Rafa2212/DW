from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Iterator

import httpx

from config import get_settings
from ingestion.raw_record import ProviderPage, RawRecord

logger = logging.getLogger(__name__)

# Nasdaq Data Link provider identifier stored in our system
NASDAQ_PROVIDER_ID = "NASDAQ-DATA-LINK"
YAHOO_PROVIDER_ID = "YAHOO-FINANCE"

# Free datasets available without subscription
BITFINEX_DATASET = "QDL/BITFINEX"
YAHOO_FX_DATASET = "FX"
YAHOO_STOCKS_DATASET = "STOCKS"


class NasdaqClient:
    """
    Thin HTTP wrapper around the Nasdaq Data Link REST APIs.
    Handles cursor-based pagination transparently.
    """

    def __init__(self) -> None:
        cfg = get_settings()
        self._base = cfg.nasdaq_base_url
        self._key = cfg.nasdaq_api_key
        self._http = httpx.Client(timeout=30)

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def fetch_bitfinex_table(
        self,
        tickers: list[str],
        start_date: date | None = None,
        end_date: date | None = None,
        page_size: int = 1000,
    ) -> Iterator[ProviderPage]:
        """
        Yield pages of BITFINEX datatable rows using cursor-based pagination.
        Each page contains up to page_size rows.
        """
        params: dict = {
            "api_key": self._key,
            "qopts.per_page": page_size,
        }
        # BITFINEX datatable uses "code" as the ticker filter column
        code_params = [("code", t) for t in tickers]
        if start_date:
            params["date.gte"] = start_date.isoformat()
        if end_date:
            params["date.lte"] = end_date.isoformat()

        url = f"{self._base}/datatables/{BITFINEX_DATASET}.json"
        all_params = list(params.items()) + code_params
        yield from self._paginate_datatable(url, all_params, BITFINEX_DATASET)

    def close(self) -> None:
        self._http.close()

    # ------------------------------------------------------------------
    # Private pagination helpers
    # ------------------------------------------------------------------

    def _paginate_datatable(
        self,
        url: str,
        params: dict | list,
        dataset_code: str,
    ) -> Iterator[ProviderPage]:
        cursor: str | None = None
        page_num = 0

        while True:
            if isinstance(params, list):
                p = [t for t in params if t[0] != "qopts.cursor_id"]
                if cursor:
                    p = p + [("qopts.cursor_id", cursor)]
            else:
                p = dict(params)
                if cursor:
                    p["qopts.cursor_id"] = cursor

            logger.info("Fetching %s page=%d cursor=%s", dataset_code, page_num, cursor)
            resp = self._http.get(url, params=p)
            resp.raise_for_status()
            body = resp.json()

            datatable = body.get("datatable", {})
            columns_meta = datatable.get("columns", [])
            columns = [c["name"] for c in columns_meta]
            rows = datatable.get("data", [])

            # Identify the ticker column index (BITFINEX uses "code")
            ticker_idx = next(
                (i for i, c in enumerate(columns) if c.lower() in ("code", "ticker", "symbol")), 0
            )
            date_idx = next(
                (i for i, c in enumerate(columns) if c.lower() == "date"), 1
            )

            records = []
            for row in rows:
                try:
                    raw_date = row[date_idx]
                    if isinstance(raw_date, str):
                        record_date = date.fromisoformat(raw_date)
                    else:
                        record_date = raw_date
                    ticker = str(row[ticker_idx])
                    records.append(
                        RawRecord(
                            ticker=ticker,
                            record_date=record_date,
                            columns=columns,
                            row=row,
                            provider_id=NASDAQ_PROVIDER_ID,
                            dataset_code=dataset_code,
                        )
                    )
                except Exception as exc:
                    logger.warning("Skipping malformed row %s: %s", row, exc)

            meta = body.get("meta", {})
            next_cursor = meta.get("next_cursor_id")

            yield ProviderPage(
                records=records,
                next_cursor=next_cursor,
                columns=columns,
                dataset_code=dataset_code,
                provider_id=NASDAQ_PROVIDER_ID,
            )

            if not next_cursor or not rows:
                break
            cursor = next_cursor
            page_num += 1


class YahooFinanceClient:
    """
    Fetches historical OHLCV data from Yahoo Finance (free, no API key required).
    - FX pairs like 'EURUSD' map to Yahoo symbol 'EURUSD=X', stored under dataset 'FX'
    - Stock tickers like 'AAPL' map directly, stored under dataset 'STOCKS'
    All pairs/tickers within the same dataset share one DataSource record.
    """

    _BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
    _COLUMNS = ["ticker", "date", "open", "high", "low", "close", "volume"]

    def __init__(self) -> None:
        self._http = httpx.Client(
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0"},
        )

    def fetch_fx_pair(
        self,
        pair: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> Iterator[ProviderPage]:
        """Fetch daily OHLC for an FX pair (e.g. 'EURUSD'). All pairs share dataset 'FX'."""
        symbol = f"{pair}=X"
        yield from self._fetch_symbol(symbol, pair, YAHOO_FX_DATASET, start_date, end_date)

    def fetch_stock(
        self,
        ticker: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> Iterator[ProviderPage]:
        """Fetch daily OHLCV for a stock ticker (e.g. 'AAPL'). All tickers share dataset 'STOCKS'."""
        yield from self._fetch_symbol(ticker, ticker, YAHOO_STOCKS_DATASET, start_date, end_date)

    def close(self) -> None:
        self._http.close()

    def _fetch_symbol(
        self,
        symbol: str,
        ticker: str,
        dataset_code: str,
        start_date: date | None,
        end_date: date | None,
    ) -> Iterator[ProviderPage]:
        params: dict = {"interval": "1d"}
        if start_date and end_date:
            params["period1"] = int(datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc).timestamp())
            params["period2"] = int(datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc).timestamp())
        else:
            params["range"] = "2y"

        url = f"{self._BASE}/{symbol}"
        logger.info("Fetching Yahoo Finance %s (dataset=%s)", symbol, dataset_code)
        resp = self._http.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()

        result = body.get("chart", {}).get("result", [])
        if not result:
            yield ProviderPage(records=[], next_cursor=None, columns=self._COLUMNS, dataset_code=dataset_code, provider_id=YAHOO_PROVIDER_ID)
            return

        chart = result[0]
        timestamps = chart.get("timestamp", [])
        quotes = chart.get("indicators", {}).get("quote", [{}])[0]
        opens = quotes.get("open", [])
        highs = quotes.get("high", [])
        lows = quotes.get("low", [])
        closes = quotes.get("close", [])
        volumes = quotes.get("volume", [])

        records = []
        for i, ts in enumerate(timestamps):
            try:
                record_date = datetime.fromtimestamp(ts, tz=timezone.utc).date()
                o = opens[i] if i < len(opens) else None
                h = highs[i] if i < len(highs) else None
                lo = lows[i] if i < len(lows) else None
                c = closes[i] if i < len(closes) else None
                v = volumes[i] if i < len(volumes) else None
                if o is None or h is None or lo is None or c is None:
                    continue
                row = [ticker, record_date.isoformat(), o, h, lo, c, v]
                records.append(RawRecord(
                    ticker=ticker,
                    record_date=record_date,
                    columns=self._COLUMNS,
                    row=row,
                    provider_id=YAHOO_PROVIDER_ID,
                    dataset_code=dataset_code,
                ))
            except Exception as exc:
                logger.warning("Skipping Yahoo row %d for %s: %s", i, symbol, exc)

        yield ProviderPage(
            records=records,
            next_cursor=None,
            columns=self._COLUMNS,
            dataset_code=dataset_code,
            provider_id=YAHOO_PROVIDER_ID,
        )



class NasdaqClient:
    """
    Thin HTTP wrapper around the Nasdaq Data Link REST APIs.
    Handles cursor-based pagination transparently.
    """

    def __init__(self) -> None:
        cfg = get_settings()
        self._base = cfg.nasdaq_base_url
        self._key = cfg.nasdaq_api_key
        self._http = httpx.Client(timeout=30)

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def fetch_bitfinex_table(
        self,
        tickers: list[str],
        start_date: date | None = None,
        end_date: date | None = None,
        page_size: int = 1000,
    ) -> Iterator[ProviderPage]:
        """
        Yield pages of BITFINEX datatable rows using cursor-based pagination.
        Each page contains up to page_size rows.
        """
        params: dict = {
            "api_key": self._key,
            "qopts.per_page": page_size,
        }
        # BITFINEX datatable uses "code" as the ticker filter column
        code_params = [("code", t) for t in tickers]
        if start_date:
            params["date.gte"] = start_date.isoformat()
        if end_date:
            params["date.lte"] = end_date.isoformat()

        url = f"{self._base}/datatables/{BITFINEX_DATASET}.json"
        # Merge base params dict + repeated code tuples into a list of tuples
        all_params = list(params.items()) + code_params
        yield from self._paginate_datatable(url, all_params, BITFINEX_DATASET)

    def fetch_ecb_series(
        self,
        currency_pair: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> Iterator[ProviderPage]:
        """
        Fetch FX rate data using the free CURRFX datatable.
        currency_pair should be a 6-letter code like 'EURUSD' or 'EURGBP'.
        """
        params: dict = {
            "api_key": self._key,
            "qopts.per_page": 1000,
            "currency_code": currency_pair[:3],
        }
        if start_date:
            params["date.gte"] = start_date.isoformat()
        if end_date:
            params["date.lte"] = end_date.isoformat()

        url = f"{self._base}/datatables/{CURRFX_DATASET}.json"
        dataset_code = f"{CURRFX_DATASET}/{currency_pair}"
        yield from self._paginate_datatable(url, params, dataset_code)

    def close(self) -> None:
        self._http.close()

    # ------------------------------------------------------------------
    # Private pagination helpers
    # ------------------------------------------------------------------

    def _paginate_datatable(
        self,
        url: str,
        params: dict | list,
        dataset_code: str,
    ) -> Iterator[ProviderPage]:
        cursor: str | None = None
        page_num = 0

        while True:
            if isinstance(params, list):
                p = [t for t in params if t[0] != "qopts.cursor_id"]
                if cursor:
                    p = p + [("qopts.cursor_id", cursor)]
            else:
                p = dict(params)
                if cursor:
                    p["qopts.cursor_id"] = cursor

            logger.info("Fetching %s page=%d cursor=%s", dataset_code, page_num, cursor)
            resp = self._http.get(url, params=p)
            resp.raise_for_status()
            body = resp.json()

            datatable = body.get("datatable", {})
            columns_meta = datatable.get("columns", [])
            columns = [c["name"] for c in columns_meta]
            rows = datatable.get("data", [])

            # Identify the ticker column index (BITFINEX uses "code")
            ticker_idx = next(
                (i for i, c in enumerate(columns) if c.lower() in ("code", "ticker", "symbol")), 0
            )
            date_idx = next(
                (i for i, c in enumerate(columns) if c.lower() == "date"), 1
            )

            records = []
            for row in rows:
                try:
                    raw_date = row[date_idx]
                    if isinstance(raw_date, str):
                        record_date = date.fromisoformat(raw_date)
                    else:
                        record_date = raw_date
                    ticker = str(row[ticker_idx])
                    records.append(
                        RawRecord(
                            ticker=ticker,
                            record_date=record_date,
                            columns=columns,
                            row=row,
                            provider_id=NASDAQ_PROVIDER_ID,
                            dataset_code=dataset_code,
                        )
                    )
                except Exception as exc:
                    logger.warning("Skipping malformed row %s: %s", row, exc)

            meta = body.get("meta", {})
            next_cursor = meta.get("next_cursor_id")

            yield ProviderPage(
                records=records,
                next_cursor=next_cursor,
                columns=columns,
                dataset_code=dataset_code,
                provider_id=NASDAQ_PROVIDER_ID,
            )

            if not next_cursor or not rows:
                break
            cursor = next_cursor
            page_num += 1

    def _fetch_time_series_dataset(
        self,
        url: str,
        params: dict,
        dataset_code: str,
    ) -> Iterator[ProviderPage]:
        logger.info("Fetching time-series dataset %s", dataset_code)
        resp = self._http.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()

        ds = body.get("dataset", {})
        columns = ds.get("column_names", [])
        rows = ds.get("data", [])

        date_idx = next(
            (i for i, c in enumerate(columns) if c.lower() == "date"), 0
        )

        records = []
        # Derive ticker from dataset_code last segment e.g. "ECB/EURUSD" → "EURUSD"
        ticker = dataset_code.split("/")[-1]
        for row in rows:
            try:
                raw_date = row[date_idx]
                record_date = date.fromisoformat(raw_date) if isinstance(raw_date, str) else raw_date
                records.append(
                    RawRecord(
                        ticker=ticker,
                        record_date=record_date,
                        columns=columns,
                        row=row,
                        provider_id=NASDAQ_PROVIDER_ID,
                        dataset_code=dataset_code,
                    )
                )
            except Exception as exc:
                logger.warning("Skipping malformed row %s: %s", row, exc)

        yield ProviderPage(
            records=records,
            next_cursor=None,
            columns=columns,
            dataset_code=dataset_code,
            provider_id=NASDAQ_PROVIDER_ID,
        )
