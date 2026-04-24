"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { getRuns, compareRuns, type TestRun, type RunComparison, type AgentMetadataSnapshot } from "@/lib/api"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/cn"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

const METRIC_LABELS: Record<string, string> = {
  relevancy: "Relevância",
  hallucination: "Alucinação",
  toxicity: "Toxicidade",
  bias: "Viés",
  faithfulness: "Fidelidade",
  latency: "Latência",
}

function metricLabel(k: string) {
  return METRIC_LABELS[k] ?? k.replace("criterion_", "Critério ")
}

function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "text-green-700 bg-green-100" : pct >= 50 ? "text-yellow-700 bg-yellow-100" : "text-red-700 bg-red-100"
  return <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${color}`}>{pct}%</span>
}

function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(Math.abs(delta) * 100)
  if (pct === 0) return <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" /> 0%</span>
  if (delta > 0) return <span className="flex items-center gap-0.5 text-xs text-green-600 font-semibold"><TrendingUp className="w-3 h-3" />+{pct}%</span>
  return <span className="flex items-center gap-0.5 text-xs text-red-600 font-semibold"><TrendingDown className="w-3 h-3" />-{pct}%</span>
}

const META_LABELS: Record<string, string> = {
  model_name: "Modelo",
  model_provider: "Provedor",
  temperature: "Temperatura",
  max_tokens: "Max tokens",
  environment: "Ambiente",
}

function MetaCard({ own, other }: { own?: AgentMetadataSnapshot | null; other?: AgentMetadataSnapshot | null }) {
  if (!own) return null
  const keys = ["model_name", "model_provider", "temperature", "max_tokens", "environment"] as const
  const rows = keys.filter(k => own[k] != null)
  const ownTags = own.tags ?? []
  if (rows.length === 0 && ownTags.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
      {rows.map(k => {
        const val = String(own[k])
        const differs = other != null && String(other[k] ?? "—") !== val
        return (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{META_LABELS[k]}</span>
            <span className={differs ? "font-semibold text-amber-600" : "text-gray-600"}>{val}</span>
          </div>
        )
      })}
      {ownTags.length > 0 && (
        <div className="flex items-start justify-between text-xs gap-2">
          <span className="text-gray-400 shrink-0">Tags</span>
          <div className="flex flex-wrap gap-1 justify-end">
            {ownTags.map(tag => {
              const inOther = other?.tags?.includes(tag) ?? false
              return (
                <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] ${inOther ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600 font-semibold"}`}>
                  {tag}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareContent() {
  const params = useSearchParams()
  const [runs, setRuns] = useState<TestRun[]>([])
  const [runA, setRunA] = useState<string>(params.get("a") ?? "")
  const [runB, setRunB] = useState<string>(params.get("b") ?? "")
  const [comparison, setComparison] = useState<RunComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caseFilter, setCaseFilter] = useState<"all" | "regressions" | "improvements">("all")

  useEffect(() => {
    getRuns().then(setRuns).catch(() => {})
  }, [])

  async function handleCompare() {
    if (!runA || !runB || runA === runB) return
    setLoading(true)
    setError(null)
    setComparison(null)
    try {
      const result = await compareRuns(Number(runA), Number(runB))
      setComparison(result)
    } catch (e: any) {
      setError(e.message || "Erro ao comparar execuções")
    } finally {
      setLoading(false)
    }
  }

  const completedRuns = runs.filter(r => r.status === "completed")

  const filteredCases = comparison?.cases.filter(c => {
    if (caseFilter === "regressions") return c.regression
    if (caseFilter === "improvements") return c.improvement
    return true
  }) ?? []

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Execuções", href: "/runs" }, { label: "Comparar Execuções" }]} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comparar Execuções</h1>
        <p className="text-sm text-gray-500 mt-1">Identifique regressões e melhorias entre duas execuções</p>
      </div>

      {/* Seletores */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Execução A (base)</label>
            <select
              value={runA}
              onChange={e => setRunA(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione...</option>
              {completedRuns.map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.overall_score != null ? `${Math.round(r.overall_score * 100)}%` : "sem score"} — {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Execução B (comparação)</label>
            <select
              value={runB}
              onChange={e => setRunB(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione...</option>
              {completedRuns.filter(r => String(r.id) !== runA).map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.overall_score != null ? `${Math.round(r.overall_score * 100)}%` : "sem score"} — {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCompare}
            disabled={!runA || !runB || runA === runB || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Comparando..." : "Comparar"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Resultados da comparação */}
      {comparison && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Delta de score</p>
              <div className="text-xl font-bold text-gray-900">
                <DeltaBadge delta={comparison.summary.score_delta} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-red-200 bg-red-50/30 p-4">
              <p className="text-xs text-red-500 mb-1">Regressões</p>
              <p className="text-2xl font-bold text-red-600">{comparison.summary.regressions}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 bg-green-50/30 p-4">
              <p className="text-xs text-green-600 mb-1">Melhorias</p>
              <p className="text-2xl font-bold text-green-600">{comparison.summary.improvements}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Sem mudança</p>
              <p className="text-2xl font-bold text-gray-600">{comparison.summary.unchanged}</p>
            </div>
          </div>

          {/* Score A vs B */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 mb-1">Execução A (base) — #{comparison.run_a.id}</p>
              <p className="font-semibold text-gray-800">{comparison.run_a.agent_name}</p>
              <div className="mt-2">
                <ScorePill score={comparison.run_a.score} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(comparison.run_a.created_at).toLocaleString("pt-BR")}</p>
              <MetaCard own={comparison.run_a.agent_metadata_snapshot} other={comparison.run_b.agent_metadata_snapshot} />
            </div>
            <div className="bg-white rounded-xl border border-blue-200 p-5">
              <p className="text-xs text-gray-500 mb-1">Execução B (nova) — #{comparison.run_b.id}</p>
              <p className="font-semibold text-gray-800">{comparison.run_b.agent_name}</p>
              <div className="mt-2">
                <ScorePill score={comparison.run_b.score} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(comparison.run_b.created_at).toLocaleString("pt-BR")}</p>
              <MetaCard own={comparison.run_b.agent_metadata_snapshot} other={comparison.run_a.agent_metadata_snapshot} />
            </div>
          </div>

          {/* Comparação por métrica */}
          {comparison.metric_comparison.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Comparação por métrica</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Métrica</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Run A</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Run B</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Variação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {comparison.metric_comparison.map(m => (
                    <tr key={m.metric} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-700">{metricLabel(m.metric)}</td>
                      <td className="px-5 py-3"><ScorePill score={m.score_a} /></td>
                      <td className="px-5 py-3"><ScorePill score={m.score_b} /></td>
                      <td className="px-5 py-3"><DeltaBadge delta={m.delta} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Casos individuais */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Casos de teste</h2>
              <div className="flex gap-1.5">
                {(["all", "regressions", "improvements"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setCaseFilter(f)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
                      caseFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {f === "all" ? "Todos" : f === "regressions" ? `⚠ Regressões (${comparison.summary.regressions})` : `✓ Melhorias (${comparison.summary.improvements})`}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Caso de teste</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status A</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status B</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Mudança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCases.map(c => (
                  <tr key={c.test_case_id} className={cn(
                    "hover:bg-gray-50/50",
                    c.regression ? "bg-red-50/30" : c.improvement ? "bg-green-50/30" : ""
                  )}>
                    <td className="px-5 py-3 font-medium text-gray-800">{c.title}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-medium",
                        c.status_a === "passed" ? "bg-green-100 text-green-700" :
                        c.status_a === "failed" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {c.status_a === "passed" ? "✓ aprovado" : c.status_a === "failed" ? "✗ reprovado" : c.status_a}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-medium",
                        c.status_b === "passed" ? "bg-green-100 text-green-700" :
                        c.status_b === "failed" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {c.status_b === "passed" ? "✓ aprovado" : c.status_b === "failed" ? "✗ reprovado" : c.status_b}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {c.regression && (
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <TrendingDown className="w-3.5 h-3.5" /> Regressão
                        </span>
                      )}
                      {c.improvement && (
                        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" /> Melhoria
                        </span>
                      )}
                      {!c.regression && !c.improvement && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Minus className="w-3.5 h-3.5" /> Inalterado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCases.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-sm">
                      Nenhum caso encontrado com este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Carregando...</div>}>
      <CompareContent />
    </Suspense>
  )
}
