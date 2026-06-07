from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


class Settings:
    cassandra_hosts: list[str] = os.getenv("CASSANDRA_HOSTS", "localhost").split(",")
    cassandra_port: int = int(os.getenv("CASSANDRA_PORT", "9042"))
    cassandra_keyspace: str = os.getenv("CASSANDRA_KEYSPACE", "financial_dw")
    nasdaq_api_key: str = os.getenv("NASDAQ_API_KEY", "")
    nasdaq_base_url: str = os.getenv("NASDAQ_BASE_URL", "https://data.nasdaq.com/api/v3")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8080"))
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_base_url: str = os.getenv("ANTHROPIC_BASE_URL", "http://localhost:6655")


@lru_cache
def get_settings() -> Settings:
    return Settings()
