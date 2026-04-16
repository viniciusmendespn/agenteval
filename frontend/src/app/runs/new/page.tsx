"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getAgents, getProfiles, getTestCases, createRun, type Agent, type EvaluationProfile, type TestCase } from "@/lib/api"

export default function NewRunPage() {
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState<Agent[]>([])
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])

  const [agentId, setAgentId] = useState<number | "">("")
  const [profileId, setProfileId] = useState<number | "">("")
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set())

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const agentParam = searchParams.get("agent")
    const profileParam = searchParams.get("profile")
    const casesParam = searchParams.get("cases")

    if (agentParam) setAgentId(Number(agentParam))
    if (profileParam) setProfileId(Number(profileParam))
    if (casesParam) {
      const ids = casesParam.split(",").map(Number).filter(Boolean)
      setSelectedCases(new Set(ids))
    }
  }, [searchParams])

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {})
    getProfiles().then(setProfiles).catch(() => {})
    getTestCases().then(setTestCases).catch(() => {})
  }, [])

  function toggleCase(id: number) {
    setSelectedCases(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedCases.size === testCases.length) setSelectedCases(new Set())
    else setSelectedCases(new Set(testCases.map(tc => tc.id)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agentId || !profileId || selectedCases.size === 0) {
      setError("Selecione um agente, um perfil e ao menos um caso de teste.")
      return
    }
    setLoading(true); setError(null)
    try {
      const run = await createRun({
        agent_id: Number(agentId),
        profile_id: Number(profileId),
        test_case_ids: [...selectedCases],
      })
      window.location.href = `/runs/${run.id}`
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href="/runs" className="text-gray-400 hover:text-gray-600 text-sm">← Execuções</a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Testar Agente</h1>
      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Agente *</label>
          {agents.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum agente cadastrado. <a href="/agents/new" className="text-blue-600">Cadastre um.</a></p>
          ) : (
            <select className={inp} value={agentId} onChange={e => setAgentId(Number(e.target.value))} required>
              <option value="">Selecione...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Perfil de Avaliação *</label>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum perfil cadastrado. <a href="/profiles/new" className="text-blue-600">Crie um.</a></p>
          ) : (
            <select className={inp} value={profileId} onChange={e => setProfileId(Number(e.target.value))} required>
              <option value="">Selecione...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">
              Casos de Teste * <span className="text-gray-400 font-normal">({selectedCases.size} selecionados)</span>
            </label>
            {testCases.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {selectedCases.size === testCases.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            )}
          </div>
          {testCases.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum caso de teste. <a href="/test-cases/new" className="text-blue-600">Crie um.</a></p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {testCases.map(tc => (
                <label key={tc.id} className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={selectedCases.has(tc.id)} onChange={() => toggleCase(tc.id)} className="mt-0.5 rounded" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{tc.title}</p>
                    <p className="text-xs text-gray-400 line-clamp-1">{tc.input}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Iniciando..." : "Executar avaliação"}
        </button>
      </form>
    </div>
  )
}

const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
