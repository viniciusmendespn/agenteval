"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createAgent, testConnection, previewResponse } from "@/lib/api"

const PRESETS = [
  {
    label: "Simples",
    body: `{"message": "{{message}}"}`,
    output: "response",
  },
  {
    label: "OpenAI / Azure",
    body: `{\n  "messages": [\n    {"role": "user", "content": "{{message}}"}\n  ]\n}`,
    output: "choices.0.message.content",
  },
  {
    label: "OpenAI + System",
    body: `{\n  "messages": [\n    {"role": "system", "content": "Você é um assistente."},\n    {"role": "user", "content": "{{message}}"}\n  ],\n  "temperature": 0.7\n}`,
    output: "choices.0.message.content",
  },
  {
    label: "SSE texto puro",
    body: `{"message": "{{message}}"}`,
    output: "",
    sse: true,
  },
]

const DEFAULT_BODY = PRESETS[0].body

export default function NewAgentPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [connectionType, setConnectionType] = useState("http")
  const [requestBody, setRequestBody] = useState(DEFAULT_BODY)
  const [outputField, setOutputField] = useState("response")
  const [bodyError, setBodyError] = useState<string | null>(null)

  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pinging, setPinging] = useState(false)
  const [preview, setPreview] = useState<unknown | null>(null)
  const [previewMsg, setPreviewMsg] = useState("Olá, tudo bem?")
  const [previewing, setPreviewing] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(p: typeof PRESETS[0]) {
    setRequestBody(p.body)
    setOutputField(p.output)
    if (p.sse) setConnectionType("sse")
    setBodyError(null)
    setPreview(null)
  }

  function handleBodyChange(val: string) {
    setRequestBody(val)
    try {
      JSON.parse(val.replace(/\{\{[^}]+\}\}/g, 'placeholder'))
      setBodyError(null)
    } catch {
      setBodyError("JSON inválido")
    }
  }

  async function handlePing() {
    if (!url) return
    setPinging(true)
    setPingResult(null)
    try {
      const r = await testConnection(url, apiKey)
      setPingResult({ ok: r.ok, msg: r.ok ? `OK (HTTP ${r.status_code})` : `Falhou: ${r.error}` })
    } catch (e: any) {
      setPingResult({ ok: false, msg: e.message })
    } finally {
      setPinging(false)
    }
  }

  async function handlePreview() {
    if (!url || bodyError) return
    setPreviewing(true)
    setPreview(null)
    try {
      const r = await previewResponse({ url, api_key: apiKey, connection_type: connectionType, request_body: requestBody, output_field: outputField, message: previewMsg })
      setPreview(r)
    } catch (e: any) {
      setPreview({ error: e.message })
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (bodyError) return
    setLoading(true)
    setError(null)
    try {
      await createAgent({ name, url, api_key: apiKey, connection_type: connectionType, request_body: requestBody, output_field: outputField })
      window.location.href = "/agents"
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Agente</h1>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Identificação */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Identificação</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Nome *</label>
              <input className={inp} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className={lbl}>URL do endpoint *</label>
              <div className="flex gap-2">
                <input className={`${inp} flex-1`} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
                <button type="button" onClick={handlePing} disabled={pinging || !url}
                  className="px-3 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-40 shrink-0">
                  {pinging ? "..." : "Testar"}
                </button>
              </div>
              {pingResult && (
                <p className={`text-xs mt-1 ${pingResult.ok ? "text-green-600" : "text-red-500"}`}>{pingResult.msg}</p>
              )}
            </div>
            <div className="col-span-2">
              <label className={lbl}>Token de autenticação <span className="font-normal text-gray-400">(Bearer — opcional)</span></label>
              <input className={inp} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Protocolo */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Protocolo</h2>
          <div className="flex gap-2">
            {[
              { v: "http", label: "HTTP", desc: "Request / Response" },
              { v: "sse",  label: "SSE",  desc: "Server-Sent Events" },
            ].map(t => (
              <button key={t.v} type="button" onClick={() => { setConnectionType(t.v); setPreview(null) }}
                className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${
                  connectionType === t.v ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}>
                {t.label}
                <span className="block text-xs font-normal opacity-75">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Request / Response */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Request &amp; Response</h2>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={lbl}>Body do request</label>
              <div className="flex gap-1">
                {PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => applyPreset(p)}
                    className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">Use <code className="bg-gray-100 px-1 rounded">{"{{message}}"}</code> onde a pergunta do caso de teste será inserida.</p>
            <textarea
              className={`${inp} h-32 font-mono text-xs resize-y ${bodyError ? "border-red-400" : ""}`}
              value={requestBody}
              onChange={e => handleBodyChange(e.target.value)}
              spellCheck={false}
            />
            {bodyError && <p className="text-xs text-red-500 mt-1">{bodyError}</p>}
          </div>

          <div>
            <label className={lbl}>Campo de saída <span className="font-normal text-gray-400">(dot-notation)</span></label>
            <p className="text-xs text-gray-400 mb-1">
              Caminho no JSON da resposta. Ex: <code className="bg-gray-100 px-1 rounded">choices.0.message.content</code>
              {connectionType === "sse" && <> — deixe vazio para SSE com texto puro</>}
            </p>
            <input className={inp} value={outputField} onChange={e => setOutputField(e.target.value)}
              placeholder={connectionType === "sse" ? "(vazio = texto puro)" : "response"} />
          </div>
        </section>

        {/* Preview */}
        <section className="bg-white border border-dashed border-gray-300 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-600">Inspecionar resposta</h2>
          <div className="flex gap-2">
            <input className={`${inp} flex-1`} value={previewMsg} onChange={e => setPreviewMsg(e.target.value)} placeholder="Mensagem de teste..." />
            <button type="button" onClick={handlePreview} disabled={previewing || !url || !!bodyError}
              className="px-4 py-2 bg-gray-800 text-white rounded text-xs hover:bg-gray-900 disabled:opacity-40 shrink-0">
              {previewing ? "Aguardando..." : "Enviar e ver resposta"}
            </button>
          </div>
          {preview && (() => {
            const p = preview as any
            return (
              <div className="space-y-2">
                {/* Resposta capturada */}
                {p.extracted != null && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-xs font-semibold text-green-700 mb-1">Resposta capturada</p>
                    <p className="text-sm text-green-900 whitespace-pre-wrap">{p.extracted}</p>
                  </div>
                )}
                {p.extract_error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-xs font-semibold text-red-700 mb-1">Erro ao extrair campo de saída</p>
                    <p className="text-xs text-red-600">{p.extract_error}</p>
                  </div>
                )}
                {p.error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-xs text-red-600">{p.error}</p>
                  </div>
                )}
                {/* JSON bruto */}
                <details>
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON bruto</summary>
                  <pre className="bg-gray-950 text-green-400 text-xs rounded p-3 overflow-auto max-h-56 whitespace-pre-wrap mt-1">
                    {JSON.stringify(p.raw_response ?? p.sample_events ?? p, null, 2)}
                  </pre>
                </details>
              </div>
            )
          })()}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading || !!bodyError}
          className="w-full bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Salvando..." : "Salvar agente"}
        </button>
      </form>
    </div>
  )
}

const lbl = "block text-xs font-medium text-gray-600 mb-1"
const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
