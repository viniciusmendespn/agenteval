"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, SlidersHorizontal } from "lucide-react"
import { motion } from "framer-motion"
import { getProfiles, type EvaluationProfile } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { ListSkeleton } from "@/components/Skeleton"

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
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perfis de Avaliação</h1>
          <p className="mt-1 text-sm text-gray-500">Critérios e limites usados nas avaliações deste workspace.</p>
        </div>
        <Link href="/profiles/new" className="flame-button">
          <Plus className="h-4 w-4" />
          Novo perfil
        </Link>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
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
        <div className="space-y-3">
          {profiles.map((p, i) => {
            const metrics = [
              p.use_relevancy ? `relevância >= ${Math.round(p.relevancy_threshold * 100)}%` : null,
              p.use_faithfulness ? `fidelidade >= ${Math.round(p.faithfulness_threshold * 100)}%` : null,
              p.use_hallucination ? `alucinação <= ${Math.round(p.hallucination_threshold * 100)}%` : null,
              p.use_toxicity ? `toxicidade <= ${Math.round(p.toxicity_threshold * 100)}%` : null,
              p.use_bias ? `viés <= ${Math.round(p.bias_threshold * 100)}%` : null,
              p.use_non_advice ? `sem conselhos <= ${Math.round(p.non_advice_threshold * 100)}%` : null,
              p.use_role_violation ? `papel <= ${Math.round(p.role_violation_threshold * 100)}%` : null,
              p.use_latency ? `latência <= ${p.latency_threshold_ms}ms` : null,
              ...p.criteria,
            ].filter((item): item is string => Boolean(item))

            return (
              <motion.div
                key={p.id}
                className="flame-panel p-4"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {metrics.map((metric, i) => (
                        <span key={i} className="flame-chip max-w-xs truncate">
                          {metric}
                        </span>
                      ))}
                      {metrics.length === 0 && (
                        <span className="text-xs text-gray-400">nenhuma métrica configurada</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/profiles/${p.id}/edit`} className="flame-link-action">
                      Editar
                    </Link>
                    <DeleteButton id={p.id} path="/profiles" onDeleted={() => setProfiles(prev => prev.filter(x => x.id !== p.id))} />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
