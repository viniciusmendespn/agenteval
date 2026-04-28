"use client"

import { useEffect, useState } from "react"
import { Bot, Plus, Pencil, Trash2, Check, X, Zap, Loader2, ChevronDown, MessageSquare } from "lucide-react"
import {
  getLLMProviders,
  createLLMProvider,
  updateLLMProvider,
  deleteLLMProvider,
  testLLMProvider,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  type LLMProvider,
} from "@/lib/api"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { LoadingButton } from "@/components/ui/LoadingButton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

type FormData = Omit<LLMProvider, "id" | "created_at">

const inp = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
const lbl = "block text-xs font-medium text-gray-600 mb-1"

function isBedrock(pt: string) { return pt === "bedrock" }

function ProviderTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={inp} value={value} onChange={e => onChange(e.target.value)}>
      <option value="azure">Azure OpenAI</option>
      <option value="openai">OpenAI</option>
      <option value="custom">Customizado (compatível OpenAI)</option>
      <option value="bedrock">AWS Bedrock</option>
    </select>
  )
}

function ProviderFields({ f, set }: { f: FormData; set: (fn: (prev: FormData) => FormData) => void }) {
  const bedrock = isBedrock(f.provider_type)
  return (
    <>
      {bedrock ? (
        <>
          <div>
            <label className={lbl}>Região AWS *</label>
            <input className={inp} value={f.aws_region} placeholder="us-east-1"
              onChange={e => set(p => ({ ...p, aws_region: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Account ID</label>
            <input className={inp} value={f.aws_account_id} placeholder="123456789012"
              onChange={e => set(p => ({ ...p, aws_account_id: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Access Key ID *</label>
            <input className={inp} value={f.aws_access_key_id} placeholder="AKIA..."
              onChange={e => set(p => ({ ...p, aws_access_key_id: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Secret Access Key *</label>
            <input className={inp} type="password" value={f.aws_secret_access_key} placeholder="••••••••"
              onChange={e => set(p => ({ ...p, aws_secret_access_key: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Session Token <span className="text-gray-400">(opcional)</span></label>
            <input className={inp} type="password" value={f.aws_session_token} placeholder="Deixe vazio para credenciais permanentes"
              onChange={e => set(p => ({ ...p, aws_session_token: e.target.value }))} />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={lbl}>Base URL</label>
            <input className={inp} value={f.base_url}
              placeholder={f.provider_type === "openai" ? "Deixe vazio para padrão" : "https://seu-endpoint.openai.azure.com"}
              onChange={e => set(p => ({ ...p, base_url: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>API Key *</label>
            <input className={inp} type="password" value={f.api_key} placeholder="sk-..."
              onChange={e => set(p => ({ ...p, api_key: e.target.value }))} />
          </div>
          {f.provider_type === "azure" && (
            <div>
              <label className={lbl}>API Version</label>
              <input className={inp} value={f.api_version} placeholder="2025-03-01-preview"
                onChange={e => set(p => ({ ...p, api_version: e.target.value }))} />
            </div>
          )}
        </>
      )}
    </>
  )
}

const EMPTY: FormData = {
  name: "",
  provider_type: "azure",
  base_url: "",
  api_key: "",
  model_name: "",
  api_version: "",
  aws_account_id: "",
  aws_access_key_id: "",
  aws_secret_access_key: "",
  aws_session_token: "",
  aws_region: "",
}

export default function LLMProvidersPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [chatProviderId, setChatProviderId] = useState<number | null>(null)
  const [savingChatProvider, setSavingChatProvider] = useState(false)

  function load() {
    setLoading(true)
    getLLMProviders().then(setProviders).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    getWorkspaceSettings().then(s => setChatProviderId(s.chat_llm_provider_id)).catch(() => {})
  }, [])

  async function handleSaveChatProvider(id: number | null) {
    setSavingChatProvider(true)
    try {
      await updateWorkspaceSettings({ chat_llm_provider_id: id })
      setChatProviderId(id)
      toast.success("Provedor do assistente atualizado")
    } catch {
      toast.error("Erro ao salvar")
    } finally {
      setSavingChatProvider(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await createLLMProvider(buildPayload(form))
      setForm(EMPTY)
      setFormOpen(false)
      toast.success("Provedor adicionado")
      load()
    } catch (e: any) { setError(e.message); toast.error("Erro ao adicionar provedor") }
    finally { setSaving(false) }
  }

  function startEdit(p: LLMProvider) {
    setEditingId(p.id)
    setEditForm({
      name: p.name,
      provider_type: p.provider_type,
      base_url: p.base_url ?? "",
      api_key: p.api_key ?? "",
      model_name: p.model_name,
      api_version: p.api_version ?? "",
      aws_account_id: p.aws_account_id ?? "",
      aws_access_key_id: p.aws_access_key_id ?? "",
      aws_secret_access_key: p.aws_secret_access_key ?? "",
      aws_session_token: p.aws_session_token ?? "",
      aws_region: p.aws_region ?? "",
    })
  }

  async function handleSaveEdit(id: number) {
    setSaving(true)
    try {
      await updateLLMProvider(id, buildPayload(editForm))
      setEditingId(null)
      toast.success("Provedor atualizado")
      load()
    } catch (e: any) { setError(e.message); toast.error("Erro ao atualizar provedor") }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    try {
      await deleteLLMProvider(id)
      toast.success("Provedor removido")
    } catch { toast.error("Erro ao remover provedor") }
    load()
  }

  async function handleTest(id: number) {
    setTestingId(id)
    setTestResults(r => ({ ...r, [id]: undefined as any }))
    try {
      const res = await testLLMProvider(id)
      setTestResults(r => ({
        ...r,
        [id]: { ok: res.ok, msg: res.ok ? `OK — ${res.reply ?? res.model}` : (res.error ?? "Falha") },
      }))
      if (res.ok) toast.success("Conexão OK")
      else toast.error(res.error ?? "Falha na conexão")
    } catch (e: any) {
      setTestResults(r => ({ ...r, [id]: { ok: false, msg: e.message } }))
      toast.error("Erro ao testar provedor")
    } finally {
      setTestingId(null)
    }
  }

  function buildPayload(f: FormData) {
    if (isBedrock(f.provider_type)) {
      return {
        name: f.name,
        provider_type: f.provider_type,
        model_name: f.model_name,
        aws_account_id: f.aws_account_id || undefined,
        aws_access_key_id: f.aws_access_key_id || undefined,
        aws_secret_access_key: f.aws_secret_access_key || undefined,
        aws_session_token: f.aws_session_token || undefined,
        aws_region: f.aws_region || undefined,
      }
    }
    return {
      name: f.name,
      provider_type: f.provider_type,
      base_url: f.base_url || undefined,
      api_key: f.api_key || undefined,
      model_name: f.model_name,
      api_version: f.api_version || undefined,
    }
  }

  function isCreateDisabled(f: FormData) {
    if (!f.name || !f.model_name) return true
    if (isBedrock(f.provider_type)) return !f.aws_access_key_id || !f.aws_secret_access_key || !f.aws_region
    return !f.api_key
  }

  return (
    <div className="max-w-5xl space-y-6">
      <Breadcrumb items={[{ label: "Configurações", href: "/settings" }, { label: "Provedores LLM" }]} />
      <p className="text-sm text-gray-500">Configure LLMs alternativos para usar como juiz nas avaliações e no assistente de chat.</p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Assistente de chat */}
      <section className="flame-panel px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flame-icon-shell h-10 w-10 shrink-0 mt-0.5">
            <MessageSquare className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Assistente de chat</h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-3">Selecione qual provedor LLM alimenta o chat flutuante da plataforma.</p>
            <div className="flex items-center gap-3">
              <select
                className="flex-1 max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                value={chatProviderId ?? ""}
                onChange={e => {
                  const val = e.target.value === "" ? null : Number(e.target.value)
                  handleSaveChatProvider(val)
                }}
                disabled={savingChatProvider || loading}
              >
                <option value="">Primeiro disponível (automático)</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.model_name} ({p.provider_type})
                  </option>
                ))}
              </select>
              {savingChatProvider && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            </div>
          </div>
        </div>
      </section>

      {/* Formulário de criação */}
      <section className="flame-panel">
        <button type="button" onClick={() => setFormOpen(o => !o)}
          className="flex w-full items-start justify-between gap-4 p-5 text-left">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Novo provedor</h2>
            <p className="text-sm text-gray-500 mt-1">Adicione um endpoint de LLM para usar como juiz em perfis de avaliação.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flame-icon-shell h-10 w-10">
              <Plus className="h-5 w-5 text-red-600" />
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${formOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {formOpen && <form onSubmit={handleCreate} className="px-5 pb-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome *</label>
              <input className={inp} value={form.name} placeholder="Ex: Claude Bedrock" required
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Tipo de provedor</label>
              <ProviderTypeSelect value={form.provider_type}
                onChange={v => setForm(f => ({ ...f, provider_type: v as any }))} />
            </div>
            <div>
              <label className={lbl}>Model ID *</label>
              <input className={inp} value={form.model_name}
                placeholder={isBedrock(form.provider_type) ? "anthropic.claude-3-5-sonnet-20241022-v2:0" : "gpt-4o, gpt-5.2, etc."}
                required onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} />
            </div>
            <ProviderFields f={form} set={setForm} />
          </div>
          <div className="flex justify-end">
            <LoadingButton
              type="submit"
              isLoading={saving}
              loadingText="Adicionando…"
              disabled={isCreateDisabled(form)}
            >
              Adicionar provedor
            </LoadingButton>
          </div>
        </form>}
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
                        <ProviderTypeSelect value={editForm.provider_type}
                          onChange={v => setEditForm(f => ({ ...f, provider_type: v as any }))} />
                      </div>
                      <div>
                        <label className={lbl}>Model ID *</label>
                        <input className={inp} value={editForm.model_name}
                          placeholder={isBedrock(editForm.provider_type) ? "anthropic.claude-3-5-sonnet-20241022-v2:0" : "gpt-4o"}
                          onChange={e => setEditForm(f => ({ ...f, model_name: e.target.value }))} />
                      </div>
                      <ProviderFields f={editForm} set={setEditForm} />
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
                          {p.provider_type === "bedrock" && p.aws_region && <> · {p.aws_region}</>}
                          {p.provider_type !== "bedrock" && p.base_url && <> · {p.base_url}</>}
                        </p>
                        {testResults[p.id] && (
                          <p className={`text-xs mt-0.5 truncate ${testResults[p.id].ok ? "text-green-600" : "text-red-600"}`}>
                            {testResults[p.id].ok ? "✓" : "✗"} {testResults[p.id].msg}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleTest(p.id)} disabled={testingId === p.id}
                        className="flame-button-secondary flex items-center gap-1.5 disabled:opacity-50">
                        {testingId === p.id
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testando...</>
                          : <><Zap className="h-3.5 w-3.5" /> Testar</>}
                      </button>
                      <button onClick={() => startEdit(p)} className="flame-button-secondary flex items-center gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <ConfirmDialog
                        title="Remover provedor?"
                        description="Este provedor será removido. Perfis que o utilizavam voltarão ao provedor padrão."
                        confirmText="Remover provedor"
                        onConfirm={() => handleDelete(p.id)}
                        trigger={
                          <button className="flame-button-secondary flex cursor-pointer items-center gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" /> Remover
                          </button>
                        }
                      />
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
