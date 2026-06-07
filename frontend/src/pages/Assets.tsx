import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronRight } from 'lucide-react'
import { listAssets } from '../api/client'
import type { AssetIdPage } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'

const LIMIT = 20

function assetClass(id: string): string {
  if (id.includes('BITFINEX')) return 'Crypto'
  if (id.includes('ECB')) return 'FX'
  if (id.includes('WIKI') || id.includes('EOD')) return 'Stock'
  return 'Other'
}

const classBadge: Record<string, string> = {
  Crypto: 'badge bg-amber-500/15 text-amber-400',
  FX:     'badge bg-purple-500/15 text-purple-400',
  Stock:  'badge bg-blue-500/15 text-blue-400',
  Other:  'badge bg-gray-500/15 text-gray-400',
}

export default function Assets() {
  const [page, setPage] = useState<AssetIdPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    listAssets(offset, LIMIT)
      .then(setPage)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [offset])

  const displayed = filter
    ? (page?.items ?? []).filter(id => id.toLowerCase().includes(filter.toLowerCase()))
    : (page?.items ?? [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Assets</h1>
        <p className="text-gray-400 text-sm mt-1">All financial instruments in the warehouse</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Filter by symbol or dataset…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner />}

      {!loading && page && (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Asset ID</th>
                  <th className="px-5 py-3">Class</th>
                  <th className="px-5 py-3">Ticker</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                      No assets found.
                    </td>
                  </tr>
                )}
                {displayed.map(id => {
                  const parts = id.split('/')
                  const ticker = parts[parts.length - 1]
                  const cls = assetClass(id)
                  return (
                    <tr key={id} className="table-row-hover">
                      <td className="px-5 py-3">
                        <Link
                          to={`/assets/${encodeURIComponent(id)}`}
                          className="font-mono text-blue-400 hover:text-blue-300 truncate block max-w-xs"
                        >
                          {id}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className={classBadge[cls] ?? classBadge.Other}>{cls}</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-gray-300">{ticker}</td>
                      <td className="px-5 py-3">
                        <Link to={`/assets/${encodeURIComponent(id)}`}>
                          <ChevronRight className="w-4 h-4 text-gray-600 hover:text-gray-300" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!filter && (
            <Pagination
              offset={offset}
              limit={LIMIT}
              returned={page.total_returned}
              onPrev={() => setOffset(o => Math.max(0, o - LIMIT))}
              onNext={() => setOffset(o => o + LIMIT)}
            />
          )}
        </>
      )}
    </div>
  )
}
