interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'blue' | 'green' | 'amber' | 'purple'
  icon?: React.ReactNode
}

const colorMap = {
  blue:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  green:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  amber:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

export default function StatCard({ label, value, sub, color = 'blue', icon }: StatCardProps) {
  return (
    <div className={`card border ${colorMap[color].split(' ').slice(2).join(' ')}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colorMap[color].split(' ')[0]}`}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`p-2 rounded-lg ${colorMap[color].split(' ').slice(1, 2).join(' ')}`}>
            <span className={colorMap[color].split(' ')[0]}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}
