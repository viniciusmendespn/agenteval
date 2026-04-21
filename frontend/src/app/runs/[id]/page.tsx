"use client"
import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { getRun, getTestCases, getProfile, getRunBreakdown, cancelRun,
  type TestRun, type TestCase, type EvaluationProfile, type RunBreakdown } from "@/lib/api"
import { getMetricInfo, normalizeScore, scoreColorClasses } from "@/lib/metrics"
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts"
import { Filter, ChevronLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/cn"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

function ScoreCircle({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400 text-3xl font-bold">—</span>
  const pct = Math.round(score * 100)
  const { ring } = scoreColorClasses(pct)
  const color = pct >= 80 ? "text-green-600" : pct >= 50 ? "text-yellow-600" : "text-red-600"
  return (
    <div className={`w-20 h-20 rounded-full ring-4 ${ring} flex flex-col items-center justify-center`}>
      <span className={`text-2xl font-bold ${color}`}>{pct}</span>
      <span className="text-xs text-gray-400">/100</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running:   "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    failed:    "bg-red-100 text-red-700",
    cancelled: "bg-orange-100 text-orange-700",
    pending:   "bg-gray-100 text-gray-500",
  }
  const labels: Record<string, string> = {
    running: "Executando", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada", pending: "Pendente",
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[status] ?? map.pending}`}>
      {labels[status] ?? status}
    </span>
  )
}

function ScorePills({ scores, criteria = [] }: { scores: Record<string, number>; criteria?: string[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(scores).map(([k, v]) => {
        const norm = normalizeScore(k, v)
        const { pill } = scoreColorClasses(norm)
        const info = getMetricInfo(k)
        const tooltipText = k.startsWith("criterion_")
          ? criteria[Number(k.replace("criterion_", ""))]
          : info.description
        return (
          <span key={k} title={tooltipText} className={`text-xs px-2 py-0.5 rounded font-medium cursor-help ${pill}`}>
            {info.shortLabel}: {norm}%
          </span>
        )
      })}
    </div>
  )
}

function MetricBreakdownCard({ breakdown }: { breakdown: RunBreakdown }) {
  const radarData = Object.entries(breakdown.metric_breakdown).map(([k, v]) => {
    const info = getMetricInfo(k)
    const norm = info.invertScore ? Math.round((1 - v.avg) * 100) : Math.round(v.avg * 100)
    return { subject: info.shortLabel, score: norm, fullMark: 100 }
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Breakdown por métrica</h2>
        <span className="text-xs text-gray-400">100% = ótimo</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {Object.entries(breakdown.metric_breakdown).map(([k, v]) => {
            const info = getMetricInfo(k)
            const norm = info.invertScore ? Math.round((1 - v.avg) * 100) : Math.round(v.avg * 100)
            const { bar, text } = scoreColorClasses(norm)
            return (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{info.label}</span>
                  <span className={`font-semibold ${text}`}>
                    {norm}% <span className="text-gray-400 font-normal">({v.passed_count}/{v.total_count} aprovados)</span>
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

type FilterStatus = "all" | "passed" | "failed" | "error"

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<TestRun | null>(null)
  const [tcMap, setTcMap] = useState<Record<number, TestCase>>({})
  const [profile, setProfile] = useState<EvaluationProfile | null>(null)
  const [breakdown, setBreakdown] = useState<RunBreakdown | null>(null)
  const [error, setError] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    getTestCases().then(tcs => setTcMap(Object.fromEntries(tcs.map(tc => [tc.id, tc])))).catch(() => {})
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    async function fetchRun() {
      try {
        const r = await getRun(Number(id))
        setRun(r)
        if (r.status !== "running") {
          clearInterval(timer)
          getProfile(r.profile_id).then(setProfile).catch(() => {})
          getRunBreakdown(r.id).then(setBreakdown).catch(() => {})
        }
      } catch {
        setError(true)
        clearInterval(timer)
      }
    }
    fetchRun()
    timer = setInterval(fetchRun, 2000)
    return () => clearInterval(timer)
  }, [id])

  const resultMap = useMemo(
    () => Object.fromEntries((run?.results ?? []).map(r => [r.test_case_id, r])),
    [run]
  )

  const filteredIds = useMemo(() => {
    if (!run) return []
    return run.test_case_ids.filter(tcId => {
      const result = resultMap[tcId]
      const tc = tcMap[tcId]
      if (filterStatus === "passed" && result?.passed !== true) return false
      if (filterStatus === "failed" && result?.passed !== false) return false
      if (filterStatus === "error" && !result?.error) return false
      if (searchText) {
        const lower = searchText.toLowerCase()
        if (!tc?.title?.toLowerCase().includes(lower) &&
            !tc?.input?.toLowerCase().includes(lower) &&
            !result?.actual_output?.toLowerCase().includes(lower)) return false
      }
      return true
    })
  }, [run, resultMap, tcMap, filterStatus, searchText])

  if (error) return <div className="text-red-600 text-sm">Erro ao carregar execução.</div>
  if (!run) return <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>

  const passed = run.results.filter(r => r.passed).length
  const done = run.results.length
  const total = run.test_case_ids.length
  const isRunning = run.status === "running"
  void profile

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Execuções", href: "/runs" }, { label: `Execução #${run.id}` }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-6">
        <ScoreCircle score={isRunning ? null : run.overall_score} />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900">Execução #{run.id}</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-sm text-gray-500">
            {isRunning
              ? `${done} de ${total} casos processados...`
              : `${passed} aprovados · ${total - passed} reprovados · ${total} total`}
          </p>
          {isRunning && (
            <div className="mt-2 flex items-center gap-3 w-full max-w-xs">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${total > 0 ? (done / total) * 100 : 0}%`,
                    background: "var(--santander-red)",
                  }} />
              </div>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-red-500" />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isRunning && (
            confirmCancel ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Cancelar execução?</span>
                <button
                  onClick={async () => {
                    setCancelling(true)
                    setConfirmCancel(false)
                    try {
                      await cancelRun(run.id)
                      toast.success("Execução cancelada")
                    } catch { toast.error("Erro ao cancelar execução") }
                    finally { setCancelling(false) }
                  }}
                  disabled={cancelling}
                  className="text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={cancelling}
                className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
              >
                {cancelling ? "Cancelando..." : "Cancelar execução"}
              </button>
            )
          )}
          <a href={`/runs/compare?a=${run.id}`}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            Comparar
          </a>
        </div>
      </div>

      {/* Breakdown */}
      {breakdown && Object.keys(breakdown.metric_breakdown).length > 0 && (
        <MetricBreakdownCard breakdown={breakdown} />
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "passed", "failed", "error"] as FilterStatus[]).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
                  filterStatus === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}>
                {s === "all" ? "Todos" : s === "passed" ? "Aprovados" : s === "failed" ? "Reprovados" : "Erros"}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Buscar..." value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
          <span className="text-xs text-gray-400">{filteredIds.length} resultado(s)</span>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Caso de teste</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scores</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredIds.map((tcId, idx) => {
              const tc = tcMap[tcId]
              const result = resultMap[tcId]
              const isPending = !result
              const isProcessing = isRunning && isPending && idx === done

              return (
                <tr key={tcId} className={cn(
                  result?.passed === false && !result?.error ? "bg-red-50/40" : "",
                  "hover:bg-gray-50/50 transition-colors"
                )}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-800">{tc?.title ?? `Caso #${tcId}`}</p>
                      {result?.turns_executed != null && result.turns_executed > 1 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                          {result.turns_executed} turnos
                        </span>
                      )}
                    </div>
                    {tc && <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{tc.input}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {isProcessing ? (
                      <span className="text-xs text-blue-600 font-medium animate-pulse">processando...</span>
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
                    {result?.scores && !result.error && <ScorePills scores={result.scores} criteria={profile?.criteria ?? []} />}
                    {result?.error && <span className="text-xs text-red-500 line-clamp-1">{result.error}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {result && (
                      <a href={`/runs/${id}/results/${tcId}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium">
                        Detalhes
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredIds.length === 0 && (
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
