"use client"
import { useState } from "react"
import { getMetricInfo, normalizeScore, scoreColorClasses } from "@/lib/metrics"

interface Props {
  scores: Record<string, number>
  reasons: Record<string, string>
  criteria?: string[]
}

export default function ScoreDetail({ scores, reasons, criteria = [] }: Props) {
  const [open, setOpen] = useState(false)

  const entries = Object.entries(scores)
  if (entries.length === 0) return null

  return (
    <div>
      {/* Pills compactas */}
      <div className="flex gap-1 flex-wrap">
        {entries.map(([k, v]) => {
          const norm = normalizeScore(k, v)
          const { pill } = scoreColorClasses(norm)
          const info = getMetricInfo(k)
          return (
            <span key={k} className={`text-xs px-2 py-0.5 rounded font-medium ${pill}`}>
              {info.shortLabel}: {norm}%
            </span>
          )
        })}
        {Object.keys(reasons).length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-xs text-gray-400 hover:text-blue-600 underline underline-offset-2 ml-1"
          >
            {open ? "ocultar" : "motivos"}
          </button>
        )}
      </div>

      {/* Detalhes expandidos */}
      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {entries.map(([k, v]) => {
            const norm = normalizeScore(k, v)
            const { bar, text } = scoreColorClasses(norm)
            const info = getMetricInfo(k)
            const reason = reasons[k]
            const criterionText = k.startsWith("criterion_")
              ? criteria[Number(k.replace("criterion_", ""))]
              : null

            return (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-700">{info.label}</span>
                    {criterionText && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">"{criterionText}"</p>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${text}`}>{norm}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${norm}%` }} />
                </div>
                {reason && (
                  <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded p-2 mt-1">
                    {reason}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
