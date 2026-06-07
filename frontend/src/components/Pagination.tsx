import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  offset: number
  limit: number
  returned: number
  onPrev: () => void
  onNext: () => void
}

export default function Pagination({ offset, limit, returned, onPrev, onNext }: PaginationProps) {
  const page = Math.floor(offset / limit) + 1
  const hasNext = returned === limit
  const hasPrev = offset > 0

  return (
    <div className="flex items-center justify-between pt-3 border-t border-gray-800 text-sm text-gray-400">
      <span>
        Showing {offset + 1}–{offset + returned}
      </span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 py-1">Page {page}</span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
