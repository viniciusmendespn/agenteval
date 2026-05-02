"use client"

import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { MessageSquare, X, Send, Bot, User, Loader2, CheckSquare, Square, Plus, Check, ClipboardList, Play } from "lucide-react"
import { toast } from "sonner"
import { API, workspaceHeaders, createTestCase, createSimulation } from "@/lib/api"

type Message = {
  role: "user" | "assistant"
  content: string
  timestamp?: Date
  tokens?: number
}

type TestCaseSuggestion = {
  title: string
  type?: string
  input: string
  expected_output?: string
  context?: string[]
  tags?: string
  turns?: { input: string; expected_output?: string }[] | null
}

type SuggestionsBlock = {
  agent_id: number
  cases: TestCaseSuggestion[]
}

type AgentSelectorBlock = {
  agents: { id: number; name: string }[]
}

type ModeSelectorBlock = {
  agent_id: number
  agent_name: string
}

type SimulationSuggestion = {
  title: string
  persona: string
  scenario: string
  business_rule: string
  instructions: string
  tags?: string
}

type SimulationSuggestionsBlock = {
  agent_id: number
  cases: SimulationSuggestion[]
}

const TYPE_LABELS: Record<string, string> = {
  happy_path: "Fluxo feliz",
  edge_case: "Caso extremo",
  scope_escape: "Fuga de escopo",
  ambiguity: "Ambiguidade",
  error: "Erro",
}

const TYPE_COLORS: Record<string, string> = {
  happy_path: "bg-green-50 text-green-700 border-green-200",
  edge_case: "bg-amber-50 text-amber-700 border-amber-200",
  scope_escape: "bg-red-50 text-red-700 border-red-200",
  ambiguity: "bg-purple-50 text-purple-700 border-purple-200",
  error: "bg-gray-50 text-gray-600 border-gray-200",
}

type ParsedContent =
  | { type: "suggestions"; before: string; block: SuggestionsBlock; after: string }
  | { type: "simulation_suggestions"; before: string; block: SimulationSuggestionsBlock; after: string }
  | { type: "agent_selector"; block: AgentSelectorBlock }
  | { type: "mode_selector"; block: ModeSelectorBlock }
  | { type: "text"; content: string }

function parseContent(content: string): ParsedContent {
  const match = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return { type: "text", content }
  try {
    const parsed = JSON.parse(match[1])
    if (parsed.__type === "agent_selector" && Array.isArray(parsed.agents)) {
      return { type: "agent_selector", block: { agents: parsed.agents } }
    }
    if (parsed.__type === "mode_selector" && parsed.agent_id) {
      return { type: "mode_selector", block: { agent_id: parsed.agent_id, agent_name: parsed.agent_name } }
    }
    if (parsed.__type === "test_case_suggestions" && Array.isArray(parsed.cases)) {
      const idx = content.indexOf("```json")
      const end = content.indexOf("```", idx + 7) + 3
      return {
        type: "suggestions",
        before: content.slice(0, idx).trim(),
        block: { agent_id: parsed.agent_id, cases: parsed.cases },
        after: content.slice(end).trim(),
      }
    }
    if (parsed.__type === "simulation_suggestions" && Array.isArray(parsed.cases)) {
      const idx = content.indexOf("```json")
      const end = content.indexOf("```", idx + 7) + 3
      return {
        type: "simulation_suggestions",
        before: content.slice(0, idx).trim(),
        block: { agent_id: parsed.agent_id, cases: parsed.cases },
        after: content.slice(end).trim(),
      }
    }
  } catch {
    // not a special block
  }
  return { type: "text", content }
}

function AgentSelectorCards({ block, onSelect }: { block: AgentSelectorBlock; onSelect: (agent: { id: number; name: string }) => void }) {
  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Selecione o agente
      </p>
      {block.agents.map(agent => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent)}
          className="w-full text-left rounded-lg border border-gray-200 bg-white hover:border-[var(--santander-red)] hover:bg-red-50/30 px-3 py-2 text-sm font-medium text-gray-800 transition-colors"
        >
          {agent.name}
        </button>
      ))}
    </div>
  )
}

