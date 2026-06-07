from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dal.connection import get_session, close_session
from api.routers import assets, data_sources, data, ingest
from api.routers import analytics, chat, spark


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    get_session()
    yield
    close_session()


app = FastAPI(
    title="Financial Data Warehouse API",
    description=(
        "TRR SRL– Data Warehouse for Financial Markets.\n\n"
        "Provides access to financial assets, data sources, and time-series data "
        "with full temporal history support."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router, prefix="/api/v1", tags=["Assets"])
app.include_router(data_sources.router, prefix="/api/v1", tags=["Data Sources"])
app.include_router(data.router, prefix="/api/v1", tags=["Time Series"])
app.include_router(ingest.router, prefix="/api/v1", tags=["Ingestion"])
app.include_router(analytics.router, prefix="/api/v1", tags=["Analytics"])
app.include_router(chat.router,      prefix="/api/v1", tags=["AI Chat"])
app.include_router(spark.router,     prefix="/api/v1", tags=["Spark"])


@app.get("/health", tags=["System"])
def health_check() -> dict:
    return {"status": "ok"}
