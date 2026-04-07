"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getDataset, getProfiles, createDatasetEvaluation, type DatasetDetail, type EvaluationProfile } from "@/lib/api"

export default function EvaluateDatasetPage() {
  const { id } = useParams<{ id: string }>()
  const [ds, setDs] = useState<DatasetDetail | null>(null)
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([])
  const [profileId, setProfileId] = useState<number | "">("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDataset(Number(id)).then(setDs).catch(() => {})
    getProfiles().then(setProfiles).catch(() => {})
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profileId) { setError("Selecione um perfil de avaliação."); return }
    setLoading(true); setError(null)
    try {
      const ev = await createDatasetEvaluation(Number(id), Number(profileId))
      window.location.href = `/datasets/${id}/evaluations/${ev.id}`
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  if (!ds) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <a href={`/datasets/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">← {ds.name}</a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Avaliar Dataset</h1>
      <p className="text-sm text-gray-500 mb-6">
        As respostas já existentes no dataset serão avaliadas pelas métricas do perfil selecionado.
        Nenhum agente será chamado.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium">{ds.name}</span>
          {" — "}{ds.records.length.toLocaleString()} registros a avaliar
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Perfil de Avaliação *</label>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nenhum perfil cadastrado. <a href="/profiles/new" className="text-blue-600">Crie um.</a>
            </p>
          ) : (
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profileId}
              onChange={e => setProfileId(Number(e.target.value))}
              required
            >
              <option value="">Selecione...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading || !profileId}
          className="w-full bg-blue-600 text-white py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Iniciando avaliação..." : `Avaliar ${ds.records.length.toLocaleString()} registros`}
        </button>
      </form>
    </div>
  )
}
