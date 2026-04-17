"use client"

import { useEffect, useState } from "react"
import { Bot, Plus, Pencil, Trash2, Check, X } from "lucide-react"
import {
  getLLMProviders,
  createLLMProvider,
  updateLLMProvider,
  deleteLLMProvider,
  type LLMProvider,
} from "@/lib/api"

type FormData = Omit<LLMProvider, "id" | "created_at">

const EMPTY: FormData = {
  name: "",
  provider_type: "azure",
  base_url: "",
  api_key: "",
  model_name: "",
  api_version: "",
}

export default function LLMProvidersPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  function load() {
    setLoading(true)
    getLLMProviders().then(setProviders).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await createLLMProvider({
        ...form,
        base_url: form.base_url || undefined,
        api_version: form.api_version || undefined,
      })
      setForm(EMPTY)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  function startEdit(p: LLMProvider) {
    setEditingId(p.id)
    setEditForm({ name: p.name, provider_type: p.provider_type, base_url: p.base_url ?? "", api_key: p.api_key, model_name: p.model_name, api_version: p.api_version ?? "" })
  }

  async function handleSaveEdit(id: number) {
    setSaving(true)
    try {
      await updateLLMProvider(id, {
        ...editForm,
        base_url: editForm.base_url || undefined,
        api_version: editForm.api_version || undefined,
      })
      setEditingId(null)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover este provedor?")) return
    await deleteLLMProvider(id).catch(() => {})
    load()
  }

  const inp = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
  const lbl = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="max-w-5xl space-y-6">
      <p className="text-sm text-gray-500">Configure LLMs alternativos para usar como juiz nas avaliações. O provedor padrão vem das variáveis de ambiente.</p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Formulário de criação */}
      <section className="flame-panel p-5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Novo provedor</h2>
            <p className="text-sm text-gray-500 mt-1">Adicione um endpoint de LLM para usar como juiz em perfis de avaliação.</p>
          </div>
          <div className="flame-icon-shell h-10 w-10">
            <Plus className="h-5 w-5 text-red-600" />
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome *</label>
              <input className={inp} value={form.name} placeholder="Ex: GPT-4o BRQ" required
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Tipo de provedor</label>
              <select className={inp} value={form.provider_type}
                onChange={e => setForm(f => ({ ...f, provider_type: e.target.value as any }))}>
                <option value="azure">Azure OpenAI</option>
                <option value="openai">OpenAI</option>
                <option value="custom">Customizado (compatível OpenAI)</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Base URL</label>
              <input className={inp} value={form.base_url}
                placeholder={form.provider_type === "openai" ? "Deixe vazio para padrão" : "https://seu-endpoint.openai.azure.com"}
                onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>API Key *</label>
              <input className={inp} type="password" value={form.api_key} placeholder="sk-..." required
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Nome do modelo *</label>
              <input className={inp} value={form.model_name} placeholder="gpt-4o, gpt-5.2, etc." required
                onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} />
            </div>
            {form.provider_type === "azure" && (
              <div>
                <label className={lbl}>API Version</label>
                <input className={inp} value={form.api_version} placeholder="2025-03-01-preview"
                  onChange={e => setForm(f => ({ ...f, api_version: e.target.value }))} />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !form.name || !form.api_key || !form.model_name}
              className="flame-button disabled:opacity-50">
              {saving ? "Adicionando..." : "Adicionar provedor"}
            </button>
          </div>
        </form>
      </section>

      {/* Lista de provedores */}
      <section className="flame-panel overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Provedores configurados</h2>
          <p className="text-sm text-gray-500 mt-0.5">Selecione um provedor ao criar um perfil de avaliação.</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : providers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
              <Bot className="h-5 w-5 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Nenhum provedor configurado.</p>
            <p className="text-xs text-gray-400 mt-1">As avaliações usarão as variáveis de ambiente JUDGE_BASE_URL / OPENAI_API_KEY.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {providers.map(p => (
              <div key={p.id}>
                {editingId === p.id ? (
                  <div className="px-5 py-4 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Nome *</label>
                        <input className={inp} value={editForm.name} required
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className={lbl}>Tipo</label>
                        <select className={inp} value={editForm.provider_type}
                          onChange={e => setEditForm(f => ({ ...f, provider_type: e.target.value as any }))}>
                          <option value="azure">Azure OpenAI</option>
                          <option value="openai">OpenAI</option>
                          <option value="custom">Customizado</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Base URL</label>
                        <input className={inp} value={editForm.base_url}
                          onChange={e => setEditForm(f => ({ ...f, base_url: e.target.value }))} />
                      </div>
                      <div>
                        <label className={lbl}>API Key</label>
                        <input className={inp} type="password" value={editForm.api_key}
                          onChange={e => setEditForm(f => ({ ...f, api_key: e.target.value }))} />
                      </div>
                      <div>
                        <label className={lbl}>Modelo *</label>
                        <input className={inp} value={editForm.model_name}
                          onChange={e => setEditForm(f => ({ ...f, model_name: e.target.value }))} />
                      </div>
                      {editForm.provider_type === "azure" && (
                        <div>
                          <label className={lbl}>API Version</label>
                          <input className={inp} value={editForm.api_version}
                            onChange={e => setEditForm(f => ({ ...f, api_version: e.target.value }))} />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="flame-button-secondary flex items-center gap-1.5">
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                      <button onClick={() => handleSaveEdit(p.id)} disabled={saving}
                        className="flame-button flex items-center gap-1.5 disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flame-icon-shell h-10 w-10 shrink-0">
                        <Bot className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {p.model_name} · <span className="flame-chip">{p.provider_type}</span>
                          {p.base_url && <> · {p.base_url}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEdit(p)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-gray-600 hover:border-red-600 hover:text-red-700 flex items-center gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button onClick={() => handleDelete(p.id)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-gray-600 hover:border-red-600 hover:text-red-700 flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
