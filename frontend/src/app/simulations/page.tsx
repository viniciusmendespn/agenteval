"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Bot } from "lucide-react"
import { getSimulations, getAgents, type Simulation, type Agent } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"
import { TableSkeleton } from "@/components/Skeleton"

const statusColor: Record<string, string> = {
  idle:      "bg-gray-100 text-gray-600",
  running:   "bg-blue-100 text-blue-700",
  paused:    "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  stopped:   "bg-orange-100 text-orange-700",
  failed:    "bg-red-100 text-red-700",
}

const statusLabel: Record<string, string> = {
  idle:      "Aguardando",
  running:   "Executando",
  paused:    "Pausada",
  completed: "Concluída",
  stopped:   "Parada",
  failed:    "Falhou",
}

export default function SimulationsPage() {
  const [sims, setSims] = useState<Simulation[] | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [filterAgentId, setFilterAgentId] = useState<string>("")
  const [deleting, setDeleting] = useState<Set<number>>(new Set())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    const data = await getSimulations()
    setSims(data)
    return data
  }

  useEffect(() => {
    load()
    getAgents().then(setAgents).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sims) return
    const hasRunning = sims.some(s => s.status === "running")
    if (hasRunning && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const data = await load()
        if (!data.some(s => s.status === "running")) {
          clearInterval(pollingRef.current!)
          pollingRef.current = null
        }
      }, 3000)
    }
    return () => {
      if (pollingRef.current && !hasRunning) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [sims])

  function markDeleting(id: number) {
    setDeleting(prev => new Set(prev).add(id))
    setSims(prev => prev ? prev.filter(s => s.id !== id) : prev)
  }

  function unmarkDeleting(id: number) {
    setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    load()
  }

  const filtered = useMemo(() => {
    if (!sims) return []
    const base = sims.filter(s => !deleting.has(s.id))
    if (!filterAgentId) return base
    return base.filter(s => String(s.agent_id) === filterAgentId)
  }, [sims, deleting, filterAgentId])

  return (
    <div>
      <Breadcrumb items={[{ label: "Simulações" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Simulações</h1>
          <p className="text-sm text-gray-500 mt-1">LLM assume o papel de usuário e conversa com o agente</p>
        </div>
        <Link href="/simulations/new" className="flame-button">
          <Plus className="h-4 w-4" />
          Nova Simulação
        </Link>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--flame-teal)]/20 bg-[var(--flame-teal)]/5 px-4 py-3">
        <Bot className="h-5 w-5 shrink-0 text-[var(--flame-teal)]" />
        <p className="flex-1 text-sm text-gray-600">
          Use o <strong>Assistente de QA</strong> para gerar cenários de simulação automaticamente com IA, com personas e regras de negócio do seu agente.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-floatingchat"))}
          className="shrink-0 rounded-lg border border-[var(--flame-teal)] px-3 py-1.5 text-xs font-semibold text-[var(--flame-teal)] hover:bg-[var(--flame-teal)] hover:text-white transition-colors"
        >
          Abrir assistente
        </button>
      </div>

      {sims === null ? (
        <TableSkeleton columns={6} rows={4} />
      ) : sims.length === 0 ? (
        <div className="flame-empty">
          <p className="text-gray-500 text-sm mb-3">Nenhuma simulação criada ainda.</p>
          <Link href="/simulations/new" className="flame-link-action">
            Criar primeira simulação →
          </Link>
        </div>
      ) : (
        <>
          {agents.length > 1 && (
            <div className="mb-4 flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">Filtrar por agente:</label>
              <select
                value={filterAgentId}
                onChange={e => setFilterAgentId(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-[var(--santander-red)]"
              >
                <option value="">Todos</option>
                {agents.map(a => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
              {filterAgentId && (
                <button
                  onClick={() => setFilterAgentId("")}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  limpar
                </button>
              )}
            </div>
          )}

          <div className="flame-panel overflow-hidden">
            <table className="flame-table">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Agente</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Turnos</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Criada em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
                      Nenhuma simulação para este agente.
                    </td>
                  </tr>
                ) : filtered.map(sim => (
                  <tr key={sim.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      <Link href={`/simulations/${sim.id}`} className="flame-link-action">
                        {sim.name || `Simulação #${sim.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{sim.agent_name || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[sim.status] || "bg-gray-100 text-gray-600"}`}>
                        {sim.status === "running" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        {statusLabel[sim.status] || sim.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{sim.total_turns}/{sim.max_messages}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(sim.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/simulations/${sim.id}`} className="flame-link-action">abrir</Link>
                        {sim.status !== "running" && (
                          <DeleteButton
                            id={sim.id}
                            path="/simulations"
                            onDeleteStart={() => markDeleting(sim.id)}
                            onDeleteUndo={() => unmarkDeleting(sim.id)}
                            onDeleted={() => setSims(prev => prev ? prev.filter(s => s.id !== sim.id) : prev)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
