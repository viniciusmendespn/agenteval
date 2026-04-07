"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import { Bot, FlaskConical, Play, Database, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"
import { getAnalyticsOverview, type AnalyticsOverview } from "@/lib/api"

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400 text-sm">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "text-green-600 bg-green-50" : pct >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-600 bg-red-50"
  return (
    <span className={`text-sm font-bold px-2 py-0.5 rounded ${color}`}>{pct}%</span>
  )
}

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
  pending:   "bg-gray-100 text-gray-500",
}
const statusLabels: Record<string, string> = {
  completed: "Concluída",
  running:   "Executando",
  failed:    "Falhou",
  pending:   "Pendente",
}

function ScoreDelta({ delta }: { delta?: number | null }) {
  if (delta == null) return null
  const pct = Math.round(Math.abs(delta) * 100)
  if (pct === 0) return <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" /> Estável</span>
  if (delta > 0) return <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><TrendingUp className="w-3 h-3" />+{pct}%</span>
  return <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><TrendingDown className="w-3 h-3" />-{pct}%</span>
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs text-gray-500 mb-1">Run #{label}</p>
      <p className="text-sm font-bold text-gray-900">{Math.round(payload[0].value * 100)}%</p>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  function load() {
    setLoading(true)
    setFetchError(false)
    getAnalyticsOverview()
      .then(d => { setData(d); setFetchError(false) })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const trend = data?.score_trend ?? []
  const prevScore = trend.length >= 2 ? trend[trend.length - 2]?.score : null
  const lastScore = trend.length >= 1 ? trend[trend.length - 1]?.score : null
  const scoreDelta = prevScore != null && lastScore != null ? lastScore - prevScore : null

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Carregando métricas...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-700">Não foi possível conectar ao backend</p>
            <p className="text-xs text-red-500 mt-1">
              Certifique-se que o servidor está rodando em <code className="bg-red-100 px-1 rounded">http://localhost:8000</code> e foi reiniciado após as últimas alterações.
            </p>
          </div>
          <button
            onClick={load}
            className="ml-4 shrink-0 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral do sistema de avaliação</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="border border-gray-200 text-gray-500 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1.5"
            title="Atualizar dados"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link href="/runs/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Nova execução
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Bot}          label="Agentes"        value={data?.totals.agents ?? 0}      color="bg-blue-100 text-blue-600" />
        <KpiCard icon={FlaskConical} label="Casos de teste"  value={data?.totals.test_cases ?? 0} color="bg-purple-100 text-purple-600" />
        <KpiCard icon={Play}         label="Execuções"       value={data?.totals.runs ?? 0}        color="bg-green-100 text-green-600" />
        <KpiCard icon={Database}     label="Datasets"        value={data?.totals.datasets ?? 0}   color="bg-orange-100 text-orange-600" />
      </div>

      {/* Score + Gráfico */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Score médio */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold text-gray-700">Score médio geral</p>
          {data?.avg_score != null ? (
            <>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold text-gray-900">
                  {Math.round(data.avg_score * 100)}
                </span>
                <span className="text-xl text-gray-400 mb-1">/ 100</span>
              </div>
              <ScoreDelta delta={scoreDelta} />
            </>
          ) : (
            <p className="text-gray-400 text-sm">Nenhuma execução concluída</p>
          )}

          {data?.pass_rate != null && (
            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">Taxa de aprovação</span>
                <span className="font-semibold text-gray-700">{Math.round(data.pass_rate * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.round(data.pass_rate * 100)}%` }}
                />
              </div>
            </div>
          )}

          {data?.runs_by_status && (
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
              {Object.entries(data.runs_by_status).map(([status, count]) =>
                count > 0 ? (
                  <div key={status} className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded font-medium ${statusColors[status]}`}>
                      {statusLabels[status] ?? status}
                    </span>
                    <span className="text-gray-600 font-semibold">{count}</span>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>

        {/* Gráfico de tendência */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Tendência de score (últimas execuções)</p>
          {trend.length >= 2 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="run_id" tick={{ fontSize: 11 }} tickFormatter={(v) => `#${v}`} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v*100)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ fill: "#2563eb", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">
              Execute pelo menos 2 testes para ver a tendência
            </div>
          )}
        </div>
      </div>

      {/* Execuções recentes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Execuções recentes</p>
          <Link href="/runs" className="text-xs text-blue-600 hover:underline">Ver todas</Link>
        </div>
        {!data?.recent_runs?.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhuma execução ainda.{" "}
            <Link href="/runs/new" className="text-blue-600 hover:underline">Criar primeira execução</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Agente</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Score</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Casos</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recent_runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-400">#{run.id}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{run.agent_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[run.status]}`}>
                      {statusLabels[run.status] ?? run.status}
                    </span>
                  </td>
                  <td className="px-5 py-3"><ScoreBadge score={run.score} /></td>
                  <td className="px-5 py-3 text-gray-500">{run.cases}</td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(run.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/runs/${run.id}`} className="text-xs text-blue-600 hover:underline">
                      ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
