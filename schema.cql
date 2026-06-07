-- ============================================================
-- Financial Data Warehouse – Cassandra Schema
-- Keyspace: financial_dw
-- Temporal rules: no in-place updates or deletes;
--   system_date DESC clustering = latest record first.
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS financial_dw
    WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    AND durable_writes = true;

-- ------------------------------------------------------------
-- Asset table  (Q1, Q2)
-- Partition key : id
-- Clustering    : system_date DESC  → most-recent version first
-- Temporal deletion marker: attributes['deleted'] = 'true'
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.asset (
    id          TEXT,
    system_date TIMESTAMP,
    name        TEXT,
    description TEXT,
    attributes  MAP<TEXT, TEXT>,
    PRIMARY KEY (id, system_date)
) WITH CLUSTERING ORDER BY (system_date DESC);

-- ------------------------------------------------------------
-- Data-source table  (Q3, Q4)
-- Same bi-temporal structure as asset.
-- attributes set stores the indicator/column names the source
-- provides (e.g. {'Open','High','Low','Close','Volume'}).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.data_source (
    id          TEXT,
    system_date TIMESTAMP,
    name        TEXT,
    description TEXT,
    attributes  SET<TEXT>,
    PRIMARY KEY (id, system_date)
) WITH CLUSTERING ORDER BY (system_date DESC);

-- ------------------------------------------------------------
-- Data (time-series) table  (Q5)
-- Partition key : (asset_id, data_source_id, business_date_year)
--   Year-sharding keeps partitions bounded even for daily data.
-- Clustering    : business_date ASC, system_date DESC
--   → range scans by date are efficient; within one business_date
--     the newest ingestion is first (temporal "latest version").
-- Temporal deletion marker: values_text['deleted'] = 'true'
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.data (
    asset_id            TEXT,
    data_source_id      TEXT,
    business_date_year  INT,
    business_date       DATE,
    system_date         TIMESTAMP,
    values_double       MAP<TEXT, DOUBLE>,
    values_int          MAP<TEXT, INT>,
    values_text         MAP<TEXT, TEXT>,
    PRIMARY KEY (
        (asset_id, data_source_id, business_date_year),
        business_date,
        system_date
    )
) WITH CLUSTERING ORDER BY (business_date ASC, system_date DESC);

-- ------------------------------------------------------------
-- Totals table – persists Spark aggregation results (Use-case A)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.totals (
    asset_id           TEXT,
    business_date_year INT,
    cnt                INT,
    PRIMARY KEY (asset_id, business_date_year)
);

-- ------------------------------------------------------------
-- Regression-data table – Spark ML training input (Use-case B)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.regression_data (
    bdate   DATE PRIMARY KEY,
    seconds BIGINT,
    open    DOUBLE,
    close   DOUBLE,
    low     DOUBLE,
    high    DOUBLE
);

-- ------------------------------------------------------------
-- Regression-results table – Spark ML output (Use-case B)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_dw.regression_results (
    seconds    BIGINT PRIMARY KEY,
    open       DOUBLE,
    prediction DOUBLE
);
