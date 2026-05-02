"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAgents, createSimulation, type Agent } from "@/lib/api"
import LLMProviderSelector from "@/components/LLMProviderSelector"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

export default function NewSimulationPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [form, setForm] = useState({
    agent_id: "",
    name: "",
    llm_provider_id: null as number | null,
    max_messages: 10,
    message_interval_seconds: 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.agent_id) { setError("Selecione um agente"); return }
    setSaving(true)
    setError("")
    try {
      const sim = await createSimulation({
        agent_id: Number(form.agent_id),
        name: form.name || undefined,
        llm_provider_id: form.llm_provider_id,
        max_messages: form.max_messages,
        message_interval_seconds: form.message_interval_seconds,
      })
      router.push(`/simulations/${sim.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar simulação")
      setSaving(false)
    }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Simulações", href: "/simulations" }, { label: "Nova Simulação" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nova Simulação</h1>
          <p className="text-sm text-gray-500 mt-1">Configure e clique em "Criar" para abrir o runner.</p>
        </div>
      </div>

      <div className="flame-panel max-w-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Agente <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              value={form.agent_id}
              onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
            >
              <option value="">Selecione um agente...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome (opcional)</label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Auto: Simulação [Agente] [Data]"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <LLMProviderSelector
            label="LLM Simuladora"
            value={form.llm_provider_id}
            onChange={v => setForm(f => ({ ...f, llm_provider_id: v }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Max mensagens</label>
              <input
                type="number" min={1} max={100}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                value={form.max_messages}
                onChange={e => setForm(f => ({ ...f, max_messages: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Intervalo (segundos)</label>
              <input
                type="number" min={0.5} max={60} step={0.5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                value={form.message_interval_seconds}
                onChange={e => setForm(f => ({ ...f, message_interval_seconds: Number(e.target.value) }))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={saving} className="flame-button w-full">
            {saving ? "Criando..." : "Criar e Configurar →"}
          </button>
        </form>
      </div>
    </div>
  )
}
