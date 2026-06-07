# Financial Data Warehouse — TRR SRL

A full-stack bi-temporal data warehouse for financial markets data, built as a UVT lab project.

## Stack

| Layer       | Technology                                              |
| ----------- | ------------------------------------------------------- |
| Storage     | Apache Cassandra 4.1 (Docker)                           |
| ETL         | Python ingestion pipeline (Nasdaq Data Link + Yahoo Finance) |
| API         | FastAPI (Python 3.12)                                   |
| Analytics   | Apache Spark 3.5 / Scala 2.12                           |
| Frontend    | React + TypeScript + Vite + Tailwind CSS + Recharts     |
| AI Chat     | Claude via Anthropic API (or compatible proxy)          |
| LLM Tools   | MCP server (Model Context Protocol)                     |

---

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Python 3.12 (with venv)
- Node.js 18+
- Java 11+ and sbt (for building Spark jobs)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your Nasdaq Data Link API key and Anthropic API key
```

### 2. Start Cassandra

```bash
docker-compose up -d
```

Wait ~60 seconds, then apply the schema:

```bash
docker exec -i cassandra-dw cqlsh < schema.cql
```

### 3. Python setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

> **Note:** On Python 3.12 you may also need `pip install pyasyncore` for the Cassandra driver.

### 4. Start the API

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload
# or:
bash run_api.sh
```

API docs: <http://localhost:8080/docs>

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000> — the Vite dev server proxies `/api` to port 8080.

### 6. Ingest data

Use the **Ingest** page in the UI, or via curl:

```bash
curl -X POST http://localhost:8080/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "bitfinex_tickers": ["BTCUSD", "ETHUSD", "LTCUSD"],
    "fx_pairs": ["EURUSD", "EURGBP"],
    "yahoo_stocks": ["AAPL", "MSFT"],
    "start_date": "2023-01-01",
    "end_date": "2024-12-31"
  }'
```

---

## Frontend Pages

| Page                  | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| Dashboard             | System health, record counts, recent assets                  |
| Assets                | Browse all ingested assets with pagination                   |
| Asset Detail          | Temporal version history and attribute metadata              |
| Data Sources          | Browse data source IDs and indicator lists                   |
| Time Series Explorer  | Interactive OHLCV chart with indicator toggles               |
| Ingest                | Configure tickers/pairs/stocks and run the ETL pipeline      |
| Analytics             | Statistics, moving averages, forecasting, risk, Spark results |

The floating **FinDW Assistant** button (bottom-right) opens an AI chat that can query live warehouse data, trigger ingestion, and run Spark jobs.

---

## REST API

| Method | Path                            | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | `/api/v1/assets`                | List all asset IDs (paginated)           |
| GET    | `/api/v1/assets/{assetId}`      | Get all temporal versions of an asset    |
| GET    | `/api/v1/data-sources`          | List all data-source IDs (paginated)     |
| GET    | `/api/v1/data-sources/{id}`     | Get data source details and indicators   |
| GET    | `/api/v1/data`                  | Get time-series data for an asset        |
| POST   | `/api/v1/ingest`                | Trigger data ingestion                   |
| GET    | `/api/v1/analytics/stats`       | Descriptive statistics + Sharpe ratio    |
| GET    | `/api/v1/analytics/moving-average` | SMA and EMA                           |
| GET    | `/api/v1/analytics/compare`     | Normalised comparison + Pearson correlation |
| GET    | `/api/v1/analytics/forecast`    | Linear trend price forecast              |
| GET    | `/api/v1/analytics/risk`        | Volatility, max drawdown, VaR            |
| GET    | `/api/v1/analytics/totals`      | Spark aggregation results                |
| GET    | `/api/v1/analytics/predictions` | Spark ML regression predictions          |
| POST   | `/api/v1/spark/compute-total`   | Run Spark ComputeTotal job               |
| POST   | `/api/v1/spark/regression`      | Run Spark LinearRegression ML job        |
| POST   | `/api/v1/chat`                  | AI chat with tool calling                |
| GET    | `/health`                       | Health check                             |

---

## Spark Analytics

Build the fat JAR first (requires sbt):

