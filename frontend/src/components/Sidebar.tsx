import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart3,
  Database,
  TrendingUp,
  Download,
  FlaskConical,
  Activity,
} from 'lucide-react'

const links = [
  { to: '/',            label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/assets',      label: 'Assets',          icon: Database },
  { to: '/data-sources',label: 'Data Sources',    icon: BarChart3 },
  { to: '/explore',     label: 'Time Series',     icon: TrendingUp },
  { to: '/ingest',      label: 'Ingestion',       icon: Download },
  { to: '/analytics',   label: 'Analytics',       icon: FlaskConical },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Activity className="text-blue-500 w-5 h-5" />
          <span className="font-semibold text-sm text-white tracking-wide">FinDW</span>
        </div>
        <p className="text-gray-500 text-xs mt-0.5">TRR SRL</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800 text-xs text-gray-600">
        API: localhost:8080
      </div>
    </aside>
  )
}
