import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Search, RefreshCw } from 'lucide-react'
import { getTimeSeries, listAssets, listDataSources } from '../api/client'
import type { TimeSeriesResponse } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

const today = new Date().toISOString().split('T')[0]
const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]

const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']

function fmt(v: unknown) {
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return String(v)
}

export default function TimeSeriesExplorer() {
  const [searchParams] = useSearchParams()

  const [assetId, setAssetId] = useState(searchParams.get('asset') ?? '')
  const [sourceId, setSourceId] = useState('')
  const [startDate, setStartDate] = useState(oneYearAgo)
  const [endDate, setEndDate] = useState(today)

  const [assets, setAssets] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [data, setData] = useState<TimeSeriesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Selected indicators to show on chart
  const [activeLines, setActiveLines] = useState<Set<string>>(new Set(['close', 'last', 'value']))

  useEffect(() => {
    listAssets(0, 200).then(r => setAssets(r.items))
    listDataSources(0, 50).then(r => setSources(r.items))
  }, [])

  // Filter sources to only those matching the selected asset's dataset
  const filteredSources = (() => {
    if (!assetId) return sources
    const parts = assetId.split('/')
    const dataset = parts.slice(0, -1).join('/')
    const filtered = sources.filter(s => s.endsWith('.' + dataset) || s.endsWith('/' + dataset))
    return filtered.length > 0 ? filtered : sources
  })()

  // Auto-select source when only one matches
  useEffect(() => {
    if (assetId && filteredSources.length === 1 && sourceId !== filteredSources[0]) {
      setSourceId(filteredSources[0])
    }
  }, [assetId, filteredSources.join(',')])

  const fetchData = useCallback(() => {
    if (!assetId || !sourceId || !startDate || !endDate) return
    setLoading(true)
    setError('')
    getTimeSeries({ assetId, dataSourceId: sourceId, startBusinessDate: startDate, endBusinessDate: endDate, includeAttributes: true })
      .then(r => {
        setData(r)
        if (r.attributes && r.attributes.length > 0) {
          setActiveLines(new Set(r.attributes.slice(0, 2)))
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [assetId, sourceId, startDate, endDate])

  // Auto-fetch when navigated with ?asset= and source is already resolved
  useEffect(() => {
    if (searchParams.get('asset') && sourceId && assetId) {
      fetchData()
    }
  }, [sourceId])

  // Build chart data
  const chartData = (data?.records ?? [])
    .slice()
    .reverse()
    .map(r => ({ date: r.businessDate, ...r.values }))

  const numericColumns = data
    ? [...new Set(data.records.flatMap(r => Object.keys(r.values).filter(k => typeof r.values[k] === 'number')))]
    : []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Time Series Explorer</h1>
        <p className="text-gray-400 text-sm mt-1">Select an asset, source, and date range to explore</p>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Asset */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Asset</label>
            {assets.length > 0 ? (
              <select
                className="input"
                value={assetId}
                onChange={e => { setAssetId(e.target.value); setSourceId('') }}
              >
                <option value="">Select asset…</option>
                {assets.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <input className="input" value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="e.g. QDL/BITFINEX/BTCUSD" />
            )}
          </div>

          {/* Data Source */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Data Source</label>
            {filteredSources.length > 0 ? (
              <select
                className="input"
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
              >
                <option value="">Select source…</option>
                {filteredSources.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input className="input" value={sourceId} onChange={e => setSourceId(e.target.value)} placeholder="e.g. NASDAQ-DATA-LINK.QDL/BITFINEX" />
            )}
          </div>

          {/* Start date */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Start Date</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>

          {/* End date */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">End Date</label>
            <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="btn-primary flex items-center gap-2"
            onClick={fetchData}
            disabled={!assetId || !sourceId || loading}
          >
            <Search className="w-4 h-4" />
            Fetch Data
          </button>
          {data && (
            <span className="text-xs text-gray-400">
              {data.records.length} records returned
            </span>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner label="Fetching time-series data…" />}

      {!loading && data && data.records.length > 0 && (
        <>
          {/* Indicator toggles */}
          {numericColumns.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500">Show:</span>
              {numericColumns.map((col, i) => (
                <button
                  key={col}
                  onClick={() => setActiveLines(prev => {
                    const next = new Set(prev)
                    if (next.has(col)) next.delete(col)
                    else next.add(col)
                    return next
                  })}
                  className={`badge cursor-pointer transition-colors ${
                    activeLines.has(col)
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-500 border border-gray-700'
                  }`}
                  style={activeLines.has(col) ? { borderColor: LINE_COLORS[i % LINE_COLORS.length] + '60', color: LINE_COLORS[i % LINE_COLORS.length] } : {}}
                >
                  {col}
                </button>
              ))}
            </div>
          )}

          {/* Chart */}
          <div className="card">
            <h2 className="text-sm font-medium text-gray-300 mb-4">
              Price Chart — <span className="text-gray-500">{data.assetId}</span>
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tickFormatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v: unknown, name: string) => [fmt(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                {numericColumns
                  .filter(col => activeLines.has(col))
                  .map((col, i) => (
                    <Line
                      key={col}
                      type="monotone"
                      dataKey={col}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Raw data table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-300">Raw Records</h2>
              <span className="text-xs text-gray-500">{data.records.length} rows (newest first)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5 font-normal">Date</th>
                    {numericColumns.map(col => (
                      <th key={col} className="px-4 py-2.5 font-normal">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {data.records.slice(0, 100).map(r => (
                    <tr key={r.businessDate} className="hover:bg-gray-800/40">
                      <td className="px-4 py-2 font-mono text-gray-400">{r.businessDate}</td>
                      {numericColumns.map(col => (
                        <td key={col} className="px-4 py-2 font-mono text-gray-300">
                          {r.values[col] !== undefined ? fmt(r.values[col]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.records.length > 100 && (
                <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-800">
                  Showing first 100 rows of {data.records.length}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && data && data.records.length === 0 && (
        <div className="card text-center py-10 text-gray-500">
          No records found for this combination.
        </div>
      )}
    </div>
  )
}
