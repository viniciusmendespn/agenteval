"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from "recharts"
import { getAllDatasetEvaluations, type DatasetEvaluationSummary } from "@/lib/api"
import { TableSkeleton, Skeleton } from "@/components/Skeleton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

const statusColor: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
  pending:   "bg-gray-100 text-gray-500",
}
const statusLabel: Record<string, string> = {
  completed: "Concluída",
  running:   "Executando",
  failed:    "Falhou",
  cancelled: "Cancelada",
  pending:   "Pendente",
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "text-green-600 bg-green-50" : pct >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-600 bg-red-50"
  return <span className={`text-sm font-bold px-2 py-0.5 rounded ${color}`}>{pct}%</span>
}

function barColor(score: number) {
  if (score >= 80) return "#16a34a"
  if (score >= 50) return "#ca8a04"
  return "#dc2626"
}

function ChartSkeleton() {
  return (
    <div className="flame-panel p-5 mb-4">
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<DatasetEvaluationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [datasetFilter, setDatasetFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    getAllDatasetEvaluations()
      .then(setEvaluations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const datasets = useMemo(() => {
    const map = new Map<number, string>()
    for (const ev of evaluations) {
      map.set(ev.dataset_id, ev.dataset_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [evaluations])

  const filtered = useMemo(() => {
    return evaluations.filter(ev => {
      if (datasetFilter !== "all" && String(ev.dataset_id) !== datasetFilter) return false
      if (statusFilter !== "all" && ev.status !== statusFilter) return false
      return true
    })
  }, [evaluations, datasetFilter, statusFilter])

  const chartData = useMemo(() => {
    const byDataset = new Map<string, number[]>()
    for (const ev of evaluations) {
      if (ev.status === "completed" && ev.overall_score != null) {
        const key = ev.dataset_name
        if (!byDataset.has(key)) byDataset.set(key, [])
        byDataset.get(key)!.push(ev.overall_score)
      }
    }
    return Array.from(byDataset.entries())
      .map(([name, scores]) => ({
        name: name.length > 20 ? name.slice(0, 18) + "…" : name,
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100),
      }))
      .sort((a, b) => b.score - a.score)
  }, [evaluations])

  return (
    <div>
      <Breadcrumb items={[{ label: "Avaliações de Dataset" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avaliações de Dataset</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading
              ? "Carregando avaliações..."
              : `${filtered.length} de ${evaluations.length} avaliação(ões)`}
          </p>
        </div>
        <Link href="/datasets" className="flame-button-secondary">
          Gerenciar datasets →
        </Link>
      </div>

      {/* Gráfico */}
      {loading ? (
        <ChartSkeleton />
      ) : chartData.length > 0 && (
        <div className="flame-panel p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Score médio por dataset</h2>
            <span className="text-xs text-gray-400">100% = ótimo · apenas avaliações concluídas</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barCategoryGap="30%">
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                width={38}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Score médio"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Dataset</label>
          <select
            value={datasetFilter}
            onChange={e => setDatasetFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
          >
            <option value="all">Todos os datasets</option>
            {datasets.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="completed">Concluída</option>
            <option value="running">Executando</option>
            <option value="failed">Falhou</option>
            <option value="pending">Pendente</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        {(datasetFilter !== "all" || statusFilter !== "all") && (
          <button
            onClick={() => { setDatasetFilter("all"); setStatusFilter("all") }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton columns={7} rows={5} />
      ) : filtered.length === 0 ? (
        <div className="flame-empty">
          <p className="text-gray-500 text-sm mb-3">
            {evaluations.length === 0
              ? "Nenhuma avaliação de dataset ainda."
              : "Nenhuma avaliação encontrada com os filtros selecionados."}
          </p>
          {evaluations.length === 0 && (
            <Link href="/datasets" className="flame-link-action">
              Importar um dataset e avaliar →
            </Link>
          )}
        </div>
      ) : (
        <div className="flame-panel overflow-hidden">
          <table className="flame-table">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Dataset</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Perfil usado</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Score geral</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((ev, i) => (
                <motion.tr
                  key={ev.id}
                  className="hover:bg-gray-50/50"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.15 }}
                >
                  <td className="px-5 py-3 text-gray-400">#{ev.id}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{ev.dataset_name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{ev.profile_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[ev.status]}`}>
                      {statusLabel[ev.status] ?? ev.status}
                    </span>
                  </td>
                  <td className="px-5 py-3"><ScoreBadge score={ev.overall_score} /></td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/datasets/${ev.dataset_id}/evaluations/${ev.id}`}
                      className="flame-link-action"
                    >
                      ver resultados
                    </Link>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
