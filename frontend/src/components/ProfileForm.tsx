"use client"
import { useState } from "react"
import { cn } from "@/lib/cn"

export type ProfileFormData = {
  name: string
  use_relevancy: boolean
  relevancy_threshold: number
  use_hallucination: boolean
  hallucination_threshold: number
  use_toxicity: boolean
  toxicity_threshold: number
  use_bias: boolean
  bias_threshold: number
  use_faithfulness: boolean
  faithfulness_threshold: number
  use_latency: boolean
  latency_threshold_ms: number
  criteria: string[]
}

interface Props {
  initial?: ProfileFormData
  onSubmit: (data: ProfileFormData) => Promise<void>
  submitLabel?: string
  backHref?: string
}

const DEFAULT: ProfileFormData = {
  name: "",
  use_relevancy: true,
  relevancy_threshold: 0.7,
  use_hallucination: false,
  hallucination_threshold: 0.5,
  use_toxicity: false,
  toxicity_threshold: 0.5,
  use_bias: false,
  bias_threshold: 0.5,
  use_faithfulness: false,
  faithfulness_threshold: 0.5,
  use_latency: false,
  latency_threshold_ms: 5000,
  criteria: [],
}

type MetricConfig = {
  key: string
  thresholdKey?: string
  label: string
  displayLabel: string
  description: string
  thresholdLabel: string
  thresholdHint: [string, string]
  note?: string
  color: string
  accentColor: string
  category: string
  isMs?: boolean
}

const METRICS: MetricConfig[] = [
  // Qualidade
  {
    key: "use_relevancy",
    thresholdKey: "relevancy_threshold",
    label: "Relevância da resposta",
    displayLabel: "Relevância",
    description: "Verifica se a resposta do agente é pertinente à pergunta feita. Respostas genéricas ou que ignoram a pergunta recebem score baixo.",
    thresholdLabel: "Score mínimo para aprovação",
    thresholdHint: ["0% — qualquer", "100% — perfeito"],
    color: "border-blue-200 bg-blue-50/30",
    accentColor: "blue",
    category: "quality",
  },
  {
    key: "use_faithfulness",
    thresholdKey: "faithfulness_threshold",
    label: "Fidelidade ao contexto",
    displayLabel: "Fidelidade",
    description: "Avalia se as afirmações do agente são suportadas pelo contexto fornecido. Exige contexto preenchido no caso de teste.",
    thresholdLabel: "Score mínimo para aprovação",
    thresholdHint: ["0% — qualquer", "100% — perfeito"],
    note: "Requer contexto",
    color: "border-indigo-200 bg-indigo-50/30",
    accentColor: "indigo",
    category: "quality",
  },
  // Segurança
  {
    key: "use_hallucination",
    thresholdKey: "hallucination_threshold",
    label: "Precisão Factual (Alucinação)",
    displayLabel: "Precisão Factual",
    description: "Verifica se o agente inventou informações que não existem no contexto. Score alto = pouca ou nenhuma alucinação. Requer contexto preenchido.",
    thresholdLabel: "Máximo de alucinação tolerável",
    thresholdHint: ["0% — nenhuma", "100% — qualquer"],
    note: "Requer contexto",
    color: "border-purple-200 bg-purple-50/30",
    accentColor: "purple",
    category: "safety",
  },
  {
    key: "use_toxicity",
    thresholdKey: "toxicity_threshold",
    label: "Segurança (Toxicidade)",
    displayLabel: "Segurança",
    description: "Detecta linguagem ofensiva, agressiva ou inapropriada. Score alto = nenhuma toxicidade detectada.",
    thresholdLabel: "Máximo de toxicidade tolerável",
    thresholdHint: ["0% — nenhuma", "100% — qualquer"],
    color: "border-red-200 bg-red-50/30",
    accentColor: "red",
    category: "safety",
  },
  {
    key: "use_bias",
    thresholdKey: "bias_threshold",
    label: "Imparcialidade (Viés)",
    displayLabel: "Imparcialidade",
    description: "Identifica respostas com viés de gênero, racial, político ou outros preconceitos. Score alto = resposta imparcial.",
    thresholdLabel: "Máximo de viés tolerável",
    thresholdHint: ["0% — nenhum", "100% — qualquer"],
    color: "border-orange-200 bg-orange-50/30",
    accentColor: "orange",
    category: "safety",
  },
  // Performance
  {
    key: "use_latency",
    thresholdKey: "latency_threshold_ms",
    label: "Latência de resposta",
    displayLabel: "Latência",
    description: "Avalia o tempo de resposta do agente. Score 100% se dentro do limite, cai proporcionalmente se ultrapassar.",
    thresholdLabel: "Tempo máximo aceitável",
    thresholdHint: ["500ms", "30s"],
    color: "border-green-200 bg-green-50/30",
    accentColor: "green",
    category: "performance",
    isMs: true,
  },
]

const CATEGORIES = [
  { key: "quality",     label: "Qualidade" },
  { key: "safety",      label: "Segurança" },
  { key: "performance", label: "Performance" },
]

