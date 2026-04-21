"use client"
import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Filter, Loader2 } from "lucide-react"
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from "recharts"
import { getDatasetEvaluation, getDataset,
  type DatasetEvaluation, type DatasetDetail } from "@/lib/api"
import { getMetricInfo, scoreColorClasses, normalizeScore } from "@/lib/metrics"
import { cn } from "@/lib/cn"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

// ---------- helpers ----------

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

type MetricBreakdown = Record<string, { avg: number; passed_count: number; total_count: number }>

function MetricBreakdownCard({ breakdown }: { breakdown: MetricBreakdown }) {
  const radarData = Object.entries(breakdown).map(([k, v]) => {
    const info = getMetricInfo(k)
    const norm = info.invertScore ? Math.round((1 - v.avg) * 100) : Math.round(v.avg * 100)
    return { subject: info.shortLabel, score: norm, fullMark: 100 }
  })

  return (
    <div className="flame-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Breakdown por métrica</h2>
        <span className="text-xs text-gray-400">100% = ótimo</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {Object.entries(breakdown).map(([k, v]) => {
            const info = getMetricInfo(k)
            const norm = info.invertScore ? Math.round((1 - v.avg) * 100) : Math.round(v.avg * 100)
            const { bar, text } = scoreColorClasses(norm)
            return (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{info.label}</span>
                  <span className={`font-semibold ${text}`}>
                    {norm}%{" "}
                    <span className="text-gray-400 font-normal">
                      ({v.passed_count}/{v.total_count} aprovados)
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${norm}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        {radarData.length >= 3 && (
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip formatter={(v) => [`${v}%`, "Score"]} />
                <Radar dataKey="score" stroke="#ec0000" fill="#ec0000" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- page ----------

type FilterStatus = "all" | "passed" | "failed" | "error"

export default function DatasetEvaluationPage() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>()
  const [ev, setEv] = useState<DatasetEvaluation | null>(null)
  const [ds, setDs] = useState<DatasetDetail | null>(null)
  const [error, setError] = useState(false)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    getDataset(Number(id)).then(setDs).catch(() => {})
  }, [id])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    async function fetchEval() {
      try {
        const result = await getDatasetEvaluation(Number(id), Number(evalId))
        setEv(result)
        if (result.status !== "running") clearInterval(timer)
      } catch {
        setError(true)
        clearInterval(timer)
      }
    }
    fetchEval()
    timer = setInterval(fetchEval, 2000)
    return () => clearInterval(timer)
  }, [id, evalId])

  const breakdown = useMemo<MetricBreakdown>(() => {
    if (!ev || ev.status !== "completed") return {}
    const acc: MetricBreakdown = {}
    for (const r of ev.results) {
      if (!r.scores) continue
      for (const [metric, raw] of Object.entries(r.scores)) {
        if (!acc[metric]) acc[metric] = { avg: 0, passed_count: 0, total_count: 0 }
        acc[metric].avg += raw
        acc[metric].total_count += 1
        const info = getMetricInfo(metric)
        const norm = info.invertScore ? (1 - raw) : raw
        if (norm >= 0.5) acc[metric].passed_count += 1
      }
    }
    for (const k of Object.keys(acc)) {
      acc[k].avg = acc[k].avg / acc[k].total_count
    }
    return acc
  }, [ev])

  const resultMap = useMemo(
    () => Object.fromEntries((ev?.results ?? []).map(r => [r.record_id, r])),
    [ev]
  )

  const filteredRecords = useMemo(() => {
    if (!ds) return []
    return ds.records.filter(rec => {
      const result = resultMap[rec.id]
      if (filterStatus === "passed" && result?.passed !== true) return false
      if (filterStatus === "failed" && result?.passed !== false) return false
      if (filterStatus === "error" && !result?.error) return false
      if (searchText) {
        const lower = searchText.toLowerCase()
        if (!rec.input?.toLowerCase().includes(lower)) return false
      }
      return true
    })
  }, [ds, resultMap, filterStatus, searchText])

  if (error) return <div className="text-red-600 text-sm">Erro ao carregar avaliação.</div>
  if (!ev || !ds) return <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>

  const passed = ev.results.filter(r => r.passed).length
  const done = ev.results.length
  const total = ds.records.length
  const isRunning = ev.status === "running"

  return (
    <div className="space-y-5">
      <Breadcrumb items={[
        { label: "Datasets", href: "/datasets" },
        { label: ds.name, href: `/datasets/${id}` },
        { label: `Avaliação #${evalId}` },
      ]} />

      {/* Header */}
      <div className="flame-panel p-5 flex items-center gap-6">
        <ScoreCircle score={isRunning ? null : ev.overall_score} />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900">Avaliação #{ev.id}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              ev.status === "running"   ? "bg-yellow-100 text-yellow-700" :
              ev.status === "completed" ? "bg-green-100 text-green-700"  :
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
            <div className="mt-2 flex items-center gap-3 w-full max-w-xs">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${total > 0 ? (done / total) * 100 : 0}%`,
                    background: "var(--santander-red)",
                  }}
                />
              </div>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* Breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <MetricBreakdownCard breakdown={breakdown} />
      )}

      {/* Tabela */}
      <div className="flame-panel overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "passed", "failed", "error"] as FilterStatus[]).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
                  filterStatus === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}>
                {s === "all" ? "Todos" : s === "passed" ? "Aprovados" : s === "failed" ? "Reprovados" : "Erros"}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Buscar por input..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          <span className="text-xs text-gray-400">{filteredRecords.length} resultado(s)</span>
        </div>

        <table className="flame-table">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Input</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scores</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRecords.map((rec, idx) => {
              const result = resultMap[rec.id]
              const isPending = !result
              const isProcessing = isRunning && isPending && idx === done
              return (
                <tr
                  key={rec.id}
                  className={cn(
                    result?.passed === false && !result?.error ? "bg-red-50/40" : "",
                    "hover:bg-gray-50/50 transition-colors"
                  )}
                >
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
                    {result?.error && (
                      <span className="text-xs text-red-500 line-clamp-1">{result.error}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {result && (
                      <a
                        href={`/datasets/${id}/evaluations/${evalId}/records/${rec.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium"
                      >
                        Detalhes
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Nenhum resultado corresponde ao filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
