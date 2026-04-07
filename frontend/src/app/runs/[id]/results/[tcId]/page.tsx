"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getRun, getTestCase, getProfile, type TestResult, type TestCase, type EvaluationProfile } from "@/lib/api"
import { getMetricInfo, normalizeScore, scoreColorClasses } from "@/lib/metrics"
import { ChevronLeft } from "lucide-react"

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700
      prose-headings:font-semibold prose-headings:text-gray-900
      prose-a:text-blue-600 prose-a:underline
      prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
      prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
      prose-table:text-sm prose-th:bg-gray-50 prose-th:font-semibold
      prose-strong:text-gray-900 prose-li:my-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <a href={`/runs/${id}`} className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Execução #{id}
      </a>

      {/* Título + status */}
      <div className="flex items-center gap-3">
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
      </div>

      {/* Entrada */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrada</h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{tc?.input ?? "—"}</p>
      </div>

      {/* Resposta do agente */}
      {result.actual_output && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resposta do agente</h2>
          <MarkdownBlock content={result.actual_output} />
        </div>
      )}

      {/* Saída esperada */}
      {tc?.expected_output && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Saída esperada</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{tc.expected_output}</p>
        </div>
      )}

      {/* Erro */}
      {result.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Erro</h2>
          <p className="text-sm text-red-700 font-mono">{result.error}</p>
        </div>
      )}

      {/* Métricas */}
      {!result.error && Object.keys(result.scores).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Métricas</h2>
          <p className="text-xs text-gray-400 mb-4">
            Todos os scores são normalizados: 100% = ótimo, 0% = ruim.
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
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{info.label}</span>
                      {criterionText && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">"{criterionText}"</p>
                      )}
                    </div>
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${badge}`}>{norm}%</span>
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
