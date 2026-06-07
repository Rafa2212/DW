// ─── Asset ──────────────────────────────────────────────────────────────────
export interface AssetIdPage {
  items: string[]
  offset: number
  limit: number
  total_returned: number
}

export interface AssetDetail {
  id: string
  system_date: string
  name: string
  description: string
  attributes: Record<string, string>
}

// ─── Data Source ─────────────────────────────────────────────────────────────
export interface DataSourceIdPage {
  items: string[]
  offset: number
  limit: number
  total_returned: number
}

export interface DataSourceDetail {
  id: string
  system_date: string
  name: string
  description: string
  attributes: string[]
}

// ─── Time Series ─────────────────────────────────────────────────────────────
export interface TimeSeriesRecord {
  businessDate: string
  values: Record<string, number | string>
}

export interface TimeSeriesResponse {
  assetId: string
  dataSourceId: string
  records: TimeSeriesRecord[]
  attributes?: string[]
}

// ─── Ingestion ───────────────────────────────────────────────────────────────
export interface IngestionRequest {
  bitfinex_tickers?: string[]
  ecb_pairs?: string[]
  yahoo_stocks?: string[]
  start_date?: string
  end_date?: string
}

export interface IngestionResponse {
  status: string
  data_sources_stored: number
  assets_stored: number
  ts_points_stored: number
  skipped: number
  errors: string[]
}

// ─── Analytics ───────────────────────────────────────────────────────────────
export interface TotalRecord {
  asset_id: string
  year: number
  count: number
}

export interface PredictionRecord {
  seconds: number
  open: number
  prediction: number
}

// ─── Health ──────────────────────────────────────────────────────────────────
export interface HealthResponse {
  status: string
}
