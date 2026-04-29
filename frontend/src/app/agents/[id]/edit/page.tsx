"use client"
import { useEffect, useState, useMemo, useRef } from "react"
import JsonEditor from "@/components/ui/JsonEditor"
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { useParams } from "next/navigation"
import { diffChars } from "diff"
import {
  getAgent, updateAgent, testConnection, previewResponse,
  getAgentPromptVersions, restorePromptVersion,
  type AgentPromptVersion,
} from "@/lib/api"
import { showAfterNav } from "@/components/PendingToast"
import { LoadingButton } from "@/components/ui/LoadingButton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

const PRESETS = [
  { label: "Simples",        body: `{"message": "{{message}}"}`,                                                                                                                    output: "response" },
  { label: "Com sessão",     body: `{"message": "{{message}}", "session_id": "{{sessionId}}"}`,                                                                                    output: "response" },
  { label: "OpenAI / Azure", body: `{\n  "messages": [\n    {"role": "user", "content": "{{message}}"}\n  ]\n}`,                                                                   output: "choices.0.message.content" },
  { label: "OpenAI + System",body: `{\n  "messages": [\n    {"role": "system", "content": "Você é um assistente."},\n    {"role": "user", "content": "{{message}}"}\n  ],\n  "temperature": 0.7\n}`, output: "choices.0.message.content" },
  { label: "OpenAI + System Prompt", body: `{\n  "messages": [\n    {"role": "system", "content": "{{system_prompt}}"},\n    {"role": "user", "content": "{{message}}"}\n  ]\n}`, output: "choices.0.message.content" },
  { label: "SSE texto puro", body: `{"message": "{{message}}"}`,                                                                                                                    output: "", sse: true },
]