function MetricRow({
  config,
  enabled,
  threshold,
  onChange,
  onThresholdChange,
}: {
  config: MetricConfig
  enabled: boolean
  threshold: number
  onChange: (v: boolean) => void
  onThresholdChange: (v: number) => void
}) {
  const pct = config.isMs ? threshold : Math.round(threshold * 100)
  const badgeColor = config.accentColor === "blue" ? "text-blue-700 bg-blue-100"
    : config.accentColor === "indigo" ? "text-indigo-700 bg-indigo-100"
    : config.accentColor === "purple" ? "text-purple-700 bg-purple-100"
    : config.accentColor === "red" ? "text-red-700 bg-red-100"
    : config.accentColor === "orange" ? "text-orange-700 bg-orange-100"
    : "text-green-700 bg-green-100"

  const accentSlider = `accent-${config.accentColor}-600`

  return (
    <div className={cn(
      "border rounded-lg p-4 space-y-3 transition-colors",
      enabled ? config.color : "border-gray-100"
    )}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 rounded"
          checked={enabled}
          onChange={e => onChange(e.target.checked)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{config.label}</p>
            {config.note && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {config.note}
              </span>
            )}
          </div>
          <p className={hint}>{config.description}</p>
        </div>
      </label>
      {enabled && config.thresholdKey && (
        <div className="pl-6">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">{config.thresholdLabel}</label>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeColor}`}>
              {config.isMs ? `${pct}ms` : `${pct}%`}
            </span>
          </div>
          {config.isMs ? (
            <input
              type="range"
              min="500"
              max="30000"
              step="500"
              className={`w-full ${accentSlider}`}
              value={threshold}
              onChange={e => onThresholdChange(Number(e.target.value))}
            />
          ) : (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              className={`w-full ${accentSlider}`}
              value={threshold}
              onChange={e => onThresholdChange(Number(e.target.value))}
            />
          )}
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>{config.thresholdHint[0]}</span>
            <span>{config.thresholdHint[1]}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfileForm({ initial = DEFAULT, onSubmit, submitLabel = "Salvar perfil", backHref }: Props) {
  const [form, setForm] = useState(initial)
  const [criteria, setCriteria] = useState<string[]>(initial.criteria.length ? initial.criteria : [""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = (k: keyof ProfileFormData, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await onSubmit({ ...form, criteria: criteria.filter(Boolean) })
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  const activeCount = METRICS.filter(m => form[m.key as keyof ProfileFormData]).length
    + criteria.filter(Boolean).length

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Nome */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <label className={lbl}>Nome do perfil *</label>
        <p className={hint}>Nome descritivo para este conjunto de métricas. Ex: "Suporte ao Cliente", "Vendas".</p>
        <input className={inp} value={form.name} onChange={e => setField("name", e.target.value)} required />
      </section>

      {/* Cobertura */}
      {activeCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-blue-700">
          <span className="font-semibold">{activeCount} métricas ativas</span>
          <span>neste perfil</span>
        </div>
      )}

      {/* Métricas por categoria */}
      {CATEGORIES.map(cat => {
        const catMetrics = METRICS.filter(m => m.category === cat.key)
        return (
          <section key={cat.key} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className={sec}>{cat.label}</h2>
            {catMetrics.map(m => {
              const thresholdVal = m.thresholdKey
                ? Number(form[m.thresholdKey as keyof ProfileFormData] ?? 0.5)
                : 0.5
              return (
                <MetricRow
                  key={m.key}
                  config={m}
                  enabled={!!form[m.key as keyof ProfileFormData]}
                  threshold={thresholdVal}
                  onChange={v => setField(m.key as keyof ProfileFormData, v)}
                  onThresholdChange={v => m.thresholdKey && setField(m.thresholdKey as keyof ProfileFormData, v)}
                />
              )
            })}
          </section>
        )
      })}

      {/* Critérios GEval */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h2 className={sec}>Critérios em linguagem natural</h2>
        <p className={hint}>
          Escreva regras de negócio em texto livre. O LLM judge avaliará cada resposta
          contra cada critério (aprovado se score ≥ 50%).
        </p>
        <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600 mb-1">Exemplos:</p>
          <p>• "O agente nunca deve mencionar concorrentes pelo nome"</p>
          <p>• "Deve sempre sugerir falar com um humano quando o usuário estiver frustrado"</p>
          <p>• "Deve responder em português formal, sem gírias"</p>
          <p>• "Não deve fornecer preços sem antes confirmar a localização do cliente"</p>
        </div>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${inp} flex-1`}
                value={c}
                placeholder={`Critério ${i + 1}...`}
                onChange={e => setCriteria(prev => prev.map((x, idx) => idx === i ? e.target.value : x))}
              />
              {criteria.length > 1 && (
                <button type="button"
                  onClick={() => setCriteria(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-gray-300 hover:text-red-400 px-2 text-lg leading-none">×</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setCriteria(prev => [...prev, ""])}
          className="text-sm text-blue-600 hover:underline">
          + Adicionar critério
        </button>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        {backHref && (
          <a href={backHref} className="flex-1 text-center py-2.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancelar
          </a>
        )}
        <button type="submit" disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Salvando..." : submitLabel}
        </button>
      </div>
    </form>
  )
}

const lbl  = "block text-sm font-medium text-gray-700 mb-1"
const sec  = "text-sm font-semibold text-gray-700"
const hint = "text-xs text-gray-400 mb-2 leading-relaxed"
const inp  = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
