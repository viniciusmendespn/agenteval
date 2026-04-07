"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getDatasetEvaluation, getDataset, getProfile,
  type DatasetEvaluation, type DatasetDetail, type EvaluationProfile } from "@/lib/api"
import { getMetricInfo, normalizeScore, scoreColorClasses } from "@/lib/metrics"

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

function RecordDetailModal({ record, result, criteria, onClose }: {
  record: { input: string; actual_output?: string }
  result: { scores: Record<string, number>; reasons: Record<string, string> }
  criteria: string[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Detalhes do registro</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">x</button>
        </div>
        <div className="overflow-auto p-5 flex-1 space-y-5">
          {/* Input */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Entrada</h3>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.input}</p>
          </div>

          {/* Resposta */}
          {record.actual_output && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resposta</h3>
              <div className="prose prose-sm max-w-none text-gray-700
                prose-headings:font-semibold prose-headings:text-gray-900
                prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                prose-table:text-sm prose-th:bg-gray-50 prose-th:font-semibold
                prose-strong:text-gray-900 prose-li:my-0.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{record.actual_output}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Métricas */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Métricas</h3>
            <p className="text-xs text-gray-400 mb-3">100% = ótimo</p>
            <div className="space-y-4">
              {Object.entries(result.scores).map(([k, v]) => {
                const info = getMetricInfo(k)
                const norm = normalizeScore(k, v)
                const { bar, badge } = scoreColorClasses(norm)
                const reason = result.reasons?.[k]
                const criterionText = k.startsWith("criterion_")
                  ? criteria[Number(k.replace("criterion_", ""))]
                  : null

                return (
                  <div key={k} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{info.label}</span>
                        {criterionText && <p className="text-xs text-gray-400 italic">"{criterionText}"</p>}
                      </div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${badge}`}>{norm}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${norm}%` }} />
                    </div>
                    {reason && (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-1">Motivo</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DatasetEvaluationPage() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>()
  const [ev, setEv] = useState<DatasetEvaluation | null>(null)
  const [ds, setDs] = useState<DatasetDetail | null>(null)
  const [profile, setProfile] = useState<EvaluationProfile | null>(null)
  const [error, setError] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)

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
          getProfile(result.profile_id).then(setProfile).catch(() => {})
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

  const recordMap = Object.fromEntries(ds.records.map(r => [r.id, r]))
  const resultMap = Object.fromEntries(ev.results.map(r => [r.record_id, r]))
  const passed = ev.results.filter(r => r.passed).length
  const done = ev.results.length
  const total = ds.records.length
  const isRunning = ev.status === "running"
  const criteria = profile?.criteria ?? []

  const selectedRecord = selectedRecordId != null ? recordMap[selectedRecordId] : null
  const selectedResult = selectedRecordId != null ? resultMap[selectedRecordId] : null

  return (
    <div>
      {selectedRecord && selectedResult && (
        <RecordDetailModal
          record={selectedRecord}
          result={selectedResult}
          criteria={criteria}
          onClose={() => setSelectedRecordId(null)}
        />
      )}

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
                    {result && !result.error && (
                      <button onClick={() => setSelectedRecordId(rec.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium">
                        Detalhes
                      </button>
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
