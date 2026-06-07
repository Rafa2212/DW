from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from ingestion.raw_record import ProviderPage, RawRecord
from ingestion.transformer import transform_page, _build_asset_id


# ------------------------------------------------------------------ fixtures

def _make_bitfinex_page() -> ProviderPage:
    columns = ["ticker", "date", "high", "low", "mid", "last", "bid", "ask", "volume"]
    records = [
        RawRecord(
            ticker="BTCUSD",
            record_date=date(2024, 1, 2),
            columns=columns,
            row=["BTCUSD", "2024-01-02", 45000.0, 43000.0, 44000.0, 44100.0, 43950.0, 44050.0, 1200.5],
            provider_id="NASDAQ-DATA-LINK",
            dataset_code="QDL/BITFINEX",
        ),
        RawRecord(
            ticker="ETHUSD",
            record_date=date(2024, 1, 2),
            columns=columns,
            row=["ETHUSD", "2024-01-02", 2500.0, 2400.0, 2450.0, 2460.0, 2445.0, 2455.0, 800.0],
            provider_id="NASDAQ-DATA-LINK",
            dataset_code="QDL/BITFINEX",
        ),
    ]
    return ProviderPage(
        records=records,
        next_cursor=None,
        columns=columns,
        dataset_code="QDL/BITFINEX",
        provider_id="NASDAQ-DATA-LINK",
    )


# ------------------------------------------------------------------ tests

class TestTransformer:
    def test_asset_id_format(self) -> None:
        assert _build_asset_id("QDL/BITFINEX", "BTCUSD") == "QDL/BITFINEX/BTCUSD"

    def test_transform_produces_correct_counts(self) -> None:
        page = _make_bitfinex_page()
        system_date = datetime(2024, 6, 1, tzinfo=timezone.utc)
        result = transform_page(page, system_date)

        assert len(result.assets) == 2
        assert len(result.ts_points) == 2
        assert result.skipped == 0

    def test_transform_data_source_id(self) -> None:
        page = _make_bitfinex_page()
        result = transform_page(page, datetime.now(timezone.utc))
        assert result.data_source.id == "NASDAQ-DATA-LINK.QDL/BITFINEX"

    def test_transform_double_values(self) -> None:
        page = _make_bitfinex_page()
        result = transform_page(page, datetime.now(timezone.utc))
        btc_point = next(p for p in result.ts_points if "BTCUSD" in p.asset_id)
        assert btc_point.values_double.get("high") == pytest.approx(45000.0)
        assert btc_point.values_double.get("low") == pytest.approx(43000.0)

    def test_transform_asset_attributes(self) -> None:
        page = _make_bitfinex_page()
        result = transform_page(page, datetime.now(timezone.utc))
        btc_asset = next(a for a in result.assets if "BTCUSD" in a.id)
        assert btc_asset.attributes["symbol"] == "BTCUSD"
        assert btc_asset.attributes["provider"] == "NASDAQ-DATA-LINK"

    def test_data_source_attributes_contains_indicators(self) -> None:
        page = _make_bitfinex_page()
        result = transform_page(page, datetime.now(timezone.utc))
        # Should have all columns except ticker and date
        assert "high" in result.data_source.attributes
        assert "volume" in result.data_source.attributes
        assert "ticker" not in result.data_source.attributes
        assert "date" not in result.data_source.attributes

    def test_ts_point_year_extracted(self) -> None:
        page = _make_bitfinex_page()
        result = transform_page(page, datetime.now(timezone.utc))
        for p in result.ts_points:
            assert p.business_date_year == 2024
