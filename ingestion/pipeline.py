from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from ingestion.extractor import NasdaqClient, YahooFinanceClient
from ingestion.transformer import transform_page
from ingestion.loader import Loader, _LoadStats

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ defaults
BITFINEX_TICKERS = ["BTCUSD", "ETHUSD", "LTCUSD", "XRPUSD"]
ECB_PAIRS = ["EURUSD", "EURGBP"]
YAHOO_STOCKS = ["AAPL", "MSFT", "GOOGL"]


def run_ingestion(
    bitfinex_tickers: list[str] | None = None,
    ecb_pairs: list[str] | None = None,
    yahoo_stocks: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """
    Full ETL pipeline:
      1. Extract  – pull data from Nasdaq Data Link
      2. Transform – map to internal canonical model
      3. Load      – persist to Cassandra

    Returns a summary dict with fetch/store statistics.
    """
    if bitfinex_tickers is None:
        bitfinex_tickers = BITFINEX_TICKERS
    if ecb_pairs is None:
        ecb_pairs = ECB_PAIRS
    if yahoo_stocks is None:
        yahoo_stocks = YAHOO_STOCKS

    client = NasdaqClient()
    yahoo = YahooFinanceClient()
    loader = Loader()
    system_date = datetime.now(timezone.utc)
    total = _LoadStats()
    errors: list[str] = []

    # ---- BITFINEX crypto ------------------------------------------------
    logger.info("Starting BITFINEX ingestion for tickers: %s", bitfinex_tickers)
    try:
        for page in client.fetch_bitfinex_table(
            tickers=bitfinex_tickers,
            start_date=start_date,
            end_date=end_date,
        ):
            if not page.records:
                continue
            result = transform_page(page, system_date)
            stats = loader.load(result)
            total += stats
            logger.info("BITFINEX page loaded: %s", stats)
    except Exception as exc:
        msg = f"BITFINEX ingestion failed: {exc}"
        logger.error(msg, exc_info=True)
        errors.append(msg)

    # ---- FX rates via Yahoo Finance (free, no subscription required) ----
    for pair in ecb_pairs:
        logger.info("Starting Yahoo Finance FX ingestion for pair: %s", pair)
        try:
            for page in yahoo.fetch_fx_pair(
                pair=pair,
                start_date=start_date,
                end_date=end_date,
            ):
                if not page.records:
                    continue
                result = transform_page(page, system_date)
                stats = loader.load(result)
                total += stats
                logger.info("Yahoo FX %s page loaded: %s", pair, stats)
        except Exception as exc:
            msg = f"ECB/{pair} ingestion failed: {exc}"
            logger.error(msg, exc_info=True)
            errors.append(msg)

    # ---- Stocks via Yahoo Finance ---------------------------------------
    for ticker in yahoo_stocks:
        logger.info("Starting Yahoo Finance stock ingestion for: %s", ticker)
        try:
            for page in yahoo.fetch_stock(
                ticker=ticker,
                start_date=start_date,
                end_date=end_date,
            ):
                if not page.records:
                    continue
                result = transform_page(page, system_date)
                stats = loader.load(result)
                total += stats
                logger.info("Yahoo stock %s loaded: %s", ticker, stats)
        except Exception as exc:
            msg = f"Yahoo stock {ticker} ingestion failed: {exc}"
            logger.error(msg, exc_info=True)
            errors.append(msg)

    client.close()
    yahoo.close()

    summary = {
        "status": "partial_failure" if errors else "success",
        "data_sources_stored": total.data_sources_stored,
        "assets_stored": total.assets_stored,
        "ts_points_stored": total.ts_points_stored,
        "skipped": total.skipped,
        "errors": errors,
    }
    logger.info("Ingestion complete: %s", summary)
    return summary


if __name__ == "__main__":
    import sys
    from datetime import date

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Default: last two years of data
    result = run_ingestion(
        start_date=date(2022, 1, 1),
        end_date=date(2024, 12, 31),
    )
    print(result)
    sys.exit(0 if result["status"] == "success" else 1)