const PROVIDERS = ["custom", "azure-openai", "openai", "anthropic", "google", "mistral"]
const PROVIDER_MODELS: Record<string, string[]> = {
  "azure-openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-35-turbo"],
  "openai":       ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o3-mini"],
  "anthropic":    ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20241022"],
  "google":       ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  "mistral":      ["mistral-large-latest", "mistral-small-latest"],
  "custom":       [],
}
const ENVIRONMENTS = ["experiment", "development", "staging", "production"]
const ENV_LABELS: Record<string, string> = {
  experiment: "Experimento", development: "Desenvolvimento", staging: "Homologação", production: "Produção",
}

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>()

  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [connectionType, setConnectionType] = useState("http")
  const [requestBody, setRequestBody] = useState("")
  const [outputField, setOutputField] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [bodyError, setBodyError] = useState<string | null>(null)

  // Metadata
  const [modelProvider, setModelProvider] = useState("custom")
  const [modelName, setModelName] = useState("")
  const [temperature, setTemperature] = useState<string>("")
  const [maxTokens, setMaxTokens] = useState<string>("")
  const [environment, setEnvironment] = useState("experiment")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [extraMetadata, setExtraMetadata] = useState("{}")
  const [extraError, setExtraError] = useState<string | null>(null)
  const [agentNotes, setAgentNotes] = useState("")
  const [sslVerify, setSslVerify] = useState(false)

  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pinging, setPinging] = useState(false)
  const [preview, setPreview] = useState<unknown | null>(null)
  const [previewMsg, setPreviewMsg] = useState("Olá, tudo bem?")
  const [previewSessionId, setPreviewSessionId] = useState("")
  const [previewing, setPreviewing] = useState(false)

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [versions, setVersions] = useState<AgentPromptVersion[]>([])
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const [useTokenCall, setUseTokenCall] = useState(false)
  const [tokenUrl, setTokenUrl] = useState("")
  const [tokenRequestBody, setTokenRequestBody] = useState("{}")
  const [tokenOutputField, setTokenOutputField] = useState("token")
  const [tokenHeaderName, setTokenHeaderName] = useState("Authorization")

  const loadVersions = () => getAgentPromptVersions(Number(id)).then(setVersions).catch(() => {})

  const versionDiffs = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < versions.length - 1; i++) {
      const a = versions[i + 1].system_prompt
      const b = versions[i].system_prompt
      const changes = diffChars(a, b)
      const changed = changes.reduce((sum, p) => sum + (p.added || p.removed ? p.value.length : 0), 0)
      const total = Math.max(a.length, b.length)
      map.set(versions[i].id, total === 0 ? 0 : Math.round((changed / total) * 100))
    }
    return map
  }, [versions])

  function diffBadgeClass(pct: number) {
    if (pct <= 20) return "bg-green-50 text-green-700 border-green-200"
    if (pct <= 60) return "bg-yellow-50 text-yellow-700 border-yellow-200"
    return "bg-red-50 text-red-700 border-red-200"
  }

  useEffect(() => {
    getAgent(Number(id))
      .then(a => {
        setName(a.name)
        setUrl(a.url)
        setApiKey(a.api_key)
        setConnectionType(a.connection_type)
        setRequestBody(a.request_body)
        setOutputField(a.output_field)
        setSystemPrompt(a.system_prompt ?? "")
        setModelProvider(a.model_provider || "custom")
        setModelName(a.model_name || "")
        setTemperature(a.temperature != null ? String(a.temperature) : "")
        setMaxTokens(a.max_tokens != null ? String(a.max_tokens) : "")
        setEnvironment(a.environment || "experiment")
        setTags(Array.isArray(a.tags) ? a.tags : [])
        setExtraMetadata(Object.keys(a.extra_metadata || {}).length ? JSON.stringify(a.extra_metadata, null, 2) : "{}")
        setAgentNotes(a.agent_notes ?? "")
        setSslVerify(a.ssl_verify ?? false)
        if (a.token_url) {
          setUseTokenCall(true)
          setTokenUrl(a.token_url)
          setTokenRequestBody(a.token_request_body ?? "{}")
          setTokenOutputField(a.token_output_field ?? "token")
          setTokenHeaderName(a.token_header_name ?? "Authorization")
        }
      })
      .catch(() => setError("Agente não encontrado"))
      .finally(() => setFetching(false))
    loadVersions()
  }, [id])

  const bodyRef = useRef<ReactCodeMirrorRef>(null)

  function insertPlaceholder(placeholder: string) {
    const view = bodyRef.current?.view
    if (view) {
      view.dispatch(view.state.replaceSelection(placeholder))
      view.focus()
    } else {
      handleBodyChange(requestBody + placeholder)
    }
  }

  function applyPreset(p: typeof PRESETS[0]) {
    setRequestBody(p.body); setOutputField(p.output)
    if (p.sse) setConnectionType("sse"); setBodyError(null); setPreview(null)
  }

  function handleBodyChange(val: string) {
    setRequestBody(val)
    try { JSON.parse(val.replace(/\{\{[^}]+\}\}/g, 'placeholder')); setBodyError(null) }
    catch { setBodyError("JSON inválido") }
  }

  function handleExtraChange(val: string) {
    setExtraMetadata(val)
    try { JSON.parse(val); setExtraError(null) } catch { setExtraError("JSON inválido") }
  }

  function addTag(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().replace(/,$/, "")
      if (t && !tags.includes(t)) setTags(prev => [...prev, t])
      setTagInput("")
    }
  }

  async function handlePing() {
    if (!url) return
    setPinging(true); setPingResult(null)
    try {
      const r = await testConnection(url, apiKey)
      setPingResult({ ok: r.ok, msg: r.ok ? `OK (HTTP ${r.status_code})` : `Falhou: ${r.error}` })
    } catch (e: unknown) { setPingResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" }) }
    finally { setPinging(false) }
  }

  async function handlePreview() {
    if (!url || bodyError) return
    const ciid = crypto.randomUUID()
    setPreviewSessionId(ciid); setPreviewing(true); setPreview(null)
    try {
      const r = await previewResponse({ url, api_key: apiKey, connection_type: connectionType, request_body: requestBody, output_field: outputField, message: previewMsg, session_id: ciid })
      setPreview(r)
    } catch (e: unknown) { setPreview({ error: e instanceof Error ? e.message : "Erro" }) }
    finally { setPreviewing(false) }
  }

  async function handleRestore(verId: number) {
    setRestoringId(verId)
    try {
      const updated = await restorePromptVersion(Number(id), verId)
      setSystemPrompt(updated.system_prompt ?? "")
      await loadVersions()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erro") }
    finally { setRestoringId(null) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (bodyError || extraError) return
    let parsedExtra: Record<string, unknown> = {}
    try { parsedExtra = JSON.parse(extraMetadata) } catch { /* fallback */ }
    setLoading(true); setError(null)
    try {
      await updateAgent(Number(id), {
        name, url, api_key: apiKey, connection_type: connectionType,
        request_body: requestBody, output_field: outputField,
        system_prompt: systemPrompt || undefined,
        token_url: useTokenCall ? tokenUrl || undefined : undefined,
        token_request_body: useTokenCall ? tokenRequestBody || undefined : undefined,
        token_output_field: useTokenCall ? tokenOutputField || undefined : undefined,
        token_header_name: useTokenCall ? tokenHeaderName || undefined : undefined,
        model_provider: modelProvider,
        model_name: modelName || undefined,
        temperature: temperature !== "" ? parseFloat(temperature) : undefined,
        max_tokens: maxTokens !== "" ? parseInt(maxTokens) : undefined,
        environment,
        tags,
        extra_metadata: parsedExtra,
        agent_notes: agentNotes || undefined,
        ssl_verify: sslVerify,
      })
      showAfterNav("Agente atualizado")
      window.location.href = "/agents"
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erro"); setLoading(false) }
  }

  if (fetching) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="max-w-2xl">
      <Breadcrumb items={[{ label: "Agentes", href: "/agents" }, { label: "Editar agente" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar Agente</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identificação */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className={sec}>Identificação</h2>
          <div>
            <label className={lbl}>Nome *</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className={lbl}>URL do endpoint *</label>
            <div className="flex gap-2">
              <input className={`${inp} flex-1`} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
              <button type="button" onClick={handlePing} disabled={pinging || !url}
                className="px-3 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-40 shrink-0">
                {pinging ? "..." : "Testar"}
              </button>
            </div>
            {pingResult && <p className={`text-xs mt-1 ${pingResult.ok ? "text-green-600" : "text-red-500"}`}>{pingResult.msg}</p>}
          </div>
          <div>
            <label className={lbl}>Token de autenticação <span className="font-normal text-gray-400">(Bearer — opcional)</span></label>
            <input className={inp} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
          </div>
        </section>

        {/* Configurações do agente */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className={sec}>Configurações do agente <span className="font-normal text-gray-400">(metadados para comparações)</span></h2>
          <p className="text-xs text-gray-400">
            Esses dados são salvos como snapshot em cada execução, permitindo comparar configurações diferentes lado a lado nos resultados.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Provedor</label>
              <select className={inp} value={modelProvider} onChange={e => { setModelProvider(e.target.value); setModelName("") }}>
                {PROVIDERS.map(p => (
                  <option key={p} value={p}>{p === "custom" ? "Custom" : p === "azure-openai" ? "Azure OpenAI" : p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : p === "google" ? "Google" : p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Modelo</label>
              <input
                className={inp}
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                list={`model-suggestions-${modelProvider}`}
                placeholder="gpt-4o, claude-3-5-sonnet..."
              />
              {PROVIDER_MODELS[modelProvider]?.length > 0 && (
                <datalist id={`model-suggestions-${modelProvider}`}>
                  {PROVIDER_MODELS[modelProvider].map(m => <option key={m} value={m} />)}
                </datalist>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Temperatura <span className="text-gray-400">(0–2)</span></label>
              <input className={inp} type="number" step="0.1" min="0" max="2"
                value={temperature} onChange={e => setTemperature(e.target.value)}
                placeholder="0.7" />
            </div>
            <div>
              <label className={lbl}>Max Tokens</label>
              <input className={inp} type="number" min="1"
                value={maxTokens} onChange={e => setMaxTokens(e.target.value)}
                placeholder="2000" />
            </div>
          </div>
          <div>
            <label className={lbl}>Ambiente</label>
            <select className={inp} value={environment} onChange={e => setEnvironment(e.target.value)}>
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{ENV_LABELS[e]}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Tags <span className="text-gray-400">(Enter ou vírgula para adicionar)</span></label>
            <div className="flex flex-wrap gap-1 mb-1">
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                  {t}
                  <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))} className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <input className={inp} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag}
              placeholder="guardrails-on, v2, A/B-test-A..." />
          </div>
          <div>
            <label className={lbl}>Configurações extras <span className="text-gray-400">(JSON livre — top_p, seed, etc.)</span></label>
            <textarea className={`${inp} h-16 font-mono text-xs resize-y ${extraError ? "border-red-400" : ""}`}
              value={extraMetadata} onChange={e => handleExtraChange(e.target.value)} spellCheck={false} />
            {extraError && <p className="text-xs text-red-500 mt-1">{extraError}</p>}
          </div>
          <div>
            <label className={lbl}>Notas sobre KBs e ferramentas <span className="text-gray-400">(opcional)</span></label>
            <p className="text-xs text-gray-400 mb-1">
              Descreva o estado atual das bases de conhecimento e ferramentas conectadas ao agente. Registrado no snapshot de cada execução.
            </p>
            <textarea
              className={`${inp} h-20 text-xs resize-y`}
              value={agentNotes}
              onChange={e => setAgentNotes(e.target.value)}
              placeholder="Ex: KB v3.2 (atualizada em 20/04), tool de consulta de saldo ativa, tool de PIX desativada para testes..."
              spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="ssl_verify" checked={sslVerify} onChange={e => setSslVerify(e.target.checked)}
              className="w-3.5 h-3.5 accent-red-600 cursor-pointer" />
            <label htmlFor="ssl_verify" className="text-xs text-gray-600 select-none cursor-pointer">
              Verificar certificado SSL
            </label>
            <span className="text-xs text-gray-400">(desativado por padrão — ambientes com proxy corporativo)</span>
          </div>
        </section>

        {/* System Prompt */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-2">
          <h2 className={sec}>System Prompt <span className="font-normal text-gray-400">(opcional)</span></h2>
          <p className="text-xs text-gray-400">
            Instruções do agente. Usado para avaliação de alinhamento e como contexto do judge LLM.
          </p>
          <textarea
            className={`${inp} h-28 text-xs resize-y font-mono`}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Ex: Você é um assistente bancário. Responda apenas sobre conta, cartão e empréstimos..."
            spellCheck={false}
          />
          {versions.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">Histórico de versões</p>
                {versions.length >= 2 && (
                  <a
                    href={`/agents/${id}/prompt-versions/compare?v1=${versions[1]?.id}&v2=${versions[0]?.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Comparar versões
                  </a>
                )}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {versions.map(v => (
                  <div key={v.id} className={`border rounded p-3 text-xs ${v.status === "active" ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-700">v{v.version_num}</span>
                        {v.label && <span className="text-gray-500 italic">{v.label}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.status === "active" ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                          {v.status === "active" ? "Em uso" : "Histórico"}
                        </span>
                        {versionDiffs.has(v.id) && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${diffBadgeClass(versionDiffs.get(v.id)!)}`}>
                            {versionDiffs.get(v.id)}% alterado
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 shrink-0">
                        {new Date(v.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {v.change_summary && (
                      <p className="text-gray-500 italic mb-1.5">{v.change_summary}</p>
                    )}
                    <p className="text-gray-600 font-mono line-clamp-2 mb-2">{v.system_prompt.slice(0, 120)}{v.system_prompt.length > 120 ? "..." : ""}</p>
                    <div className="flex gap-2 flex-wrap">
                      {v.status === "archived" && (
                        <button type="button" onClick={() => handleRestore(v.id)} disabled={restoringId === v.id}
                          className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50">
                          {restoringId === v.id ? "..." : "Restaurar"}
                        </button>
                      )}
                      <a
                        href={`/agents/${id}/prompt-versions/compare?v1=${v.id}&v2=${versions.find(x => x.status === "active")?.id ?? v.id}`}
                        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                      >
                        Comparar
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Protocolo */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className={sec}>Protocolo</h2>
          <div className="flex gap-2">
            {[{ v: "http", label: "HTTP", desc: "Request / Response" }, { v: "sse", label: "SSE", desc: "Server-Sent Events" }].map(t => (
              <button key={t.v} type="button" onClick={() => { setConnectionType(t.v); setPreview(null) }}
                className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${connectionType === t.v ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {t.label}<span className="block text-xs font-normal opacity-75">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Autenticação em dois passos */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className={sec}>Autenticação em dois passos <span className="font-normal text-gray-400">(opcional)</span></h2>
            <button type="button" onClick={() => setUseTokenCall(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${useTokenCall ? "bg-teal-500" : "bg-gray-300"}`}>
              <span className={`inline-flex h-5 w-5 items-center justify-center transform rounded-full bg-white shadow transition-transform ${useTokenCall ? "translate-x-[22px]" : "translate-x-0.5"}`}>
                {useTokenCall && <svg className="h-3 w-3 text-teal-500" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
            </button>
          </div>
          {useTokenCall && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-gray-400">Faz uma requisição de token antes de chamar o agente. Use <code className="bg-gray-100 px-1 rounded">{"{{token}}"}</code> no body principal.</p>
              <div><label className={lbl}>URL do token *</label><input className={inp} value={tokenUrl} onChange={e => setTokenUrl(e.target.value)} placeholder="https://auth.exemplo.com/token" /></div>
              <div><label className={lbl}>Body da requisição de token</label><textarea className={`${inp} h-20 font-mono text-xs resize-y`} value={tokenRequestBody} onChange={e => setTokenRequestBody(e.target.value)} spellCheck={false} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Campo do token</label><input className={inp} value={tokenOutputField} onChange={e => setTokenOutputField(e.target.value)} placeholder="token" /></div>
                <div><label className={lbl}>Header destino</label><input className={inp} value={tokenHeaderName} onChange={e => setTokenHeaderName(e.target.value)} placeholder="Authorization" /></div>
              </div>
            </div>
          )}
        </section>

        {/* Request & Response */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className={sec}>Request &amp; Response</h2>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={lbl}>Body do request</label>
              <select className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-500 bg-white hover:border-gray-300 focus:outline-none" value=""
                onChange={e => { const p = PRESETS.find(p => p.label === e.target.value); if (p) applyPreset(p) }}>
                <option value="">Preset...</option>
                {PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs text-gray-400">Inserir:</span>
              {["{{message}}", "{{sessionId}}", "{{systemPrompt}}"].map(p => (
                <button key={p} type="button" onClick={() => insertPlaceholder(p)}
                  className="text-xs font-mono bg-gray-100 hover:bg-red-50 hover:text-red-700 border border-gray-200 hover:border-red-300 px-1.5 py-0.5 rounded transition-colors">
                  {p}
                </button>
              ))}
              <span className="text-xs text-gray-300 mx-0.5">·</span>
              <span className="text-xs text-gray-400">ou qualquer variável nos casos de teste: <code className="font-mono text-gray-400">{"{{nomeVariavel}}"}</code></span>
              <button type="button" title="Formatar JSON" onClick={() => {
                try {
                  const formatted = JSON.stringify(JSON.parse(requestBody.replace(/\{\{[^}]+\}\}/g, (m) => `__PH_${m.slice(2,-2)}__`)), null, 2)
                    .replace(/"__PH_([^"]+)__"/g, (_, k) => `"{{${k}}}"`)
                  handleBodyChange(formatted)
                } catch {}
              }} className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors font-mono">
                {"{ }"}
              </button>
            </div>
            <JsonEditor ref={bodyRef} value={requestBody} onChange={handleBodyChange} hasError={!!bodyError} />
            {bodyError && <p className="text-xs text-red-500 mt-1">{bodyError}</p>}
          </div>
          <div>
            <label className={lbl}>Campo de saída <span className="font-normal text-gray-400">(dot-notation)</span></label>
            <input className={inp} value={outputField} onChange={e => setOutputField(e.target.value)} placeholder={connectionType === "sse" ? "(vazio = texto puro)" : "response"} />
          </div>
        </section>

        {/* Inspecionar resposta */}
        <section className="bg-white border border-dashed border-gray-300 rounded-lg p-5 space-y-3">
          <h2 className={`${sec} text-gray-500`}>Inspecionar resposta</h2>
          <div className="flex gap-2">
            <input className={`${inp} flex-1`} value={previewMsg} onChange={e => setPreviewMsg(e.target.value)} placeholder="Mensagem de teste..." />
            <button type="button" onClick={handlePreview} disabled={previewing || !url || !!bodyError}
              className="px-4 py-2 bg-gray-800 text-white rounded text-xs hover:bg-gray-900 disabled:opacity-40 shrink-0">
              {previewing ? "Aguardando..." : "Enviar e ver resposta"}
            </button>
          </div>
          {previewSessionId && <p className="text-xs text-gray-400"><span className="font-medium text-gray-500">{"{{sessionId}}"}</span> usado: <code className="font-mono text-gray-500">{previewSessionId}</code></p>}
          {preview != null && (() => {
            const p = preview as Record<string, unknown>
            return (
              <div className="space-y-2">
                {p.extracted != null && <div className="bg-green-50 border border-green-200 rounded p-3"><p className="text-xs font-semibold text-green-700 mb-1">Resposta capturada</p><p className="text-sm text-green-900 whitespace-pre-wrap">{String(p.extracted)}</p></div>}
                {!!p.extract_error && <div className="bg-red-50 border border-red-200 rounded p-3"><p className="text-xs text-red-600">{String(p.extract_error)}</p></div>}
                {!!p.error && <div className="bg-red-50 border border-red-200 rounded p-3"><p className="text-xs text-red-600">{String(p.error)}</p></div>}
                <details><summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON bruto</summary><pre className="bg-gray-950 text-green-400 text-xs rounded p-3 overflow-auto max-h-56 whitespace-pre-wrap mt-1">{JSON.stringify(p.raw_response ?? p.sample_events ?? p, null, 2)}</pre></details>
              </div>
            )
          })()}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <a href="/agents" className="flex-1 text-center flame-button-secondary">Cancelar</a>
          <LoadingButton type="submit" isLoading={loading} loadingText="Salvando alterações…" disabled={!!bodyError || !!extraError} className="flex-1">
            Salvar alterações
          </LoadingButton>
        </div>
      </form>
    </div>
  )
}

const lbl = "block text-xs font-medium text-gray-600 mb-1"
const sec = "text-sm font-semibold text-gray-700"
const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
