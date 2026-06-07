import type {
  AssetIdPage,
  AssetDetail,
  DataSourceIdPage,
  DataSourceDetail,
  TimeSeriesResponse,
  IngestionRequest,
  IngestionResponse,
  TotalRecord,
  PredictionRecord,
  HealthResponse,
} from '../types'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── Health ──────────────────────────────────────────────────────────────────
export const getHealth = () => request<HealthResponse>('/health')

// ─── Assets ──────────────────────────────────────────────────────────────────
export const listAssets = (offset = 0, limit = 20) =>
  request<AssetIdPage>(`${BASE}/assets?offset=${offset}&limit=${limit}`)

export const getAsset = (assetId: string) =>
  request<AssetDetail[]>(`${BASE}/assets/${encodeURIComponent(assetId)}`)

// ─── Data Sources ─────────────────────────────────────────────────────────────
export const listDataSources = (offset = 0, limit = 20) =>
  request<DataSourceIdPage>(`${BASE}/data-sources?offset=${offset}&limit=${limit}`)

export const getDataSource = (sourceId: string) =>
  request<DataSourceDetail[]>(`${BASE}/data-sources/${encodeURIComponent(sourceId)}`)

// ─── Time Series ─────────────────────────────────────────────────────────────
export interface TimeSeriesParams {
  assetId: string
  dataSourceId: string
  startBusinessDate: string
  endBusinessDate: string
  includeAttributes?: boolean
}

export const getTimeSeries = (params: TimeSeriesParams) => {
  const q = new URLSearchParams({
    assetId: params.assetId,
    dataSourceId: params.dataSourceId,
    startBusinessDate: params.startBusinessDate,
    endBusinessDate: params.endBusinessDate,
    includeAttributes: String(params.includeAttributes ?? true),
  })
  return request<TimeSeriesResponse>(`${BASE}/data?${q}`)
}

// ─── Ingestion ───────────────────────────────────────────────────────────────
export const triggerIngestion = (body: IngestionRequest) =>
  request<IngestionResponse>(`${BASE}/ingest`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ─── Analytics ───────────────────────────────────────────────────────────────
export const getTotals = (assetId?: string) => {
  const q = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : ''
  return request<TotalRecord[]>(`${BASE}/analytics/totals${q}`)
}

export const getPredictions = () =>
  request<PredictionRecord[]>(`${BASE}/analytics/predictions`)

export interface StatsParams {
  assetId: string; dataSourceId: string; startDate: string; endDate: string; indicator?: string
}
export const getStats = (p: StatsParams) =>
  request<Record<string, unknown>>(`${BASE}/analytics/stats?${new URLSearchParams({
    assetId: p.assetId, dataSourceId: p.dataSourceId,
    startDate: p.startDate, endDate: p.endDate, indicator: p.indicator ?? 'close',
  })}`)

export const getMovingAverages = (p: StatsParams & { window?: number }) =>
  request<{ data: { date: string; value: number; sma: number | null; ema: number | null }[]; window: number; indicator: string; assetId: string }>(`${BASE}/analytics/moving-average?${new URLSearchParams({
    assetId: p.assetId, dataSourceId: p.dataSourceId,
    startDate: p.startDate, endDate: p.endDate,
    indicator: p.indicator ?? 'close', window: String(p.window ?? 20),
  })}`)

export interface CompareParams {
  assetId1: string; dataSourceId1: string
  assetId2: string; dataSourceId2: string
  startDate: string; endDate: string; indicator?: string
}
export const compareAssets = (p: CompareParams) =>
  request<Record<string, unknown>>(`${BASE}/analytics/compare?${new URLSearchParams({
    assetId1: p.assetId1, dataSourceId1: p.dataSourceId1,
    assetId2: p.assetId2, dataSourceId2: p.dataSourceId2,
    startDate: p.startDate, endDate: p.endDate, indicator: p.indicator ?? 'close',
  })}`)

export const getForecast = (p: StatsParams & { horizon?: number }) =>
  request<{ forecasts: { date: string; forecast: number }[]; last_known: { date: string; value: number }; slope_per_day: number; indicator: string; assetId: string }>(`${BASE}/analytics/forecast?${new URLSearchParams({
    assetId: p.assetId, dataSourceId: p.dataSourceId,
    startDate: p.startDate, endDate: p.endDate,
    indicator: p.indicator ?? 'close', horizon: String(p.horizon ?? 7),
  })}`)

export const getRisk = (p: StatsParams) =>
  request<Record<string, unknown>>(`${BASE}/analytics/risk?${new URLSearchParams({
    assetId: p.assetId, dataSourceId: p.dataSourceId,
    startDate: p.startDate, endDate: p.endDate, indicator: p.indicator ?? 'close',
  })}`)

