"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Copy, Check, Sparkles } from "lucide-react"
import { getAgent, updateAgent, optimizeAgentPrompt, type Agent } from "@/lib/api"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

type OptimizeResult = {
  current_prompt: string
  suggested_prompt: string
  reasoning: string
  failed_cases_analyzed: number
}

export default function OptimizePromptPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function run() {
      try {
        const a = await getAgent(Number(id))
        setAgent(a)
        const res = await optimizeAgentPrompt(Number(id))
        setResult(res)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [id])

  async function handleApply() {
    if (!agent || !result) return
    setApplying(true)
    try {
      await updateAgent(agent.id, { ...agent, system_prompt: result.suggested_prompt })
      router.push("/agents")
    } catch (e: any) {
      setError(e.message)
      setApplying(false)
    }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.suggested_prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ label: "Agentes", href: "/agents" }, { label: "Otimização de System Prompt" }]} />
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">Otimização de System Prompt</h1>
        </div>
        {agent && <p className="text-sm text-gray-500 mt-0.5">{agent.name}</p>}
      </div>

      {loading && (
        <div className="flame-panel p-10 text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-1.5 w-48 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full animate-pulse w-full" />
            </div>
          </div>
          <p className="text-sm text-gray-500">Analisando execuções e gerando sugestão...</p>
        </div>
      )}

      {error && (
        <div className="flame-panel p-6 text-center space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <a href="/agents" className="flame-button-secondary inline-block">Voltar</a>
        </div>
      )}

      {result && agent && (
        <div className="space-y-4">
          <div className="flame-panel p-5">
            <p className="text-xs font-semibold text-gray-600 mb-1">Análise</p>
            <p className="text-sm text-gray-700">{result.reasoning}</p>
            <p className="text-xs text-gray-400 mt-2">{result.failed_cases_analyzed} caso(s) com falha analisado(s)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flame-panel p-5 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prompt atual</p>
              <pre className="text-xs font-mono bg-gray-50 rounded-md p-4 whitespace-pre-wrap text-gray-700 min-h-[240px] border border-gray-200">
                {result.current_prompt}
              </pre>
            </div>
            <div className="flame-panel p-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Sugestão otimizada</p>
                <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                  {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <pre className="text-xs font-mono bg-green-50 rounded-md p-4 whitespace-pre-wrap text-gray-700 min-h-[240px] border border-green-200">
                {result.suggested_prompt}
              </pre>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <a href="/agents" className="flame-button-secondary">Descartar</a>
            <button onClick={handleApply} disabled={applying} className="flame-button disabled:opacity-50">
              {applying ? "Aplicando..." : "Aplicar sugestão"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
