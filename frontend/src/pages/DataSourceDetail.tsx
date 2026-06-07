import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock } from 'lucide-react'
import { getDataSource } from '../api/client'
import type { DataSourceDetail } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

export default function DataSourceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [versions, setVersions] = useState<DataSourceDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sourceId = decodeURIComponent(id ?? '')

  useEffect(() => {
    if (!sourceId) return
    setLoading(true)
    getDataSource(sourceId)
      .then(setVersions)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [sourceId])

  const latest = versions[0]

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold text-white font-mono break-all">{sourceId}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {versions.length} temporal version{versions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner />}

      {!loading && latest && (
        <>
          <div className="card">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
              Latest Version
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs mb-1">Name</p>
                <p className="text-gray-200">{latest.name || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Description</p>
                <p className="text-gray-200">{latest.description || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> System Date
                </p>
                <p className="text-gray-200 font-mono text-xs">
                  {new Date(latest.system_date).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Indicators */}
          <div className="card">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
              Indicator Attributes ({latest.attributes.length})
            </h2>
            {latest.attributes.length === 0 ? (
              <p className="text-gray-500 text-sm">No attributes recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {latest.attributes.map(attr => (
                  <span key={attr} className="badge bg-purple-500/15 text-purple-300 text-xs">
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* All versions */}
          {versions.length > 1 && (
            <div className="card">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                All Versions
              </h2>
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div
                    key={v.system_date}
                    className={`px-4 py-3 rounded-lg text-sm ${
                      i === 0 ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-400">
                        {new Date(v.system_date).toLocaleString()}
                      </span>
                      {i === 0 && <span className="badge bg-purple-500/20 text-purple-400">Latest</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {v.attributes.map(a => (
                        <span key={a} className="badge bg-gray-700 text-gray-300 text-xs">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
