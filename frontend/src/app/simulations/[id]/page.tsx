"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  getSimulation, getDatasets, updateSimulation, startSimulation, pauseSimulation,
  stopSimulation, resetSimulation, saveSimulationAsDataset,
  type Simulation,
} from "@/lib/api"
import LLMProviderSelector from "@/components/LLMProviderSelector"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

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

function MsgMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-1 prose-code:text-xs">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function SimulationRunnerPage() {
  const { id } = useParams<{ id: string }>()
  const simId = Number(id)

  const [sim, setSim] = useState<Simulation | null>(null)
  const [instructions, setInstructions] = useState("")
  const [llmProviderId, setLlmProviderId] = useState<number | null>(null)
  const [maxMessages, setMaxMessages] = useState(10)
  const [intervalSec, setIntervalSec] = useState(3)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [savingDataset, setSavingDataset] = useState(false)
  const [savedDatasetId, setSavedDatasetId] = useState<number | null>(null)
  const [error, setError] = useState("")

  const chatBottomRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSim = useCallback(async () => {
    const data = await getSimulation(simId)
    setSim(data)
    return data
  }, [simId])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const updated = await getSimulation(simId)
      setSim(updated)
      if (updated.status !== "running") {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
      }
    }, 2000)
  }, [simId])

  useEffect(() => {
    loadSim().then(data => {
      setInstructions(data.instructions || "")
      setLlmProviderId(data.llm_provider_id ?? null)
      setMaxMessages(data.max_messages)
      setIntervalSec(data.message_interval_seconds)
      if (data.saved_dataset_id) setSavedDatasetId(data.saved_dataset_id)
      if (data.status === "running") startPolling()
    })
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [loadSim, startPolling])

  // Sincroniza campos editáveis quando volta de running para paused/idle
  useEffect(() => {
    if (!sim) return
    if (sim.status === "paused" || sim.status === "idle") {
      setInstructions(sim.instructions || "")
      setLlmProviderId(sim.llm_provider_id ?? null)
      setMaxMessages(sim.max_messages)
      setIntervalSec(sim.message_interval_seconds)
    }
  }, [sim?.status])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [sim?.messages.length])

  const isEditable = sim && (sim.status === "idle" || sim.status === "paused")

  async function handleSaveConfig() {
    setSaving(true)
    setError("")
    try {
      const updated = await updateSimulation(simId, {
        instructions,
        llm_provider_id: llmProviderId,
        max_messages: maxMessages,
        message_interval_seconds: intervalSec,
      })
      setSim(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function handleStart() {
    setActionLoading(true)
    setError("")
    try {
      await startSimulation(simId)
      await loadSim()
      startPolling()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar")
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePause() {
    setActionLoading(true)
    try {
      const updated = await pauseSimulation(simId)
      setSim(updated)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStop() {
    setActionLoading(true)
    try {
      const updated = await stopSimulation(simId)
      setSim(updated)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReset() {
    if (!confirm("Resetar a simulação? Todas as mensagens serão apagadas.")) return
    setActionLoading(true)
    setSavedDatasetId(null)
    try {
      const updated = await resetSimulation(simId)
      setSim(updated)
      setInstructions(updated.instructions || "")
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveDataset() {
    setSavingDataset(true)
    setError("")
    try {
      const { dataset_id } = await saveSimulationAsDataset(simId)
      setSavedDatasetId(dataset_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar dataset")
    } finally {
      setSavingDataset(false)
    }
  }

  if (!sim) {
    return (
      <div>
        <div className="h-6 w-48 rounded bg-gray-200 animate-pulse mb-6" />
        <div className="grid grid-cols-[35%_1fr] gap-6 h-[calc(100vh-220px)]">
          <div className="rounded-lg bg-gray-100 animate-pulse" />
          <div className="rounded-lg bg-gray-100 animate-pulse" />
        </div>
      </div>
    )
  }

  const canPlay  = sim.status === "idle" || sim.status === "paused"
  const canPause = sim.status === "running"
  const canStop  = sim.status === "running" || sim.status === "paused"
  const canSaveDataset = (sim.status === "completed" || sim.status === "stopped") && sim.total_turns > 0

  return (
    <div>
      <Breadcrumb items={[{ label: "Simulações", href: "/simulations" }, { label: sim.name || `Simulação #${sim.id}` }]} />

      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{sim.name || `Simulação #${sim.id}`}</h1>
          <p className="text-sm text-gray-500 mt-1">Agente: {sim.agent_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusColor[sim.status]}`}>
            {sim.status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
            {statusLabel[sim.status]}
          </span>
          <span className="text-sm text-gray-500">{sim.total_turns}/{sim.max_messages} turnos</span>
        </div>
      </div>

      <div className="grid grid-cols-[35%_1fr] gap-6 h-[calc(100vh-220px)]">

        {/* Coluna esquerda — Instruções e Config */}
        <div className="flame-panel p-5 space-y-5 overflow-y-auto">
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-2">Instruções de Simulação</h2>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-400 min-h-[180px] resize-y"
              placeholder="Descreva a persona, cenário e fluxo que a LLM deve seguir..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              disabled={!isEditable}
            />
          </div>

          <hr className="border-gray-200" />

          <div className="space-y-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Configurações</p>
            <LLMProviderSelector
              label="LLM Simuladora"
              value={llmProviderId}
              onChange={v => setLlmProviderId(v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Intervalo (s)</label>
                <input
                  type="number" min={0.5} max={60} step={0.5}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none disabled:bg-gray-50"
                  value={intervalSec}
                  onChange={e => setIntervalSec(Number(e.target.value))}
                  disabled={!isEditable}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Max mensagens</label>
                <input
                  type="number" min={1} max={100}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none disabled:bg-gray-50"
                  value={maxMessages}
                  onChange={e => setMaxMessages(Number(e.target.value))}
                  disabled={!isEditable}
                />
              </div>
            </div>

            {isEditable && (
              <button onClick={handleSaveConfig} disabled={saving} className="flame-button-secondary w-full">
                {saving ? "Salvando..." : "Salvar Configurações"}
              </button>
            )}
          </div>
        </div>

        {/* Coluna direita — Chat */}
        <div className="flame-panel flex flex-col h-full min-h-0">
          {/* Mensagens com scroll próprio */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            {sim.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-400">Inicie a simulação para ver as mensagens.</p>
              </div>
            ) : (
              sim.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "simulator"
                      ? "bg-blue-50 text-blue-900 rounded-tl-sm"
                      : "bg-gray-100 text-gray-800 rounded-tr-sm"
                  }`}>
                    <p className={`text-[10px] font-bold mb-1.5 ${msg.role === "simulator" ? "text-blue-400" : "text-gray-400"}`}>
                      {msg.role === "simulator" ? "Simulador" : "Agente"}
                    </p>
                    <MsgMarkdown content={msg.content} />
                  </div>
                </div>
              ))
            )}
            {sim.status === "running" && (
              <div className="flex justify-start">
                <div className="bg-blue-50 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Controles fixos na base */}
          <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 space-y-3">
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleStart} disabled={!canPlay || actionLoading} className="flame-button">
                ▶ {sim.status === "paused" ? "Retomar" : "Iniciar"}
              </button>
              <button onClick={handlePause} disabled={!canPause || actionLoading} className="flame-button-secondary">
                ⏸ Pausar
              </button>
              <button onClick={handleStop} disabled={!canStop || actionLoading} className="flame-button-secondary">
                ⏹ Parar
              </button>
              <button onClick={handleReset} disabled={sim.status === "running" || actionLoading} className="flame-button-secondary">
                ↺ Resetar
              </button>

              {canSaveDataset && (
                savedDatasetId ? (
                  <Link href={`/datasets/${savedDatasetId}`} className="flame-button-secondary">
                    ✓ Ver Dataset #{savedDatasetId}
                  </Link>
                ) : (
                  <button onClick={handleSaveDataset} disabled={savingDataset} className="flame-button-secondary">
                    {savingDataset ? "Salvando..." : "💾 Salvar como Dataset"}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
