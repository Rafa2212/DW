import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, BarChart3, TrendingUp, CheckCircle, XCircle, Activity } from 'lucide-react'
import { getHealth, listAssets, listDataSources } from '../api/client'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Dashboard() {
  const [health, setHealth] = useState<'ok' | 'error' | 'loading'>('loading')
  const [assetCount, setAssetCount] = useState<number | null>(null)
  const [sourceCount, setSourceCount] = useState<number | null>(null)
  const [recentAssets, setRecentAssets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getHealth().then(() => setHealth('ok')).catch(() => setHealth('error')),
      listAssets(0, 6).then(r => {
        setAssetCount(r.total_returned)
        setRecentAssets(r.items)
      }),
      listAssets(0, 200).then(r => setAssetCount(r.total_returned)),
      listDataSources(0, 200).then(r => setSourceCount(r.total_returned)),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading dashboard…" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Financial Data Warehouse — TRR SRL
        </p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 text-sm">
        {health === 'ok' ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle className="w-4 h-4" /> API online
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-400">
            <XCircle className="w-4 h-4" /> API unreachable
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Assets"
          value={assetCount ?? '—'}
          sub="unique financial instruments"
          color="blue"
          icon={<Database className="w-4 h-4" />}
        />
        <StatCard
          label="Data Sources"
          value={sourceCount ?? '—'}
          sub="providers ingested"
          color="purple"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="API Status"
          value={health === 'ok' ? 'Online' : 'Offline'}
          color={health === 'ok' ? 'green' : 'amber'}
          icon={<Activity className="w-4 h-4" />}
        />
        <StatCard
          label="Temporal Model"
          value="Active"
          sub="no in-place updates"
          color="green"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      {/* Recent Assets + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent assets */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Assets</h2>
            <Link to="/assets" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          {recentAssets.length === 0 ? (
            <p className="text-gray-500 text-sm">No assets ingested yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentAssets.map(id => (
                <li key={id}>
                  <Link
                    to={`/assets/${encodeURIComponent(id)}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-sm font-mono text-gray-300 truncate">{id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick links */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { to: '/ingest',   label: 'Run Ingestion',           desc: 'Pull data from Nasdaq Data Link' },
              { to: '/explore',  label: 'Explore Time Series',     desc: 'Chart & analyse OHLCV data' },
              { to: '/analytics',label: 'View Analytics',          desc: 'Spark aggregation & predictions' },
              { to: '/assets',   label: 'Browse Assets',           desc: 'All financial instruments' },
            ].map(({ to, label, desc }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-800
                           hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
                <span className="text-gray-600 group-hover:text-blue-400 text-lg">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture note */}
      <div className="card border-gray-800">
        <h2 className="font-semibold text-white mb-3">Data Model Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
          <div>
            <p className="font-medium text-gray-300 mb-1">Temporal Rules</p>
            <p>No in-place updates or deletes. Every change creates a new record with a new <code className="text-blue-400">system_date</code>.</p>
          </div>
          <div>
            <p className="font-medium text-gray-300 mb-1">Partitioning</p>
            <p>Time-series sharded by <code className="text-blue-400">(asset, source, year)</code> to keep Cassandra partitions bounded.</p>
          </div>
          <div>
            <p className="font-medium text-gray-300 mb-1">Provenance</p>
            <p>Each record tracks its origin data source and ingestion timestamp for full audit trail.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