function SuggestionCards({ block }: { block: SuggestionsBlock }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(block.cases.map((_, i) => i)))
  const [created, setCreated] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleCreate(indices: number[]) {
    const toCreate = indices.filter(i => !created.has(i))
    if (!toCreate.length) return
    setCreating(true)
    setErrorMsg(null)
    const failed: { index: number; reason: string }[] = []
    let successCount = 0
    for (const i of toCreate) {
      const c = block.cases[i]
      try {
        const turns = c.turns && c.turns.length > 0 ? c.turns : undefined
        await createTestCase({
          title: c.title,
          input: turns ? turns[0].input : c.input,
          expected_output: c.expected_output || undefined,
          context: c.context && c.context.length > 0 ? c.context : undefined,
          tags: c.tags || undefined,
          turns: turns,
        })
        setCreated(prev => new Set([...prev, i]))
        successCount++
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.error(`[SuggestionCards] falha ao criar caso "${c.title}":`, reason)
        failed.push({ index: i, reason })
      }
    }
    setCreating(false)
    if (successCount > 0 && failed.length === 0) {
      toast.success(`${successCount} caso${successCount > 1 ? "s" : ""} de teste criado${successCount > 1 ? "s" : ""} com sucesso`)
      setTimeout(() => { window.location.href = "/test-cases" }, 1200)
    } else if (successCount > 0 && failed.length > 0) {
      toast.success(`${successCount} criado${successCount > 1 ? "s" : ""}`)
      setErrorMsg(`${failed.length} caso(s) falharam: ${failed.map(f => f.reason).join("; ")}`)
    } else {
      const reason = failed[0]?.reason ?? "erro desconhecido"
      setErrorMsg(`Falha ao criar: ${reason}`)
      toast.error("Erro ao criar casos de teste")
    }
  }

  const pendingSelected = [...selected].filter(i => !created.has(i))
  const allIndices = block.cases.map((_, i) => i)
  const pendingAll = allIndices.filter(i => !created.has(i))

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {block.cases.length} sugestões · selecione as que deseja criar
      </p>

      {block.cases.map((c, i) => {
        const isSelected = selected.has(i)
        const isCreated = created.has(i)
        const isMultiTurn = c.turns && c.turns.length > 0
        const typeColor = TYPE_COLORS[c.type ?? ""] || "bg-gray-50 text-gray-600 border-gray-200"
        const typeLabel = TYPE_LABELS[c.type ?? ""] || c.type

        return (
          <div
            key={i}
            onClick={() => !isCreated && toggle(i)}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors text-xs ${
              isCreated
                ? "border-green-200 bg-green-50 cursor-default"
                : isSelected
                ? "border-[var(--santander-red)] bg-red-50/30"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                {isCreated
                  ? <Check size={14} className="text-green-600" />
                  : isSelected
                  ? <CheckSquare size={14} className="text-[var(--santander-red)]" />
                  : <Square size={14} className="text-gray-300" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="font-semibold text-gray-800 leading-snug">{c.title}</span>
                  {isCreated && <span className="text-[10px] text-green-600 font-medium">Criado ✓</span>}
                </div>
                <div className="flex items-center gap-1 flex-wrap mb-1">
                  {typeLabel && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor}`}>
                      {typeLabel}
                    </span>
                  )}
                  {isMultiTurn && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 font-medium">
                      multi-turn · {c.turns!.length} turnos
                    </span>
                  )}
                  {c.tags && (
                    <span className="text-[10px] text-gray-400">{c.tags}</span>
                  )}
                </div>
                <p className="text-gray-500 truncate">
                  <span className="text-gray-400">Entrada: </span>
                  {isMultiTurn ? c.turns![0].input : c.input}
                </p>
                {c.expected_output && (
                  <p className="text-gray-400 truncate mt-0.5">
                    <span>Esperado: </span>{c.expected_output}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {errorMsg && <p className="text-[11px] text-red-500 pt-1">{errorMsg}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleCreate(pendingSelected)}
          disabled={creating || pendingSelected.length === 0}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg bg-[var(--santander-red)] text-white hover:bg-[var(--santander-red-dark)] disabled:opacity-40 transition-colors"
        >
          <Plus size={12} />
          {creating ? "Criando..." : `Criar selecionados (${pendingSelected.length})`}
        </button>
        {pendingAll.length > pendingSelected.length && (
          <button
            onClick={() => handleCreate(pendingAll)}
            disabled={creating || pendingAll.length === 0}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Criar todos ({pendingAll.length})
          </button>
        )}
      </div>
    </div>
  )
}

function ModeSelectorCards({ block, onSelect }: {
  block: ModeSelectorBlock
  onSelect: (mode: "test_cases" | "simulations") => void
}) {
  return (
    <div className="mt-1 space-y-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
        O que criar para <strong>{block.agent_name}</strong>?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSelect("test_cases")}
          className="rounded-lg border border-gray-200 bg-white hover:border-[var(--santander-red)] hover:bg-red-50/30 p-3 text-left transition-colors"
        >
          <ClipboardList size={16} className="text-[var(--santander-red)] mb-1.5" />
          <p className="font-semibold text-xs text-gray-800">Casos de Teste</p>
          <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
            Cenários pontuais com entrada e saída esperada, avaliados por métricas.
          </p>
        </button>
        <button
          onClick={() => onSelect("simulations")}
          className="rounded-lg border border-gray-200 bg-white hover:border-[var(--santander-red)] hover:bg-red-50/30 p-3 text-left transition-colors"
        >
          <Play size={16} className="text-[var(--santander-red)] mb-1.5" />
          <p className="font-semibold text-xs text-gray-800">Simulações</p>
          <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
            Uma IA age como usuário real e conversa com o agente autonomamente.
          </p>
        </button>
      </div>
    </div>
  )
}

function SimulationSuggestionCards({ block }: { block: SimulationSuggestionsBlock }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(block.cases.map((_, i) => i)))
  const [created, setCreated] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleCreate(indices: number[]) {
    const toCreate = indices.filter(i => !created.has(i))
    if (!toCreate.length) return
    setCreating(true)
    setErrorMsg(null)
    const failed: { index: number; reason: string }[] = []
    let successCount = 0
    for (const i of toCreate) {
      const c = block.cases[i]
      try {
        await createSimulation({
          agent_id: block.agent_id,
          name: c.title,
          instructions: c.instructions,
          max_messages: 10,
        })
        setCreated(prev => new Set([...prev, i]))
        successCount++
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.error(`[SimulationSuggestionCards] falha ao criar "${c.title}":`, reason)
        failed.push({ index: i, reason })
      }
    }
    setCreating(false)
    if (successCount > 0 && failed.length === 0) {
      toast.success(`${successCount} simulação${successCount > 1 ? "ões" : ""} criada${successCount > 1 ? "s" : ""} com sucesso`)
      setTimeout(() => { window.location.href = "/simulations" }, 1200)
    } else if (successCount > 0 && failed.length > 0) {
      toast.success(`${successCount} criada${successCount > 1 ? "s" : ""}`)
      setErrorMsg(`${failed.length} falharam: ${failed.map(f => f.reason).join("; ")}`)
    } else {
      const reason = failed[0]?.reason ?? "erro desconhecido"
      setErrorMsg(`Falha ao criar: ${reason}`)
      toast.error("Erro ao criar simulações")
    }
  }

  const pendingSelected = [...selected].filter(i => !created.has(i))
  const allIndices = block.cases.map((_, i) => i)
  const pendingAll = allIndices.filter(i => !created.has(i))

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {block.cases.length} cenários · selecione os que deseja criar
      </p>

      {block.cases.map((c, i) => {
        const isSelected = selected.has(i)
        const isCreated = created.has(i)

        return (
          <div
            key={i}
            onClick={() => !isCreated && toggle(i)}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors text-xs ${
              isCreated
                ? "border-green-200 bg-green-50 cursor-default"
                : isSelected
                ? "border-[var(--santander-red)] bg-red-50/30"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                {isCreated
                  ? <Check size={14} className="text-green-600" />
                  : isSelected
                  ? <CheckSquare size={14} className="text-[var(--santander-red)]" />
                  : <Square size={14} className="text-gray-300" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="font-semibold text-gray-800 leading-snug">{c.title}</span>
                  {isCreated && <span className="text-[10px] text-green-600 font-medium">Criada ✓</span>}
                </div>
                <p className="text-[10px] text-gray-500 mb-0.5">
                  <span className="font-medium text-gray-600">Persona: </span>{c.persona}
                </p>
                <p className="text-[10px] text-gray-500 mb-0.5 truncate">
                  <span className="font-medium text-gray-600">Regra: </span>{c.business_rule}
                </p>
                {c.tags && (
                  <p className="text-[10px] text-gray-400">{c.tags}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {errorMsg && <p className="text-[11px] text-red-500 pt-1">{errorMsg}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleCreate(pendingSelected)}
          disabled={creating || pendingSelected.length === 0}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg bg-[var(--santander-red)] text-white hover:bg-[var(--santander-red-dark)] disabled:opacity-40 transition-colors"
        >
          <Plus size={12} />
          {creating ? "Criando..." : `Criar selecionados (${pendingSelected.length})`}
        </button>
        {pendingAll.length > pendingSelected.length && (
          <button
            onClick={() => handleCreate(pendingAll)}
            disabled={creating || pendingAll.length === 0}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Criar todos ({pendingAll.length})
          </button>
        )}
      </div>
    </div>
  )
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Posso criar **casos de teste** ou **simulações** para seus agentes.\n\nDiga **\"quero testar um agente\"** para começar.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleOpenChat() { setOpen(true) }
    window.addEventListener("open-floatingchat", handleOpenChat)
    return () => window.removeEventListener("open-floatingchat", handleOpenChat)
  }, [])

  const LOADING_STEPS = [
    "Processando...",
    "Consultando o agente...",
    "Gerando cenários com IA...",
    "Estruturando sugestões...",
    "Quase pronto...",
  ]

  function startLoadingSteps() {
    let step = 0
    setLoadingStatus(LOADING_STEPS[0])
    function advance() {
      step = Math.min(step + 1, LOADING_STEPS.length - 1)
      setLoadingStatus(LOADING_STEPS[step])
      if (step < LOADING_STEPS.length - 1) {
        loadingTimerRef.current = setTimeout(advance, 4000)
      }
    }
    loadingTimerRef.current = setTimeout(advance, 4000)
  }

  function stopLoadingSteps() {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
    setLoadingStatus("")
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() }
    const newMessages: Message[] = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)
    startLoadingSteps()

    try {
      const res = await fetch(`${API}/chat/`, {
        method: "POST",
        headers: workspaceHeaders(),
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, timestamp: new Date(), tokens: data.tokens ?? undefined },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Erro ao conectar com o assistente: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      stopLoadingSteps()
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleAgentSelect(agent: { id: number; name: string }) {
    const text = `Agente selecionado: ${agent.name} (ID: ${agent.id})`
    setInput("")
    const userMsg: Message = { role: "user", content: text, timestamp: new Date() }
    const newMessages: Message[] = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)
    startLoadingSteps()
    fetch(`${API}/chat/`, {
      method: "POST",
      headers: workspaceHeaders(),
      body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
    })
      .then(res => res.ok ? res.json() : res.text().then(t => { throw new Error(t) }))
      .then(data => setMessages(prev => [...prev, { role: "assistant", content: data.reply, timestamp: new Date(), tokens: data.tokens ?? undefined }]))
      .catch(err => setMessages(prev => [...prev, { role: "assistant", content: `Erro: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date() }]))
      .finally(() => { stopLoadingSteps(); setLoading(false) })
  }

  function handleModeSelect(mode: "test_cases" | "simulations", agentId: number, agentName: string) {
    // Texto exibido ao usuário no chat (humanizado)
    const displayText = mode === "test_cases"
      ? `Criar casos de teste para **${agentName}**`
      : `Criar simulações para **${agentName}**`
    // Texto enviado ao backend (detectável pelo fast path — sem acento em "simulacoes" para evitar encoding)
    const apiText = mode === "test_cases"
      ? `Criar casos de teste para ${agentName} (ID: ${agentId})`
      : `Criar simulacoes para ${agentName} (ID: ${agentId})`

    const userMsg: Message = { role: "user", content: displayText, timestamp: new Date() }
    // O histórico enviado ao backend usa apiText para o fast path detectar corretamente
    const apiMessages = [...messages, { role: "user" as const, content: apiText }]
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    startLoadingSteps()
    fetch(`${API}/chat/`, {
      method: "POST",
      headers: workspaceHeaders(),
      body: JSON.stringify({ messages: apiMessages.map(m => ({ role: m.role, content: m.content })) }),
    })
      .then(res => res.ok ? res.json() : res.text().then(t => { throw new Error(t) }))
      .then(data => setMessages(prev => [...prev, { role: "assistant", content: data.reply, timestamp: new Date(), tokens: data.tokens ?? undefined }]))
      .catch(err => setMessages(prev => [...prev, { role: "assistant", content: `Erro: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date() }]))
      .finally(() => { stopLoadingSteps(); setLoading(false) })
  }

  function renderMarkdown(text: string) {
    return (
      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-1 prose-code:text-xs">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-[var(--flame-teal)] underline underline-offset-2 hover:text-[var(--flame-teal-dark)] font-medium"
                {...(href?.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  function renderAssistantMessage(content: string) {
    const parsed = parseContent(content)
    if (parsed.type === "agent_selector") {
      return <AgentSelectorCards block={parsed.block} onSelect={handleAgentSelect} />
    }
    if (parsed.type === "mode_selector") {
      return (
        <ModeSelectorCards
          block={parsed.block}
          onSelect={(mode) => handleModeSelect(mode, parsed.block.agent_id, parsed.block.agent_name)}
        />
      )
    }
    if (parsed.type === "suggestions") {
      return (
        <>
          {parsed.before && renderMarkdown(parsed.before)}
          <SuggestionCards block={parsed.block} />
          {parsed.after && <div className="mt-2">{renderMarkdown(parsed.after)}</div>}
        </>
      )
    }
    if (parsed.type === "simulation_suggestions") {
      return (
        <>
          {parsed.before && renderMarkdown(parsed.before)}
          <SimulationSuggestionCards block={parsed.block} />
          {parsed.after && <div className="mt-2">{renderMarkdown(parsed.after)}</div>}
        </>
      )
    }
    return renderMarkdown(content)
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[520px] flex flex-col bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden" style={{ height: "calc(100vh - 6rem)", maxHeight: "780px" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--santander-red)] text-white shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <span className="font-semibold text-sm">Assistente de QA</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="hover:bg-[var(--santander-red-dark)] rounded-full p-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-0.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`flex gap-2 min-w-0 w-full ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      m.role === "user"
                        ? "bg-white border border-red-200 text-red-600"
                        : "bg-white border border-gray-200 text-[var(--flame-teal)]"
                    }`}
                  >
                    {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={`min-w-0 rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "max-w-[85%] bg-[var(--santander-red)] text-white rounded-tr-sm"
                        : "flex-1 bg-gray-100 text-gray-800 rounded-tl-sm"
                    }`}
                  >
                    {m.role === "assistant"
                      ? renderAssistantMessage(m.content)
                      : <span className="whitespace-pre-wrap">{m.content}</span>
                    }
                  </div>
                </div>
                {(m.timestamp || m.tokens) && (
                  <div className={`flex items-center gap-2 px-9 text-[10px] text-gray-400 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {m.timestamp && (
                      <span>{m.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {m.tokens && m.tokens > 0 && (
                      <span>{m.tokens.toLocaleString("pt-BR")} tokens</span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 min-w-0 w-full">
                <div className="shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[var(--flame-teal)]">
                  <Bot size={14} />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-2 min-w-0">
                  <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />
                  {loadingStatus && (
                    <span className="text-xs text-gray-500 truncate">{loadingStatus}</span>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 px-3 py-2 flex items-end gap-2 bg-white">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Digite sua mensagem… (Enter para enviar)"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none disabled:opacity-50 max-h-28 overflow-y-auto"
              style={{ minHeight: "38px" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = Math.min(el.scrollHeight, 112) + "px"
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="shrink-0 w-9 h-9 rounded-lg bg-[var(--santander-red)] text-white flex items-center justify-center hover:bg-[var(--santander-red-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[var(--santander-red)] text-white shadow-lg hover:bg-[var(--santander-red-dark)] active:scale-95 transition-all flex items-center justify-center"
        aria-label="Abrir assistente"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </>
  )
}
