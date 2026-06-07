import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import {
  getTotals, getPredictions, getStats, getMovingAverages,
  compareAssets, getForecast, getRisk, listAssets, listDataSources,
  getDataSource,
} from '../api/client'
import type { TotalRecord, PredictionRecord } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#84cc16']

const today = new Date().toISOString().split('T')[0]
const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]

type Tab = 'spark' | 'stats' | 'ma' | 'compare' | 'forecast' | 'risk'

function sourcesForAsset(assetId: string, sources: string[]): string[] {
  if (!assetId) return sources
  // dataset = all segments except the last: "QDL/BITFINEX/BTCUSD" → "QDL/BITFINEX"
  const parts = assetId.split('/')
  const dataset = parts.slice(0, -1).join('/')
  const filtered = sources.filter(s => s.endsWith('.' + dataset) || s.endsWith('/' + dataset))
  return filtered.length > 0 ? filtered : sources
}

// Preferred indicator order — first match in the data source's attributes wins
const INDICATOR_PREF = ['close', 'last', 'mid', 'value', 'open']

function bestIndicator(attrs: string[]): string {
  return INDICATOR_PREF.find(p => attrs.includes(p)) ?? attrs[0] ?? 'close'
}

function useSourceAttrs(sourceId: string): string[] {
  const [attrs, setAttrs] = useState<string[]>([])
  useEffect(() => {
    if (!sourceId) { setAttrs([]); return }
    getDataSource(sourceId).then(versions => {
      if (versions.length > 0) setAttrs(versions[0].attributes)
    }).catch(() => setAttrs([]))
  }, [sourceId])
  return attrs
}

function AssetPicker({ assetId, sourceId, assets, sources, onAsset, onSource }: {
  assetId: string; sourceId: string
  assets: string[]; sources: string[]
  onAsset: (v: string) => void; onSource: (v: string) => void
}) {
  const filteredSources = sourcesForAsset(assetId, sources)

  useEffect(() => {
    if (assetId && filteredSources.length === 1 && sourceId !== filteredSources[0]) {
      onSource(filteredSources[0])
    }
  }, [assetId, filteredSources.join(',')])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Asset</label>
        <select className="input" value={assetId} onChange={e => { onAsset(e.target.value); onSource('') }}>
          <option value="">Select asset…</option>
          {assets.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Data Source</label>
        <select className="input" value={sourceId} onChange={e => onSource(e.target.value)}>
          <option value="">Select source…</option>
          {filteredSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

function DateRange({ start, end, onStart, onEnd }: {
  start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Start Date</label>
        <input type="date" className="input" value={start} onChange={e => onStart(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">End Date</label>
        <input type="date" className="input" value={end} onChange={e => onEnd(e.target.value)} />
      </div>
    </div>
  )
}

function RunButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled?: boolean }) {
  return (
    <button className="btn-primary px-6" onClick={onClick} disabled={loading || disabled}>
      {loading
        ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Running…</span>
        : 'Run'}
    </button>
  )
}

function StatCard({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-white font-mono">{value ?? '—'}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function groupTotalsByYear(records: TotalRecord[]) {
  const byYear: Record<number, Record<string, number>> = {}
  for (const r of records) {
    if (!byYear[r.year]) byYear[r.year] = {}
    byYear[r.year][r.asset_id] = (byYear[r.year][r.asset_id] ?? 0) + r.count
  }
  return Object.entries(byYear)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, assets]) => ({ year: Number(year), ...assets }))
}

export default function Analytics() {
  const [tab, setTab] = useState<Tab>('spark')
  const [assets, setAssets] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])

  useEffect(() => {
    listAssets(0, 200).then(r => setAssets(r.items))
    listDataSources(0, 50).then(r => setSources(r.items))
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'spark',    label: 'Spark Results' },
    { id: 'stats',    label: 'Statistics' },
    { id: 'ma',       label: 'Moving Average' },
    { id: 'compare',  label: 'Compare' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'risk',     label: 'Risk' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Data mining, aggregations, ML predictions and risk signals</p>
      </div>

      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'spark'    && <SparkTab />}
      {tab === 'stats'    && <StatsTab assets={assets} sources={sources} />}
      {tab === 'ma'       && <MATab assets={assets} sources={sources} />}
      {tab === 'compare'  && <CompareTab assets={assets} sources={sources} />}
      {tab === 'forecast' && <ForecastTab assets={assets} sources={sources} />}
      {tab === 'risk'     && <RiskTab assets={assets} sources={sources} />}
    </div>
  )
}

