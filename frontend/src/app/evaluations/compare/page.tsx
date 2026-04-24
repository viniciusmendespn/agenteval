"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { getEvaluations, compareEvaluations, type EvaluationSummary, type EvaluationComparison } from "@/lib/api"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
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

const evalTypeLabel: Record<string, string> = { run: "Execução", dataset: "Dataset" }

function CompareContent() {
  const params = useSearchParams()
  const [evals, setEvals] = useState<EvaluationSummary[]>([])
  const [evalA, setEvalA] = useState<string>(params.get("a") ?? "")
  const [evalB, setEvalB] = useState<string>(params.get("b") ?? "")
  const [comparison, setComparison] = useState<EvaluationComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemFilter, setItemFilter] = useState<"all" | "regressions" | "improvements">("all")

  useEffect(() => {
    getEvaluations({ status: "completed" } as any).catch(() => getEvaluations()).then(setEvals).catch(() => {})
  }, [])

  useEffect(() => {
    if (evalA && evalB && evalA !== evalB) handleCompare()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCompare() {
    if (!evalA || !evalB || evalA === evalB) return
    setLoading(true)
    setError(null)
    setComparison(null)
    try {
      const result = await compareEvaluations(Number(evalA), Number(evalB))
      setComparison(result)
    } catch (e: any) {
      setError(e.message || "Erro ao comparar avaliações")
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = comparison?.items?.filter(item => {
    if (itemFilter === "regressions") return item.regression
    if (itemFilter === "improvements") return item.improvement
    return true
  }) ?? []

  return (
    <div>
      <Breadcrumb items={[{ label: "Avaliações de Dataset", href: "/evaluations" }, { label: "Comparação A/B" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Comparação A/B de Avaliações</h1>

      <div className="flame-panel p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Avaliação A (base)</label>
            <select
              value={evalA}
              onChange={e => setEvalA(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— selecione —</option>
              {evals.map(ev => (
                <option key={ev.id} value={ev.id}>
                  #{ev.id} · {ev.dataset_name ?? ev.agent_name ?? "?"} · {new Date(ev.created_at).toLocaleDateString("pt-BR")} [{evalTypeLabel[ev.eval_type] ?? ev.eval_type}]
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Avaliação B (nova)</label>
            <select
              value={evalB}
              onChange={e => setEvalB(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— selecione —</option>
              {evals.map(ev => (
                <option key={ev.id} value={ev.id} disabled={String(ev.id) === evalA}>
                  #{ev.id} · {ev.dataset_name ?? ev.agent_name ?? "?"} · {new Date(ev.created_at).toLocaleDateString("pt-BR")} [{evalTypeLabel[ev.eval_type] ?? ev.eval_type}]
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleCompare}
          disabled={!evalA || !evalB || evalA === evalB || loading}
          className="flame-button disabled:opacity-40"
        >
          {loading ? "Comparando..." : "Comparar"}
        </button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {comparison && (
        <>
          {/* Header com scores */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="flame-panel p-4 text-center">
              <p className="text-xs font-medium text-gray-500 mb-1">
                {comparison.eval_a.eval_type === "run" ? "Execução" : "Dataset"} A — {comparison.eval_a.name}
              </p>
              <p className="text-xs text-gray-400 mb-2">{comparison.eval_a.profile_name}</p>
              <ScorePill score={comparison.eval_a.score} />
              <p className="text-xs text-gray-400 mt-1">{comparison.eval_a.total_items} itens</p>
            </div>
            <div className="flame-panel p-4 text-center flex flex-col items-center justify-center">
              <p className="text-xs text-gray-400 mb-1">Variação geral</p>
              <DeltaBadge delta={comparison.summary.score_delta} />
              <div className="mt-3 space-y-1 text-xs">
                {comparison.summary.regressions > 0 && (
                  <p className="text-red-600">{comparison.summary.regressions} regressão(ões)</p>
                )}
                {comparison.summary.improvements > 0 && (
                  <p className="text-green-600">{comparison.summary.improvements} melhoria(s)</p>
                )}
                <p className="text-gray-400">{comparison.summary.unchanged} sem mudança</p>
              </div>
            </div>
            <div className="flame-panel p-4 text-center">
              <p className="text-xs font-medium text-gray-500 mb-1">
                {comparison.eval_b.eval_type === "run" ? "Execução" : "Dataset"} B — {comparison.eval_b.name}
              </p>
              <p className="text-xs text-gray-400 mb-2">{comparison.eval_b.profile_name}</p>
              <ScorePill score={comparison.eval_b.score} />
              <p className="text-xs text-gray-400 mt-1">{comparison.eval_b.total_items} itens</p>
            </div>
          </div>

          {/* Comparação de métricas */}
          <div className="flame-panel overflow-hidden mb-6">
            <h2 className="px-5 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">Comparação por métrica</h2>
            <table className="flame-table">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Métrica</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">A</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">B</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparison.metric_comparison.map(m => (
                  <tr key={m.metric} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm text-gray-700">{metricLabel(m.metric)}</td>
                    <td className="px-5 py-3 text-center"><ScorePill score={m.score_a} /></td>
                    <td className="px-5 py-3 text-center"><ScorePill score={m.score_b} /></td>
                    <td className="px-5 py-3 text-center"><DeltaBadge delta={m.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparação por item */}
          {comparison.can_compare_items && comparison.items && (
            <div className="flame-panel overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Comparação por item</h2>
                <div className="flex gap-2">
                  {(["all", "regressions", "improvements"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setItemFilter(f)}
                      className={`text-xs px-3 py-1 rounded-full border ${itemFilter === f ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {f === "all" ? `Todos (${comparison.items!.length})` : f === "regressions" ? `Regressões (${comparison.summary.regressions})` : `Melhorias (${comparison.summary.improvements})`}
                    </button>
                  ))}
                </div>
              </div>
              <table className="flame-table">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Item</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Entrada (prévia)</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">A</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">B</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map(item => (
                    <tr key={item.item_id}
                      className={item.regression ? "bg-red-50/40" : item.improvement ? "bg-green-50/40" : "hover:bg-gray-50/50"}>
                      <td className="px-5 py-3 text-sm text-gray-700 font-medium">{item.label}</td>
                      <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate" title={item.input_preview}>{item.input_preview}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${item.status_a === "passed" ? "bg-green-100 text-green-700" : item.status_a === "missing" ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700"}`}>
                          {item.status_a === "passed" ? "OK" : item.status_a === "missing" ? "—" : "Falhou"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${item.status_b === "passed" ? "bg-green-100 text-green-700" : item.status_b === "missing" ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700"}`}>
                          {item.status_b === "passed" ? "OK" : item.status_b === "missing" ? "—" : "Falhou"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {item.regression && <span className="text-xs text-red-600 font-semibold">Regressão</span>}
                        {item.improvement && <span className="text-xs text-green-600 font-semibold">Melhoria</span>}
                        {!item.regression && !item.improvement && <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!comparison.can_compare_items && (
            <div className="flame-panel p-5 text-center text-sm text-gray-500">
              Comparação por item não disponível para avaliações de tipos diferentes (execução vs. dataset).
              Apenas a comparação de métricas está disponível.
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function EvaluationsComparePage() {
  return (
    <Suspense>
      <CompareContent />
    </Suspense>
  )
}