```bash
cd spark
sbt assembly
```

Jobs are executed via Docker (no local Spark installation needed):

```bash
# ComputeTotal — record counts per asset per year → stored in `totals` table
docker run --rm \
  -e CASSANDRA_HOSTS=host.docker.internal \
  -v "$(pwd)/spark:/spark-job" \
  apache/spark:3.5.0 \
  /opt/spark/bin/spark-submit \
  --class ro.uvt.info.dw.ComputeTotal --master local[*] \
  /spark-job/target/scala-2.12/financial-dw-spark-assembly-1.0.0.jar \
  financial_dw

# Regression — linear regression ML model → stored in `regression_results` table
docker run --rm \
  -e CASSANDRA_HOSTS=host.docker.internal \
  -v "$(pwd)/spark:/spark-job" \
  apache/spark:3.5.0 \
  /opt/spark/bin/spark-submit \
  --class ro.uvt.info.dw.Regression --master local[*] \
  /spark-job/target/scala-2.12/financial-dw-spark-assembly-1.0.0.jar \
  financial_dw "QDL/BITFINEX/BTCUSD" "NASDAQ-DATA-LINK.QDL/BITFINEX"
```

Or trigger them from the Analytics page or AI chat in the UI.

---

## AI Chat

The chat assistant (Claude) can answer questions about warehouse data and execute actions:

- Query statistics, forecasts, risk metrics, moving averages for any asset
- Compare two assets over a shared date range
- Trigger data ingestion for new tickers/pairs/stocks
- Run Spark aggregation or regression jobs

Configure your API key in `.env`:

```env
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

If using a compatible proxy, set `ANTHROPIC_BASE_URL` to your proxy base URL (e.g. `http://localhost:6655/anthropic`).

---

## MCP Server

The MCP server exposes warehouse tools for use with Claude Desktop or Claude Code.

```bash
bash run_mcp.sh
# or:
python -m mcp_server.server
```

To register with Claude Code, copy `.claude/settings.example.json` to `.claude/settings.json` and set the `cwd` to your project path.

### Available MCP Tools

| Tool                    | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `list_assets`           | Paginated list of all asset IDs                        |
| `get_asset_details`     | Full temporal history of an asset                      |
| `list_data_sources`     | Paginated list of all data source IDs                  |
| `get_data_source_details` | Details and indicator list for a data source         |
| `get_time_series_data`  | OHLCV data for a given asset, source, and date range   |
| `summarize_trend`       | Statistical summary (min/max/avg/change) for a period  |
| `get_statistics`        | Descriptive stats + Sharpe ratio                       |
| `compare_assets`        | Normalised comparison + Pearson correlation            |
| `forecast_price`        | Linear trend price forecast                            |
| `get_risk_metrics`      | Volatility, max drawdown, VaR                          |
| `get_moving_averages`   | SMA and EMA time series                                |

---

## Data Model

### Temporal Warehouse Rules

- **No in-place updates or deletes** — every change creates a new record with a new `system_date`
- **Deletion** = inserting a marker record with `values_text['deleted'] = 'true'`
- **Latest version** = the record with the highest `system_date` for a given `business_date`
- **Historical query** = filter `system_date <= <snapshot_time>` to reproduce past state

### Cassandra Tables

| Table                | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `asset`              | Financial assets with bi-temporal versioning    |
| `data_source`        | Data providers with attribute metadata          |
| `data`               | Time-series points, year-sharded partition key  |
| `totals`             | Spark ComputeTotal aggregation output           |
| `regression_data`    | Spark ML training data                          |
| `regression_results` | Spark ML predictions                            |

### Asset ID Conventions

| Pattern                  | Example                  | Source                      |
| ------------------------ | ------------------------ | --------------------------- |
| `QDL/BITFINEX/{TICKER}`  | `QDL/BITFINEX/BTCUSD`    | Nasdaq Data Link / Bitfinex |
| `FX/{PAIR}`              | `FX/EURUSD`              | Yahoo Finance               |
| `STOCKS/{TICKER}`        | `STOCKS/AAPL`            | Yahoo Finance               |

---