// ── Spark ─────────────────────────────────────────────────────────────────────
function SparkTab() {
  const [totals, setTotals] = useState<TotalRecord[]>([])
  const [predictions, setPredictions] = useState<PredictionRecord[]>([])
  const [loadingT, setLoadingT] = useState(true)
  const [loadingP, setLoadingP] = useState(true)
  const [errorT, setErrorT] = useState('')
  const [errorP, setErrorP] = useState('')

  useEffect(() => {
    getTotals().then(setTotals).catch(e => setErrorT(String(e))).finally(() => setLoadingT(false))
    getPredictions().then(setPredictions).catch(e => setErrorP(String(e))).finally(() => setLoadingP(false))
  }, [])

  const yearData = groupTotalsByYear(totals)
  const assetList = [...new Set(totals.map(r => r.asset_id))].slice(0, 8)
  const predData = predictions.slice().sort((a, b) => a.seconds - b.seconds)
    .map(r => ({ date: new Date(r.seconds * 1000).toLocaleDateString(), actual: r.open, predicted: Number(r.prediction.toFixed(2)) }))

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          Use Case A — Record Counts by Year
          <span className="badge bg-blue-500/15 text-blue-400 text-xs">Spark Aggregation</span>
        </h2>
        {errorT && <ErrorBanner message={errorT} />}
        {loadingT && <LoadingSpinner label="Loading…" />}
        {!loadingT && totals.length === 0 && !errorT && (
          <div className="card text-center py-8 text-gray-500">No data. Run the Spark ComputeTotal job first.</div>
        )}
        {!loadingT && totals.length > 0 && (
          <div className="card">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={yearData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#9ca3af' }} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
                {assetList.map((asset, i) => <Bar key={asset} dataKey={asset} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={40} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          Use Case B — Open Price Prediction
          <span className="badge bg-purple-500/15 text-purple-400 text-xs">Spark ML</span>
        </h2>
        {errorP && <ErrorBanner message={errorP} />}
        {loadingP && <LoadingSpinner label="Loading…" />}
        {!loadingP && predictions.length === 0 && !errorP && (
          <div className="card text-center py-8 text-gray-500">No data. Run the Spark Regression job first.</div>
        )}
        {!loadingP && predictions.length > 0 && (
          <div className="card">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={predData.slice(0, 50)} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#9ca3af' }} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
                <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[2, 2, 0, 0]} maxBarSize={20} />
                <Bar dataKey="predicted" fill="#a855f7" name="Predicted" radius={[2, 2, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Statistics ────────────────────────────────────────────────────────────────
function StatsTab({ assets, sources }: { assets: string[]; sources: string[] }) {
  const [assetId, setAssetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [start, setStart] = useState(oneYearAgo)
  const [end, setEnd] = useState(today)
  const [indicator, setIndicator] = useState('close')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const attrs = useSourceAttrs(sourceId)
  useEffect(() => { if (attrs.length > 0) setIndicator(bestIndicator(attrs)) }, [attrs.join(',')])

  const run = useCallback(() => {
    if (!assetId || !sourceId) return
    setLoading(true); setError(''); setData(null)
    getStats({ assetId, dataSourceId: sourceId, startDate: start, endDate: end, indicator })
      .then(setData).catch(e => setError(String(e))).finally(() => setLoading(false))
  }, [assetId, sourceId, start, end, indicator])

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <AssetPicker assetId={assetId} sourceId={sourceId} assets={assets} sources={sources} onAsset={setAssetId} onSource={setSourceId} />
        <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Indicator</label>
            <input className="input w-32" value={indicator} onChange={e => setIndicator(e.target.value)} placeholder="close" />
          </div>
          <RunButton onClick={run} loading={loading} disabled={!assetId || !sourceId} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Computing statistics…" />}
      {data && (
        <div className="card space-y-4">
          <h3 className="text-sm font-medium text-gray-300">
            <span className="text-blue-400 font-mono">{String(data.assetId)}</span>
            {' '}— <span className="text-gray-400">{String(data.indicator)}</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Min" value={Number(data.min).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="Max" value={Number(data.max).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="Mean" value={Number(data.mean).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="Median" value={Number(data.median).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="Std Dev" value={Number(data.std).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="Net Change" value={Number(data.net_change).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <StatCard label="% Change" value={data.pct_change != null ? `${Number(data.pct_change).toFixed(2)}%` : '—'} />
            <StatCard label="Sharpe (ann.)" value={data.annualised_sharpe != null ? Number(data.annualised_sharpe).toFixed(3) : '—'} />
          </div>
          <p className="text-xs text-gray-500">
            {String((data.period as Record<string, string>)?.start)} → {String((data.period as Record<string, string>)?.end)}
            {' · '}{String(data.count)} data points
          </p>
        </div>
      )}
    </div>
  )
}

// ── Moving Average ────────────────────────────────────────────────────────────
function MATab({ assets, sources }: { assets: string[]; sources: string[] }) {
  const [assetId, setAssetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [start, setStart] = useState(oneYearAgo)
  const [end, setEnd] = useState(today)
  const [indicator, setIndicator] = useState('close')
  const [window, setWindow] = useState(20)
  const [data, setData] = useState<{ date: string; value: number; sma: number | null; ema: number | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const attrs = useSourceAttrs(sourceId)
  useEffect(() => { if (attrs.length > 0) setIndicator(bestIndicator(attrs)) }, [attrs.join(',')])

  const run = useCallback(() => {
    if (!assetId || !sourceId) return
    setLoading(true); setError(''); setData([])
    getMovingAverages({ assetId, dataSourceId: sourceId, startDate: start, endDate: end, indicator, window })
      .then(r => setData(r.data)).catch(e => setError(String(e))).finally(() => setLoading(false))
  }, [assetId, sourceId, start, end, indicator, window])

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <AssetPicker assetId={assetId} sourceId={sourceId} assets={assets} sources={sources} onAsset={setAssetId} onSource={setSourceId} />
        <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Indicator</label>
            <input className="input w-28" value={indicator} onChange={e => setIndicator(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Window</label>
            <input type="number" className="input w-24" value={window} min={2} max={200}
              onChange={e => setWindow(Number(e.target.value))} />
          </div>
          <RunButton onClick={run} loading={loading} disabled={!assetId || !sourceId} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Computing moving averages…" />}
      {data.length > 0 && (
        <div className="card">
          <h3 className="text-sm text-gray-400 mb-3">{assetId} · {indicator} — SMA{window} & EMA{window}</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} width={70}
                tickFormatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#9ca3af' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
              <Line type="monotone" dataKey="value" stroke="#6b7280" dot={false} strokeWidth={1} name="Price" />
              <Line type="monotone" dataKey="sma" stroke="#3b82f6" dot={false} strokeWidth={1.5} name={`SMA${window}`} connectNulls />
              <Line type="monotone" dataKey="ema" stroke="#10b981" dot={false} strokeWidth={1.5} name={`EMA${window}`} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Compare ───────────────────────────────────────────────────────────────────
function CompareTab({ assets, sources }: { assets: string[]; sources: string[] }) {
  const [a1, setA1] = useState(''); const [s1, setS1] = useState('')
  const [a2, setA2] = useState(''); const [s2, setS2] = useState('')
  const [start, setStart] = useState(oneYearAgo)
  const [end, setEnd] = useState(today)
  const [indicator, setIndicator] = useState('close')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(() => {
    if (!a1 || !s1 || !a2 || !s2) return
    setLoading(true); setError(''); setData(null)
    compareAssets({ assetId1: a1, dataSourceId1: s1, assetId2: a2, dataSourceId2: s2, startDate: start, endDate: end, indicator })
      .then(setData).catch(e => setError(String(e))).finally(() => setLoading(false))
  }, [a1, s1, a2, s2, start, end, indicator])

  const norm1 = data ? ((data.asset1 as Record<string, unknown>)?.normalised as { date: string; value: number }[] ?? []) : []
  const norm2 = data ? ((data.asset2 as Record<string, unknown>)?.normalised as { date: string; value: number }[] ?? []) : []
  const chartData = norm1.map((p, i) => ({ date: p.date, [a1]: p.value, [a2]: norm2[i]?.value }))

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Asset 1</p>
            <select className="input" value={a1} onChange={e => setA1(e.target.value)}>
              <option value="">Select…</option>{assets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input" value={s1} onChange={e => setS1(e.target.value)}>
              <option value="">Select source…</option>{sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Asset 2</p>
            <select className="input" value={a2} onChange={e => setA2(e.target.value)}>
              <option value="">Select…</option>{assets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input" value={s2} onChange={e => setS2(e.target.value)}>
              <option value="">Select source…</option>{sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Indicator</label>
            <input className="input w-28" value={indicator} onChange={e => setIndicator(e.target.value)} />
          </div>
          <RunButton onClick={run} loading={loading} disabled={!a1 || !s1 || !a2 || !s2} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Comparing assets…" />}
      {data && chartData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-gray-400">Normalised Performance (base = 100)</h3>
            {data.correlation != null && (
              <span className="badge bg-blue-500/15 text-blue-300 text-xs">
                Correlation: {Number(data.correlation).toFixed(3)}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={100} stroke="#374151" strokeDasharray="4 4" />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#9ca3af' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
              <Line type="monotone" dataKey={a1} stroke="#3b82f6" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey={a2} stroke="#10b981" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Forecast ──────────────────────────────────────────────────────────────────
function ForecastTab({ assets, sources }: { assets: string[]; sources: string[] }) {
  const [assetId, setAssetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [start, setStart] = useState(oneYearAgo)
  const [end, setEnd] = useState(today)
  const [indicator, setIndicator] = useState('close')
  const [horizon, setHorizon] = useState(7)
  const [data, setData] = useState<{
    forecasts: { date: string; forecast: number }[]
    last_known: { date: string; value: number }
    slope_per_day: number
    assetId: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const attrs = useSourceAttrs(sourceId)
  useEffect(() => { if (attrs.length > 0) setIndicator(bestIndicator(attrs)) }, [attrs.join(',')])

  const run = useCallback(() => {
    if (!assetId || !sourceId) return
    setLoading(true); setError(''); setData(null)
    getForecast({ assetId, dataSourceId: sourceId, startDate: start, endDate: end, indicator, horizon })
      .then(setData).catch(e => setError(String(e))).finally(() => setLoading(false))
  }, [assetId, sourceId, start, end, indicator, horizon])

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <AssetPicker assetId={assetId} sourceId={sourceId} assets={assets} sources={sources} onAsset={setAssetId} onSource={setSourceId} />
        <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Indicator</label>
            <input className="input w-28" value={indicator} onChange={e => setIndicator(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Horizon (days)</label>
            <input type="number" className="input w-24" value={horizon} min={1} max={30}
              onChange={e => setHorizon(Number(e.target.value))} />
          </div>
          <RunButton onClick={run} loading={loading} disabled={!assetId || !sourceId} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Forecasting…" />}
      {data && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm text-gray-400">{data.assetId} — {indicator} forecast</h3>
            <span className="badge bg-amber-500/15 text-amber-400 text-xs">
              Linear Trend · slope {data.slope_per_day > 0 ? '+' : ''}{data.slope_per_day.toFixed(4)}/day
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Last known: <span className="text-gray-300 font-mono">{data.last_known.date} = {data.last_known.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          </p>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Forecast</th>
                  <th className="px-5 py-3">Δ from last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {data.forecasts.map(f => (
                  <tr key={f.date} className="hover:bg-gray-800/40">
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-400">{f.date}</td>
                    <td className="px-5 py-2.5 font-mono text-amber-400">
                      {f.forecast.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-5 py-2.5 text-xs font-mono">
                      <span className={f.forecast >= data.last_known.value ? 'text-emerald-400' : 'text-red-400'}>
                        {f.forecast >= data.last_known.value ? '+' : ''}
                        {(f.forecast - data.last_known.value).toFixed(4)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Risk ──────────────────────────────────────────────────────────────────────
function RiskTab({ assets, sources }: { assets: string[]; sources: string[] }) {
  const [assetId, setAssetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [start, setStart] = useState(oneYearAgo)
  const [end, setEnd] = useState(today)
  const [indicator, setIndicator] = useState('close')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const attrs = useSourceAttrs(sourceId)
  useEffect(() => { if (attrs.length > 0) setIndicator(bestIndicator(attrs)) }, [attrs.join(',')])

  const run = useCallback(() => {
    if (!assetId || !sourceId) return
    setLoading(true); setError(''); setData(null)
    getRisk({ assetId, dataSourceId: sourceId, startDate: start, endDate: end, indicator })
      .then(setData).catch(e => setError(String(e))).finally(() => setLoading(false))
  }, [assetId, sourceId, start, end, indicator])

  const varPctKey = Object.keys(data ?? {}).find(k => k.startsWith('historical_var_') && k.endsWith('_pct')) ?? ''

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <AssetPicker assetId={assetId} sourceId={sourceId} assets={assets} sources={sources} onAsset={setAssetId} onSource={setSourceId} />
        <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Indicator</label>
            <input className="input w-28" value={indicator} onChange={e => setIndicator(e.target.value)} />
          </div>
          <RunButton onClick={run} loading={loading} disabled={!assetId || !sourceId} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Computing risk metrics…" />}
      {data && (
        <div className="card space-y-4">
          <h3 className="text-sm font-medium text-gray-300">{String(data.assetId)} — Risk Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Daily Volatility" value={`${(Number(data.daily_volatility) * 100).toFixed(3)}%`} />
            <StatCard label="Ann. Volatility" value={`${(Number(data.annualised_volatility) * 100).toFixed(2)}%`} />
            <StatCard label="Max Drawdown" value={`${Number(data.max_drawdown_pct).toFixed(2)}%`} />
            <StatCard label="VaR 95%" value={varPctKey && data[varPctKey] != null ? `${Number(data[varPctKey]).toFixed(3)}%` : '—'} />
          </div>
          <div className="bg-gray-800/40 rounded-lg p-4 text-xs text-gray-400 space-y-1.5">
            <p><span className="text-gray-300">Period:</span> {String((data.period as Record<string, string>)?.start)} → {String((data.period as Record<string, string>)?.end)}</p>
            <p><span className="text-gray-300">VaR (95%):</span> With 95% confidence, daily loss will not exceed <span className="text-red-400 font-mono">{varPctKey && data[varPctKey] != null ? `${Math.abs(Number(data[varPctKey])).toFixed(3)}%` : '—'}</span> of position value.</p>
            <p><span className="text-gray-300">Max Drawdown:</span> Largest peak-to-trough decline was <span className="text-red-400 font-mono">{Number(data.max_drawdown_pct).toFixed(2)}%</span>.</p>
            <p><span className="text-gray-300">Ann. Volatility:</span> <span className="text-gray-200 font-mono">{(Number(data.annualised_volatility) * 100).toFixed(2)}%</span> — {Number(data.annualised_volatility) > 0.5 ? '⚠ High volatility asset' : Number(data.annualised_volatility) > 0.2 ? 'Moderate volatility' : 'Low volatility asset'}.</p>
          </div>
        </div>
      )}
    </div>
  )
}
