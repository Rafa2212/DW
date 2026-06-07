import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { listDataSources } from '../api/client'
import type { DataSourceIdPage } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'
import Pagination from '../components/Pagination'

const LIMIT = 20

export default function DataSources() {
  const [page, setPage] = useState<DataSourceIdPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    listDataSources(offset, LIMIT)
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
        <h1 className="text-2xl font-bold text-white">Data Sources</h1>
        <p className="text-gray-400 text-sm mt-1">Financial data providers and datasets</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Filter data sources…"
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
                  <th className="px-5 py-3">Source ID</th>
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Dataset</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                      No data sources found.
                    </td>
                  </tr>
                )}
                {displayed.map(id => {
                  const [provider, ...rest] = id.split('.')
                  const dataset = rest.join('.')
                  return (
                    <tr key={id} className="table-row-hover">
                      <td className="px-5 py-3">
                        <Link
                          to={`/data-sources/${encodeURIComponent(id)}`}
                          className="font-mono text-purple-400 hover:text-purple-300 truncate block max-w-xs"
                        >
                          {id}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className="badge bg-gray-800 text-gray-300">{provider}</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-gray-400 text-xs">{dataset}</td>
                      <td className="px-5 py-3">
                        <Link to={`/data-sources/${encodeURIComponent(id)}`}>
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
