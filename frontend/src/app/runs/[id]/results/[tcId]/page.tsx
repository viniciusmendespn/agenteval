"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getRun, getTestCase, getProfile, type TestResult, type TestCase, type EvaluationProfile } from "@/lib/api"
import { getMetricInfo, normalizeScore, scoreColorClasses } from "@/lib/metrics"
import ConversationThread from "@/components/ConversationThread"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

export default function ResultDetailPage() {
  const { id, tcId } = useParams<{ id: string; tcId: string }>()
  const [result, setResult] = useState<TestResult | null>(null)
  const [tc, setTc] = useState<TestCase | null>(null)
  const [profile, setProfile] = useState<EvaluationProfile | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const run = await getRun(Number(id))
        const found = run.results.find(r => r.test_case_id === Number(tcId))
        if (!found) { setError(true); return }
        setResult(found)
        getTestCase(Number(tcId)).then(setTc).catch(() => {})
        getProfile(run.profile_id).then(setProfile).catch(() => {})
      } catch {
        setError(true)
      }
    }
    load()
  }, [id, tcId])

  if (error) return <div className="text-red-600 text-sm p-4">Resultado não encontrado.</div>
  if (!result) return <div className="text-gray-400 text-sm animate-pulse p-4">Carregando...</div>

  const criteria = profile?.criteria ?? []

  // Prefere turn_outputs quando disponível (multi-turn); cria turno sintético para single-turn
  const turns: Array<{ input: string; output: string }> =
    result.turn_outputs && result.turn_outputs.length > 0
      ? result.turn_outputs
      : [{ input: tc?.input ?? "", output: result.actual_output ?? "" }]

  const isMultiTurn = turns.length > 1

  const lastExpected = isMultiTurn
    ? (tc?.turns?.[tc.turns.length - 1]?.expected_output ?? null)
    : tc?.expected_output ?? null

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumb items={[
        { label: "Execuções", href: "/runs" },
        { label: `Execução #${id}`, href: `/runs/${id}` },
        { label: tc?.title ?? `Caso #${tcId}` },
      ]} />

      {/* Título + status */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900">
          {tc?.title ?? `Caso #${tcId}`}
        </h1>
        {result.error ? (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">erro</span>
        ) : result.passed ? (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">aprovado</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">reprovado</span>
        )}
        {result.turns_executed != null && result.turns_executed > 1 && (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
            {result.turns_executed} turnos
          </span>
        )}
      </div>

      {/* Conversa (single ou multi-turn) */}
      <ConversationThread turns={turns} lastExpected={lastExpected} />

      {/* Erro */}
      {result.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Erro</h2>
          <p className="text-sm text-red-700 font-mono">{result.error}</p>
        </div>
      )}

      {/* Métricas */}
      {!result.error && Object.keys(result.scores).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Métricas</h2>
          <p className="text-xs text-gray-400 mb-4">
            Todos os scores são normalizados: 100% = ótimo, 0% = ruim.
            {isMultiTurn && " Avaliação feita sobre o último turno da conversa."}
          </p>
          <div className="space-y-5">
            {Object.entries(result.scores).map(([k, v]) => {
              const info = getMetricInfo(k)
              const norm = normalizeScore(k, v)
              const { bar, badge } = scoreColorClasses(norm)
              const reason = result.reasons?.[k]
              const criterionText = k.startsWith("criterion_")
                ? criteria[Number(k.replace("criterion_", ""))]
                : null

              return (
                <div key={k} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="relative group inline-flex items-center gap-1.5 cursor-help">
                        <span className="text-sm font-semibold text-gray-800">{info.label}</span>
                        <span className="text-gray-400 text-xs leading-none">ⓘ</span>
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 leading-relaxed shadow-lg">
                          {criterionText ?? info.description}
                        </div>
                      </div>
                      {criterionText && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">"{criterionText}"</p>
                      )}
                    </div>
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg shrink-0 ${badge}`}>{norm}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${norm}%` }} />
                  </div>
                  {reason && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Motivo</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
