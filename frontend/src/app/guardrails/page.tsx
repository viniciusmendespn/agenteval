"use client"

import { useEffect, useState } from "react"
import { getGuardrails, createGuardrail, updateGuardrail, deleteGuardrail, Guardrail } from "@/lib/api"

const MODE_LABELS: Record<string, string> = {
  input: "Entrada",
  output: "Saída",
  both: "Entrada e Saída",
}

const MODE_COLORS: Record<string, string> = {
  input: "bg-blue-100 text-blue-700",
  output: "bg-purple-100 text-purple-700",
  both: "bg-teal-100 text-teal-700",
}

const emptyForm = { name: "", description: "", mode: "both" as const, criterion: "" }

export default function GuardrailsPage() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      setGuardrails(await getGuardrails())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError("")
    setShowForm(true)
  }

  const openEdit = (g: Guardrail) => {
    setEditingId(g.id)
    setForm({ name: g.name, description: g.description || "", mode: g.mode as typeof form.mode, criterion: g.criterion })
    setError("")
    setShowForm(true)
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setError("")
  }

  const save = async () => {
    if (!form.name.trim() || !form.criterion.trim()) {
      setError("Nome e critério são obrigatórios.")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (editingId !== null) {
        await updateGuardrail(editingId, form)
      } else {
        await createGuardrail(form)
      }
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteGuardrail(id)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir")
    } finally {
      setDeletingId(null)
    }
  }

  const systemGuardrails = guardrails.filter(g => g.is_system)
  const customGuardrails = guardrails.filter(g => !g.is_system)

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guardrails</h1>
          <p className="text-sm text-gray-500 mt-1">
            Regras de conteúdo avaliadas em cada resposta. Presets padrão + regras customizadas do workspace.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flame-button"
        >
          + Novo Guardrail
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4">
          <h2 className="font-semibold text-gray-800">
            {editingId !== null ? "Editar Guardrail" : "Novo Guardrail"}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Nome *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Assuntos Jurídicos"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Modo de avaliação</label>
              <select
                value={form.mode}
                onChange={e => setForm(f => ({ ...f, mode: e.target.value as typeof form.mode }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="both">Entrada e Saída</option>
                <option value="input">Somente Entrada</option>
                <option value="output">Somente Saída</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Descrição (opcional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrição curta para identificar esta regra"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Critério de avaliação (GEval) *</label>
            <textarea
              value={form.criterion}
              onChange={e => setForm(f => ({ ...f, criterion: e.target.value }))}
              rows={3}
              placeholder='Ex: must NOT discuss legal topics or provide legal advice of any kind'
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-400">
              Complete a frase: "The [input/output] ..." — o critério é passado para o LLM judge avaliar.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flame-button disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId !== null ? "Salvar alterações" : "Criar guardrail"}
            </button>
            <button
              onClick={cancelForm}
              className="flame-button-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Presets padrão ({systemGuardrails.length})
            </h2>
            <div className="space-y-2">
              {systemGuardrails.map(g => (
                <GuardrailCard key={g.id} guardrail={g} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Guardrails customizados ({customGuardrails.length})
            </h2>
            {customGuardrails.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
                Nenhum guardrail customizado. Clique em "+ Novo Guardrail" para criar.
              </p>
            ) : (
              <div className="space-y-2">
                {customGuardrails.map(g => (
                  <GuardrailCard
                    key={g.id}
                    guardrail={g}
                    onEdit={() => openEdit(g)}
                    onDelete={() => handleDelete(g.id)}
                    deleting={deletingId === g.id}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function GuardrailCard({
  guardrail,
  onEdit,
  onDelete,
  deleting,
}: {
  guardrail: Guardrail
  onEdit?: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  const modeColor = MODE_COLORS[guardrail.mode] || "bg-gray-100 text-gray-600"
  return (
    <div className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 text-sm">{guardrail.name}</span>
          {guardrail.is_system && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Padrão</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor}`}>
            {MODE_LABELS[guardrail.mode] || guardrail.mode}
          </span>
        </div>
        {guardrail.description && (
          <p className="text-xs text-gray-500 mb-1">{guardrail.description}</p>
        )}
        <p className="text-xs text-gray-400 font-mono truncate">
          The [input/output] {guardrail.criterion.slice(0, 120)}{guardrail.criterion.length > 120 ? "…" : ""}
        </p>
      </div>
      {!guardrail.is_system && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="flame-button-secondary min-h-8 px-3 text-xs"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flame-button min-h-8 px-3 text-xs disabled:opacity-50"
          >
            {deleting ? "..." : "Excluir"}
          </button>
        </div>
      )}
    </div>
  )
}
