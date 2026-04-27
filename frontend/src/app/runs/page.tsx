"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { GitCompare, Plus } from "lucide-react"
import { motion } from "framer-motion"
import { getRuns, type TestRun } from "@/lib/api"
import { TableSkeleton } from "@/components/Skeleton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

const statusColor: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
  pending:   "bg-gray-100 text-gray-600",
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

export default function RunsPage() {
  const [runs, setRuns] = useState<TestRun[]>([])
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [])

  const agents = useMemo(() => {
    const map = new Map<number, string>()
    for (const r of runs) {
      if (r.agent_id && r.agent_name) map.set(r.agent_id, r.agent_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [runs])

  const filtered = useMemo(() => {
    return runs.filter(r => {
      if (agentFilter !== "all" && String(r.agent_id) !== agentFilter) return false
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      return true
    })
  }, [runs, agentFilter, statusFilter])

  return (
    <div>
      <Breadcrumb items={[{ label: "Execuções" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Execuções</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? "Carregando execuções..." : `${filtered.length} de ${runs.length} execução(ões)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/runs/compare"
            className="flame-button-secondary">
            <GitCompare className="w-4 h-4" />
            Comparar
          </Link>
          <Link href="/runs/new"
            className="flame-button">
            <Plus className="h-4 w-4" />
            Nova execução
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Agente</label>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
          >
            <option value="all">Todos os agentes</option>
            {agents.map(([id, name]) => (
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

        {(agentFilter !== "all" || statusFilter !== "all") && (
          <button
            onClick={() => { setAgentFilter("all"); setStatusFilter("all") }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton columns={8} rows={6} />
      ) : filtered.length === 0 ? (
        <div className="flame-empty">
          <p className="text-gray-500 text-sm mb-3">
            {runs.length === 0 ? "Nenhuma execução ainda." : "Nenhuma execução encontrada com os filtros selecionados."}
          </p>
          {runs.length === 0 && (
            <Link href="/runs/new" className="flame-link-action">
              Criar primeira execução →
            </Link>
          )}
        </div>
      ) : (
        <div className="flame-panel overflow-hidden">
          <table className="flame-table">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Agente</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Perfil</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Casos</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Score geral</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <motion.tr
                  key={r.id}
                  className="hover:bg-gray-50/50"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.15 }}
                >
                  <td className="px-5 py-3 text-gray-400">#{r.id}</td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-gray-800">{r.agent_name ?? <span className="text-gray-400">—</span>}</span>
                    {r.agent_metadata_snapshot && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.agent_metadata_snapshot.model_name && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-mono">
                            {r.agent_metadata_snapshot.model_name}
                          </span>
                        )}
                        {r.agent_metadata_snapshot.model_provider && r.agent_metadata_snapshot.model_provider !== "custom" && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                            {r.agent_metadata_snapshot.model_provider}
                          </span>
                        )}
                        {r.agent_metadata_snapshot.environment && r.agent_metadata_snapshot.environment !== "experiment" && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">
                            {r.agent_metadata_snapshot.environment}
                          </span>
                        )}
                        {r.agent_metadata_snapshot.tags?.map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {r.profile_name ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium w-fit ${statusColor[r.status]}`}>
                        {statusLabel[r.status] ?? r.status}
                      </span>
                      {r.error_count > 0 && (
                        <span className="text-[10px] text-red-500">
                          ⚠ {r.error_count} erro{r.error_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{r.test_case_ids.length}</td>
                  <td className="px-5 py-3"><ScoreBadge score={r.overall_score} /></td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/runs/${r.id}`} className="flame-link-action">
                        ver resultados
                      </Link>
                      {r.status === "completed" && (
                        <Link href={`/runs/compare?a=${r.id}`} className="text-gray-400 hover:text-gray-600 text-xs">
                          comparar
                        </Link>
                      )}
                    </div>
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
