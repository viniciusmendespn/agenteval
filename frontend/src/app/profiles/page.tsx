"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, SlidersHorizontal } from "lucide-react"
import { motion } from "framer-motion"
import { getProfiles, type EvaluationProfile } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { TableSkeleton } from "@/components/Skeleton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

function activeMetrics(p: EvaluationProfile): string[] {
  return [
    p.use_relevancy      ? `relevância ≥${Math.round(p.relevancy_threshold * 100)}%`          : null,
    p.use_faithfulness   ? `fidelidade ≥${Math.round(p.faithfulness_threshold * 100)}%`        : null,
    p.use_hallucination  ? `alucinação ≤${Math.round(p.hallucination_threshold * 100)}%`       : null,
    p.use_toxicity       ? `toxicidade ≤${Math.round(p.toxicity_threshold * 100)}%`            : null,
    p.use_bias           ? `viés ≤${Math.round(p.bias_threshold * 100)}%`                      : null,
    p.use_non_advice     ? `sem conselhos ≤${Math.round(p.non_advice_threshold * 100)}%`       : null,
    p.use_role_violation ? `papel ≤${Math.round(p.role_violation_threshold * 100)}%`           : null,
    p.use_latency        ? `latência ≤${p.latency_threshold_ms}ms`                             : null,
  ].filter((m): m is string => Boolean(m))
}

function MetricChips({ metrics }: { metrics: string[] }) {
  if (metrics.length === 0)
    return <span className="text-xs text-gray-400 italic">nenhuma</span>
  const visible = metrics.slice(0, 3)
  const extra = metrics.length - visible.length
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(m => <span key={m} className="flame-chip truncate max-w-[160px]">{m}</span>)}
      {extra > 0 && <span className="flame-chip text-gray-400">+{extra}</span>}
    </div>
  )
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <Breadcrumb items={[{ label: "Perfis de Avaliação" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perfis de Avaliação</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Carregando…" : `${profiles.length} perfil${profiles.length !== 1 ? "is" : ""} neste workspace`}
          </p>
        </div>
        <Link href="/profiles/new" className="flame-button">
          <Plus className="h-4 w-4" />
          Novo perfil
        </Link>
      </div>

      {loading ? (
        <TableSkeleton columns={4} rows={5} />
      ) : profiles.length === 0 ? (
        <motion.div className="flame-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <SlidersHorizontal className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Nenhum perfil criado ainda.</p>
          <Link href="/profiles/new" className="flame-link mt-3 inline-block text-sm">
            Criar primeiro perfil
          </Link>
        </motion.div>
      ) : (
        <div className="flame-panel overflow-hidden">
          <table className="flame-table">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Métricas ativas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Critérios</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">LLM Judge</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiles.map((p, i) => {
                const metrics = activeMetrics(p)
                const criteria = p.criteria ?? []
                return (
                  <motion.tr
                    key={p.id}
                    className="hover:bg-gray-50"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.15 }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                      {p.name}
                    </td>
                    <td className="px-4 py-3">
                      <MetricChips metrics={metrics} />
                    </td>
                    <td className="px-4 py-3">
                      {criteria.length > 0
                        ? <span className="flame-chip">{criteria.length} critério{criteria.length !== 1 ? "s" : ""}</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {p.llm_provider_id
                        ? <span className="flame-chip bg-blue-50 text-blue-700 border-blue-200">customizado</span>
                        : <span className="text-xs text-gray-400">padrão</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/profiles/${p.id}/edit`} className="flame-link-action">
                          Editar
                        </Link>
                        <DeleteButton id={p.id} path="/profiles" onDeleted={() => setProfiles(prev => prev.filter(x => x.id !== p.id))} />
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
