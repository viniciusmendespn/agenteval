"use client"
import { Suspense, useEffect, useState, useCallback, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued"
import { diffChars } from "diff"
import {
  getAgentPromptVersions,
  comparePromptVersions,
  type AgentPromptVersion,
  type PromptVersionCompare,
} from "@/lib/api"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

function calcDiffPercent(a: string, b: string): number {
  if (!a && !b) return 0
  const changes = diffChars(a, b)
  const changed = changes.reduce((sum, part) => {
    return sum + (part.added || part.removed ? part.value.length : 0)
  }, 0)
  const total = Math.max(a.length, b.length)
  return total === 0 ? 0 : Math.round((changed / total) * 100)
}

function CompareContent() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [versions, setVersions] = useState<AgentPromptVersion[]>([])
  const [v1Id, setV1Id] = useState<number | null>(null)
  const [v2Id, setV2Id] = useState<number | null>(null)
  const [comparison, setComparison] = useState<PromptVersionCompare | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [splitView, setSplitView] = useState(true)

  useEffect(() => {
    getAgentPromptVersions(Number(id))
      .then(vs => {
        setVersions(vs)
        const p1 = searchParams.get("v1")
        const p2 = searchParams.get("v2")
        const parsed1 = p1 ? parseInt(p1) : vs[1]?.id ?? null
        const parsed2 = p2 ? parseInt(p2) : vs[0]?.id ?? null
        setV1Id(parsed1)
        setV2Id(parsed2)
      })
      .catch(() => setError("Erro ao carregar versões"))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadComparison = useCallback(async (a: number, b: number) => {
    if (a === b) return
    setLoading(true)
    setError(null)
    try {
      const result = await comparePromptVersions(Number(id), a, b)
      setComparison(result)
    } catch {
      setError("Erro ao comparar versões")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (v1Id && v2Id && v1Id !== v2Id) {
      loadComparison(v1Id, v2Id)
      const params = new URLSearchParams({ v1: String(v1Id), v2: String(v2Id) })
      router.replace(`/agents/${id}/prompt-versions/compare?${params}`, { scroll: false })
    }
  }, [v1Id, v2Id, loadComparison, id, router])

  function handleSwap() {
    setV1Id(v2Id)
    setV2Id(v1Id)
  }

  const vA = comparison?.version_a
  const vB = comparison?.version_b

  const diffPercent = useMemo(() => {
    if (!vA || !vB) return null
    return calcDiffPercent(vA.system_prompt, vB.system_prompt)
  }, [vA, vB])

  function diffBadgeClass(pct: number) {
    if (pct <= 20) return "bg-green-50 text-green-700 border-green-200"
    if (pct <= 60) return "bg-yellow-50 text-yellow-700 border-yellow-200"
    return "bg-red-50 text-red-700 border-red-200"
  }

  function versionLabel(v: AgentPromptVersion) {
    return `v${v.version_num}${v.label ? ` — ${v.label}` : ""}  (${new Date(v.created_at).toLocaleDateString("pt-BR")})`
  }

  return (
    <div className="max-w-6xl">
      <Breadcrumb items={[
        { label: "Agentes", href: "/agents" },
        { label: "Editar agente", href: `/agents/${id}/edit` },
        { label: "Comparar versões" },
      ]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Comparar versões do prompt</h1>

      {/* Seleção de versões */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <span className="text-xs text-gray-500 shrink-0">De</span>
          <select
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={v1Id ?? ""}
            onChange={e => setV1Id(Number(e.target.value))}
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version_num}{v.label ? ` — ${v.label}` : ""}{v.status === "active" ? " (em uso)" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSwap}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 shrink-0"
          title="Inverter"
        >
          ⇄
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-48">
          <span className="text-xs text-gray-500 shrink-0">Para</span>
          <select
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={v2Id ?? ""}
            onChange={e => setV2Id(Number(e.target.value))}
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version_num}{v.label ? ` — ${v.label}` : ""}{v.status === "active" ? " (em uso)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {diffPercent !== null && (
            <span className={`px-2.5 py-1 text-xs font-medium rounded border ${diffBadgeClass(diffPercent)}`}>
              {diffPercent}% alterado
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSplitView(true)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${splitView ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              Lado a lado
            </button>
            <button
              type="button"
              onClick={() => setSplitView(false)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${!splitView ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              Unificado
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading && (
        <div className="text-sm text-gray-400 py-8 text-center">Carregando comparação...</div>
      )}

      {!loading && comparison && vA && vB && (
        <>
          {/* Diff */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4 text-xs">
            <ReactDiffViewer
              oldValue={vA.system_prompt}
              newValue={vB.system_prompt}
              splitView={splitView}
              compareMethod={DiffMethod.WORDS}
              leftTitle={versionLabel(vA)}
              rightTitle={versionLabel(vB)}
              useDarkTheme={false}
            />
          </div>

          {/* Resumo LLM */}
          {comparison.summary ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">Resumo das alterações</p>
              <p className="text-sm text-blue-900">{comparison.summary}</p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-400 text-center">
              Resumo automático não disponível (nenhum provedor LLM configurado).
            </div>
          )}
        </>
      )}

      {!loading && v1Id === v2Id && v1Id !== null && (
        <div className="text-sm text-gray-400 py-8 text-center">
          Selecione duas versões diferentes para comparar.
        </div>
      )}
    </div>
  )
}

export default function ComparePromptVersionsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Carregando...</div>}>
      <CompareContent />
    </Suspense>
  )
}
