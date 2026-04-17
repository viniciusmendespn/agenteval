"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllDatasetEvaluations, type DatasetEvaluationSummary } from "@/lib/api"

const statusColor: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
  pending:   "bg-gray-100 text-gray-500",
}
const statusLabel: Record<string, string> = {
  completed: "Concluída",
  running:   "Executando",
  failed:    "Falhou",
  cancelled: "Cancelada",
  pending:   "Pendente",
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? "text-green-600 bg-green-50" : pct >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-600 bg-red-50"
  return <span className={`text-sm font-bold px-2 py-0.5 rounded ${color}`}>{pct}%</span>
}

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<DatasetEvaluationSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllDatasetEvaluations()
      .then(setEvaluations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avaliações de Dataset</h1>
          <p className="text-sm text-gray-500 mt-1">
            Avaliações retroativas de dados de produção importados
          </p>
        </div>
        <Link href="/datasets"
          className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
          Gerenciar datasets →
        </Link>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse" />
      ) : evaluations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm mb-3">Nenhuma avaliação de dataset ainda.</p>
          <Link href="/datasets" className="text-blue-600 hover:underline text-sm">
            Importar um dataset e avaliar →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Dataset</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Perfil usado</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Score geral</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {evaluations.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-400">#{ev.id}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{ev.dataset_name}</td>
                  <td className="px-5 py-3 text-gray-500">{ev.profile_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[ev.status]}`}>
                      {statusLabel[ev.status] ?? ev.status}
                    </span>
                  </td>
                  <td className="px-5 py-3"><ScoreBadge score={ev.overall_score} /></td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/datasets/${ev.dataset_id}/evaluations/${ev.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      ver resultados
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
