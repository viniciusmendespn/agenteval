"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getDatasetEvaluation, getDataset,
  type DatasetEvaluation, type DatasetDetail } from "@/lib/api"
import { getMetricInfo, scoreColorClasses, normalizeScore } from "@/lib/metrics"

function ScoreCircle({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400 text-3xl font-bold">—</span>
  const pct = Math.round(score * 100)
  const { ring } = scoreColorClasses(pct)
  const color = pct >= 80 ? "text-green-600" : pct >= 50 ? "text-yellow-500" : "text-red-600"
  return (
    <div className={`w-20 h-20 rounded-full ring-4 ${ring} flex flex-col items-center justify-center`}>
      <span className={`text-2xl font-bold ${color}`}>{pct}</span>
      <span className="text-xs text-gray-400">/100</span>
    </div>
  )
}

function ScorePills({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(scores).map(([k, v]) => {
        const norm = normalizeScore(k, v)
        const { pill } = scoreColorClasses(norm)
        const info = getMetricInfo(k)
        return (
          <span key={k} className={`text-xs px-2 py-0.5 rounded font-medium ${pill}`}>
            {info.shortLabel}: {norm}%
          </span>
        )
      })}
    </div>
  )
}


export default function DatasetEvaluationPage() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>()
  const [ev, setEv] = useState<DatasetEvaluation | null>(null)
  const [ds, setDs] = useState<DatasetDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getDataset(Number(id)).then(setDs).catch(() => {})
  }, [id])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    async function fetchEval() {
      try {
        const result = await getDatasetEvaluation(Number(id), Number(evalId))
        setEv(result)
        if (result.status !== "running") {
          clearInterval(timer)
        }
      } catch {
        setError(true)
        clearInterval(timer)
      }
    }
    fetchEval()
    timer = setInterval(fetchEval, 2000)
    return () => clearInterval(timer)
  }, [id, evalId])

  if (error) return <div className="text-red-600 text-sm">Erro ao carregar avaliação.</div>
  if (!ev || !ds) return <div className="text-gray-400 text-sm">Carregando...</div>

  const resultMap = Object.fromEntries(ev.results.map(r => [r.record_id, r]))
  const passed = ev.results.filter(r => r.passed).length
  const done = ev.results.length
  const total = ds.records.length
  const isRunning = ev.status === "running"

  return (
    <div>
      <div className="mb-6">
        <a href={`/datasets/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">← {ds.name}</a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex items-center gap-6">
        <ScoreCircle score={isRunning ? null : ev.overall_score} />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-lg font-bold text-gray-900">Avaliação #{ev.id}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              ev.status === "running" ? "bg-yellow-100 text-yellow-700" :
              ev.status === "completed" ? "bg-green-100 text-green-700" :
              "bg-red-100 text-red-700"
            }`}>
              {ev.status === "running" ? "processando..." : ev.status === "completed" ? "concluída" : ev.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {isRunning
              ? `${done} de ${total} registros avaliados...`
              : `${passed} de ${total} registros aprovados`}
          </p>
          {isRunning && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-48">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Input</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scores</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ds.records.map((rec, idx) => {
              const result = resultMap[rec.id]
              const isPending = !result
              const isProcessing = isRunning && isPending && idx === done
              return (
                <tr key={rec.id} className={result?.passed === false ? "bg-red-50/40" : "hover:bg-gray-50/50 transition-colors"}>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-800 line-clamp-2">{rec.input}</p>
                  </td>
                  <td className="px-4 py-3">
                    {isProcessing ? (
                      <span className="text-xs text-blue-600 font-medium animate-pulse">avaliando...</span>
                    ) : isPending ? (
                      <span className="text-xs text-gray-400">aguardando</span>
                    ) : result.error ? (
                      <span className="text-xs text-red-600 font-medium">erro</span>
                    ) : result.passed ? (
                      <span className="text-xs text-green-700 font-medium">aprovado</span>
                    ) : (
                      <span className="text-xs text-red-600 font-medium">reprovado</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {result && !result.error && <ScorePills scores={result.scores} />}
                    {result?.error && <span className="text-xs text-red-500 line-clamp-1">{result.error}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {result && (
                      <a href={`/datasets/${id}/evaluations/${evalId}/records/${rec.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium">
                        Detalhes
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
