from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Patch Cassandra connection before importing the app
with patch("dal.connection._connect") as _mock_connect:
    _mock_connect.return_value = MagicMock()
    from api.main import app

client = TestClient(app, raise_server_exceptions=False)


class TestHealthEndpoint:
    def test_health_ok(self) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestAssetsEndpoint:
    def test_list_assets_pagination_params(self) -> None:
        with patch("api.routers.assets.AssetRepository") as MockRepo:
            MockRepo.return_value.get_all_ids.return_value = ["QDL/BITFINEX/BTCUSD"]
            resp = client.get("/api/v1/assets?offset=0&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["offset"] == 0
        assert data["limit"] == 10

    def test_list_assets_invalid_limit(self) -> None:
        resp = client.get("/api/v1/assets?limit=999")
        assert resp.status_code == 422  # validation error

    def test_get_asset_not_found(self) -> None:
        with patch("api.routers.assets.AssetRepository") as MockRepo:
            MockRepo.return_value.get_by_id.return_value = []
            resp = client.get("/api/v1/assets/UNKNOWN/ASSET")
        assert resp.status_code == 404


class TestDataEndpoint:
    def test_invalid_date_format(self) -> None:
        resp = client.get(
            "/api/v1/data",
            params={
                "assetId": "QDL/BITFINEX/BTCUSD",
                "dataSourceId": "NASDAQ-DATA-LINK.QDL/BITFINEX",
                "startBusinessDate": "not-a-date",
                "endBusinessDate": "2024-01-01",
            },
        )
        assert resp.status_code == 400

    def test_start_after_end_rejected(self) -> None:
        resp = client.get(
            "/api/v1/data",
            params={
                "assetId": "QDL/BITFINEX/BTCUSD",
                "dataSourceId": "NASDAQ-DATA-LINK.QDL/BITFINEX",
                "startBusinessDate": "2024-06-01",
                "endBusinessDate": "2024-01-01",
            },
        )
        assert resp.status_code == 400
