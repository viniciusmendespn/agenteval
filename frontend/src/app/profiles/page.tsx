import Link from "next/link"
import { getProfiles } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"

export const dynamic = "force-dynamic"

export default async function ProfilesPage() {
  let profiles = []
  try { profiles = await getProfiles() } catch {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Perfis de Avaliação</h1>
        <Link href="/profiles/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
          + Novo perfil
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
          Nenhum perfil criado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {p.use_relevancy && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        relevância ≥ {Math.round(p.relevancy_threshold * 100)}%
                      </span>
                    )}
                    {p.use_hallucination && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        alucinação ≥ {Math.round(p.hallucination_threshold * 100)}%
                      </span>
                    )}
                    {p.criteria.map((c, i) => (
                      <span key={i} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded max-w-xs truncate">
                        {c}
                      </span>
                    ))}
                    {!p.use_relevancy && !p.use_hallucination && p.criteria.length === 0 && (
                      <span className="text-xs text-gray-400">nenhuma métrica configurada</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/profiles/${p.id}/edit`} className="text-xs text-blue-500 hover:underline">
                    Editar
                  </Link>
                  <DeleteButton id={p.id} path="/profiles" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
