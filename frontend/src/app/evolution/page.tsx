"use client"
import { useEffect, useState, useMemo } from "react"
import {
  getAgents, getDatasets, getAgentTimeline, getDatasetTimeline, getProfile,
  type Agent, type Dataset, type TimelineData,
} from "@/lib/api"
import { getMetricInfo, scoreColorClasses } from "@/lib/metrics"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

const CHART_COLORS = [
  "#ec0000", "#10b981", "#f59e0b", "#6b7280", "#8b5cf6",
  "#06b6d4", "#db2777", "#84cc16",
]

type Source = { type: "agent"; id: number } | { type: "dataset"; id: number }

export default function EvolutionPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [source, setSource] = useState<Source | null>(null)
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(false)
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(new Set())
  // mapa criterion_N → texto real do critério (coletado dos perfis usados na timeline)
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {})
    getDatasets().then(setDatasets).catch(() => {})
  }, [])

  useEffect(() => {
    if (!source) { setTimeline(null); setCriteriaMap({}); return }
    setLoading(true)
    const fetcher = source.type === "agent"
      ? getAgentTimeline(source.id)
      : getDatasetTimeline(source.id)
    fetcher
      .then(async data => {
        setTimeline(data)
        const allMetrics = new Set<string>()
        data.points.forEach(p => Object.keys(p.metrics).forEach(m => allMetrics.add(m)))
        setVisibleMetrics(allMetrics)

        // Busca critérios dos perfis usados para resolver criterion_*
        const profileIds = Array.from(new Set(data.points.map(p => p.profile_id)))
        const profiles = await Promise.all(profileIds.map(id => getProfile(id).catch(() => null)))
        const map: Record<string, string> = {}
        for (const profile of profiles) {
          if (!profile?.criteria) continue
          profile.criteria.forEach((text, i) => {
            const key = `criterion_${i}`
            if (!map[key]) map[key] = text
          })
        }
        setCriteriaMap(map)
      })
      .catch(() => setTimeline(null))
      .finally(() => setLoading(false))
  }, [source])

  // Todas as métricas que aparecem em algum ponto
  const allMetrics = useMemo(() => {
    if (!timeline) return []
    const set = new Set<string>()
    timeline.points.forEach(p => Object.keys(p.metrics).forEach(m => set.add(m)))
    return Array.from(set)
  }, [timeline])

  // Dados para o gráfico de linhas
  const chartData = useMemo(() => {
    if (!timeline) return []
    return timeline.points.map((p, idx) => {
      const row: Record<string, unknown> = {
        name: p.type === "run" ? `Run #${p.id}` : `Aval #${p.id}`,
        date: new Date(p.date).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        overall: p.overall_score != null ? Math.round(p.overall_score * 100) : null,
        passed: p.passed,
        total: p.total,
        profile: timeline.profile_names[p.profile_id] ?? `Perfil #${p.profile_id}`,
        idx,
      }
      for (const m of allMetrics) {
        // Já vem normalizado do backend (100 = ótimo)
        row[m] = p.metrics[m] != null ? Math.round(p.metrics[m] * 100) : null
      }
      return row
    })
  }, [timeline, allMetrics])

  // Delta entre primeiro e último ponto
  const deltas = useMemo(() => {
    if (!timeline || timeline.points.length < 2) return null
    const first = timeline.points[0]
    const last = timeline.points[timeline.points.length - 1]
    const overallDelta = (last.overall_score ?? 0) - (first.overall_score ?? 0)
    const metricDeltas: Record<string, number> = {}
    for (const m of allMetrics) {
      metricDeltas[m] = (last.metrics[m] ?? 0) - (first.metrics[m] ?? 0)
    }
    return { overall: overallDelta, metrics: metricDeltas }
  }, [timeline, allMetrics])

  function toggleMetric(m: string) {
    setVisibleMetrics(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  const sourceLabel = source?.type === "agent"
    ? agents.find(a => a.id === source.id)?.name
    : source?.type === "dataset"
    ? datasets.find(d => d.id === source.id)?.name
    : null

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Evolução" }]} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Evolução</h1>
        <p className="text-sm text-gray-500 mt-1">
          Acompanhe como as métricas do seu agente ou dataset evoluem ao longo das avaliações
        </p>
      </div>

      {/* Seletor */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Agente</label>
            <select
              value={source?.type === "agent" ? source.id : ""}
              onChange={e => {
                const id = Number(e.target.value)
                setSource(id ? { type: "agent", id } : null)
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um agente...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Dataset</label>
            <select
              value={source?.type === "dataset" ? source.id : ""}
              onChange={e => {
                const id = Number(e.target.value)
                setSource(id ? { type: "dataset", id } : null)
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um dataset...</option>
              {datasets.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="text-gray-400 text-sm animate-pulse">Carregando timeline...</div>}

      {timeline && timeline.points.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Nenhuma avaliação concluída encontrada para {sourceLabel}.
          <br />Execute pelo menos 2 avaliações para ver a evolução.
        </div>
      )}

      {timeline && timeline.points.length > 0 && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Avaliações</p>
              <p className="text-2xl font-bold text-gray-900">{timeline.points.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Score atual</p>
              <p className="text-2xl font-bold text-gray-900">
                {timeline.points[timeline.points.length - 1].overall_score != null
                  ? `${Math.round(timeline.points[timeline.points.length - 1].overall_score! * 100)}%`
                  : "—"}
              </p>
            </div>
            {deltas && (
              <>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">Variação total</p>
                  <DeltaDisplay value={deltas.overall} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">Taxa de aprovação atual</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(() => {
                      const last = timeline.points[timeline.points.length - 1]
                      return last.total > 0
                        ? `${Math.round((last.passed / last.total) * 100)}%`
                        : "—"
                    })()}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Filtro de métricas */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Métricas:</span>
              {allMetrics.map((m, i) => {
                const info = getMetricInfo(m)
                const active = visibleMetrics.has(m)
                const tooltipText = criteriaMap[m] ?? info.description
                return (
                  <div key={m} className="relative group">
                    <button
                      onClick={() => toggleMetric(m)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors border ${
                        active
                          ? "text-white border-transparent"
                          : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                      }`}
                      style={active ? { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] } : {}}
                    >
                      {info.label}
                    </button>
                    {tooltipText && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed shadow-lg text-left">
                        {tooltipText}
                      </div>
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => setVisibleMetrics(new Set(allMetrics))}
                className="text-xs text-blue-600 hover:underline ml-2"
              >
                Todas
              </button>
              <button
                onClick={() => setVisibleMetrics(new Set())}
                className="text-xs text-gray-400 hover:underline"
              >
                Nenhuma
              </button>
            </div>
          </div>

          {/* Gráfico de evolução das métricas */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Evolução por métrica</h2>
            <p className="text-xs text-gray-400 mb-3">Scores normalizados (100% = ótimo)</p>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e5e7eb", fontSize: "0.75rem" }}
                  formatter={(value, name) => {
                    const info = getMetricInfo(String(name))
                    return [`${Number(value ?? 0)}%`, info.label]
                  }}
                  labelFormatter={(label, payload) => {
                    if (payload?.[0]?.payload) {
                      const p = payload[0].payload
                      return `${p.name} — ${label} — ${p.profile}`
                    }
                    return label
                  }}
                />
                <Legend
                  formatter={(value) => {
                    const info = getMetricInfo(value)
                    return <span className="text-xs text-gray-600">{info.label}</span>
                  }}
                />
                {allMetrics.map((m, i) =>
                  visibleMetrics.has(m) ? (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de score geral */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Score geral ao longo do tempo</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e5e7eb", fontSize: "0.75rem" }}
                  formatter={(value) => [`${Number(value ?? 0)}%`, "Score geral"]}
                  labelFormatter={(label, payload) => {
                    if (payload?.[0]?.payload) {
                      const p = payload[0].payload
                      return `${p.name} — ${label}`
                    }
                    return label
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="overall"
                  stroke="#ec0000"
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: "#ec0000" }}
                  activeDot={{ r: 7 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela de todas avaliações */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Histórico de avaliações</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Avaliação</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Perfil</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Aprovação</th>
                  {allMetrics.map(m => {
                    const info = getMetricInfo(m)
                    const tooltipText = criteriaMap[m] ?? info.description ?? info.label
                    return (
                      <th key={m} className="text-left px-4 py-3 text-xs font-medium text-gray-500 cursor-help"
                        title={tooltipText}>
                        {info.shortLabel}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {timeline.points.map((p, idx) => {
                  const prev = idx > 0 ? timeline.points[idx - 1] : null
                  const scoreDelta = prev && p.overall_score != null && prev.overall_score != null
                    ? p.overall_score - prev.overall_score
                    : null

                  return (
                    <tr key={`${p.type}-${p.id}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {p.type === "run" ? (
                          <a href={`/runs/${p.id}`} className="text-blue-600 hover:underline">
                            Run #{p.id}
                          </a>
                        ) : (
                          `Aval #${p.id}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(p.date).toLocaleDateString("pt-BR", {
                          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {timeline.profile_names[p.profile_id] ?? `#${p.profile_id}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ScoreBadge score={p.overall_score} />
                          {scoreDelta != null && <MiniDelta value={scoreDelta} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.total > 0 ? `${p.passed}/${p.total}` : "—"}
                      </td>
                      {allMetrics.map(m => (
                        <td key={m} className="px-4 py-3">
                          <MetricCell value={p.metrics[m]} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function DeltaDisplay({ value }: { value: number }) {
  const pct = Math.round(Math.abs(value) * 100)
  if (pct === 0) return (
    <div className="flex items-center gap-1 text-gray-400 text-xl font-bold">
      <Minus className="w-5 h-5" /> 0%
    </div>
  )
  if (value > 0) return (
    <div className="flex items-center gap-1 text-green-600 text-xl font-bold">
      <TrendingUp className="w-5 h-5" /> +{pct}%
    </div>
  )
  return (
    <div className="flex items-center gap-1 text-red-600 text-xl font-bold">
      <TrendingDown className="w-5 h-5" /> -{pct}%
    </div>
  )
}

function MiniDelta({ value }: { value: number }) {
  const pct = Math.round(Math.abs(value) * 100)
  if (pct === 0) return null
  if (value > 0) return (
    <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
      <TrendingUp className="w-3 h-3" />+{pct}%
    </span>
  )
  return (
    <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
      <TrendingDown className="w-3 h-3" />-{pct}%
    </span>
  )
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const { badge } = scoreColorClasses(pct)
  return <span className={`text-sm font-bold px-2 py-0.5 rounded ${badge}`}>{pct}%</span>
}

function MetricCell({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-gray-300">—</span>
  const pct = Math.round(value * 100)
  const { badge } = scoreColorClasses(pct)
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge}`}>{pct}%</span>
}
