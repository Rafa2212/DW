import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Tag, TrendingUp } from 'lucide-react'
import { getAsset } from '../api/client'
import type { AssetDetail } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [versions, setVersions] = useState<AssetDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const assetId = decodeURIComponent(id ?? '')

  useEffect(() => {
    if (!assetId) return
    setLoading(true)
    getAsset(assetId)
      .then(setVersions)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [assetId])

  const latest = versions[0]

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold text-white font-mono break-all">{assetId}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {versions.length} temporal version{versions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSpinner />}

      {!loading && latest && (
        <>
          {/* Latest version card */}
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
              <div>
                <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Attributes
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Object.entries(latest.attributes).map(([k, v]) => (
                    <span key={k} className="badge bg-gray-800 text-gray-300 text-xs">
                      <span className="text-gray-500">{k}:</span> {v}
                    </span>
                  ))}
                  {Object.keys(latest.attributes).length === 0 && (
                    <span className="text-gray-500">None</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Explore link */}
          <div className="card border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" /> Explore Time Series
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  View OHLCV charts and raw data for this asset
                </p>
              </div>
              <Link
                to={`/explore?asset=${encodeURIComponent(assetId)}`}
                className="btn-primary text-sm"
              >
                Open Explorer
              </Link>
            </div>
          </div>

          {/* Temporal history */}
          {versions.length > 1 && (
            <div className="card">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                Temporal History ({versions.length} versions)
              </h2>
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div
                    key={v.system_date}
                    className={`px-4 py-3 rounded-lg text-sm ${
                      i === 0
                        ? 'bg-blue-500/10 border border-blue-500/20'
                        : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-400">
                        {new Date(v.system_date).toLocaleString()}
                      </span>
                      {i === 0 && (
                        <span className="badge bg-blue-500/20 text-blue-400">Latest</span>
                      )}
                      {v.attributes['deleted'] === 'true' && (
                        <span className="badge bg-red-500/20 text-red-400">Deleted</span>
                      )}
                    </div>
                    {Object.keys(v.attributes).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(v.attributes).map(([k, val]) => (
                          <span key={k} className="badge bg-gray-700 text-gray-300 text-xs">
                            {k}: {val}
                          </span>
                        ))}
                      </div>
                    )}
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
