import { useState } from 'react'
import { CheckCircle, XCircle, Download, Plus, X } from 'lucide-react'
import { triggerIngestion } from '../api/client'
import type { IngestionResponse } from '../types'
import ErrorBanner from '../components/ErrorBanner'

const DEFAULT_BITFINEX = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD']
const DEFAULT_FX = ['EURUSD', 'EURGBP']
const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'GOOGL']

const today = new Date().toISOString().split('T')[0]
const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000).toISOString().split('T')[0]

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim().toUpperCase()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="badge bg-blue-500/15 text-blue-300 flex items-center gap-1">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))}>
              <X className="w-3 h-3 hover:text-white" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={`Add ${label.toLowerCase()}…`}
        />
        <button onClick={add} className="btn-secondary px-3">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function Ingest() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_BITFINEX)
  const [pairs, setPairs] = useState<string[]>(DEFAULT_FX)
  const [stocks, setStocks] = useState<string[]>(DEFAULT_STOCKS)
  const [startDate, setStartDate] = useState(twoYearsAgo)
  const [endDate, setEndDate] = useState(today)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<IngestionResponse | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    setRunning(true)
    setResult(null)
    setError('')
    try {
      const res = await triggerIngestion({
        bitfinex_tickers: tickers,
        ecb_pairs: pairs,
        yahoo_stocks: stocks,
        start_date: startDate,
        end_date: endDate,
      })
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Data Ingestion</h1>
        <p className="text-gray-400 text-sm mt-1">
          Pull financial time-series from Nasdaq Data Link (BITFINEX crypto) and Yahoo Finance (FX rates + stocks)
        </p>
      </div>

      {/* Configuration card */}
      <div className="card space-y-5">
        <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Configuration</h2>

        <TagInput label="BITFINEX Tickers" values={tickers} onChange={setTickers} />
        <TagInput label="FX Pairs (Yahoo Finance)" values={pairs} onChange={setPairs} />
        <TagInput label="Stocks (Yahoo Finance)" values={stocks} onChange={setStocks} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Start Date</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">End Date</label>
            <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-800">
          <button
            className="btn-primary flex items-center gap-2 w-full justify-center py-2.5"
            onClick={run}
            disabled={running || tickers.length === 0 || !startDate || !endDate}
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running ingestion…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Start Ingestion
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            This runs synchronously and may take a few minutes for large date ranges.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Result */}
      {result && (
        <div className={`card border ${result.status === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-center gap-2 mb-4">
            {result.status === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-400" />
            )}
            <h2 className={`font-semibold ${result.status === 'success' ? 'text-emerald-300' : 'text-amber-300'}`}>
              Ingestion {result.status === 'success' ? 'completed successfully' : 'completed with errors'}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { label: 'Assets Stored',         value: result.assets_stored },
              { label: 'Data Sources',           value: result.data_sources_stored },
              { label: 'Time-Series Points',     value: result.ts_points_stored.toLocaleString() },
              { label: 'Skipped',                value: result.skipped },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs text-gray-400 font-medium">Errors:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400 font-mono bg-red-500/10 px-3 py-2 rounded">
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="card border-gray-800">
        <h2 className="text-sm font-medium text-gray-300 mb-3">About Ingestion</h2>
        <div className="text-sm text-gray-400 space-y-2">
          <p>
            The ingestion pipeline follows an <strong className="text-gray-300">ETL</strong> pattern:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li><strong className="text-gray-300">Extract</strong> — fetch paginated data from Nasdaq Data Link APIs</li>
            <li><strong className="text-gray-300">Transform</strong> — map provider records to the internal canonical model</li>
            <li><strong className="text-gray-300">Load</strong> — batch-write to Cassandra, creating new temporal versions</li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">
            Re-running the same ingestion is <em>idempotent</em> — existing records will simply have newer versions stored alongside them.
          </p>
        </div>
      </div>
    </div>
  )
}
