"use client"
import { useEffect, useRef, useState } from "react"
import { Bot, Send, RotateCcw } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getAgents, playgroundChat, type Agent } from "@/lib/api"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

type Message = { role: "user" | "agent"; text: string }

const ENV_LABELS: Record<string, string> = {
  experiment: "Experimento",
  development: "Desenvolvimento",
  staging: "Homologação",
  production: "Produção",
}

export default function PlaygroundPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sessionId, setSessionId] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  const selectedAgent = agents.find(a => a.id === selectedId) ?? null

  function handleSelectAgent(id: number) {
    setSelectedId(id)
    setSessionId(crypto.randomUUID())
    setMessages([])
    setError(null)
  }

  function handleReset() {
    setSessionId(crypto.randomUUID())
    setMessages([])
    setError(null)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !selectedId || sending) return
    setInput("")
    setError(null)
    setMessages(prev => [...prev, { role: "user", text }])
    setSending(true)
    try {
      const res = await playgroundChat(selectedId, text, sessionId)
      setMessages(prev => [...prev, { role: "agent", text: res.reply }])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao contactar o agente")
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="max-w-3xl flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <Breadcrumb items={[{ label: "Playground" }]} />

      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Playground</h1>
          <p className="text-sm text-gray-500">Converse diretamente com um agente configurado.</p>
        </div>
      </div>

      {/* Seletor de agente */}
      <div className="flame-panel p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="flame-field-label mb-1">Agente</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            value={selectedId ?? ""}
            onChange={e => handleSelectAgent(Number(e.target.value))}
          >
            <option value="">Selecione um agente...</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {selectedAgent && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 pt-5">
            {selectedAgent.model_name && (
              <span className="flame-chip">{selectedAgent.model_name}</span>
            )}
            {selectedAgent.environment && (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {ENV_LABELS[selectedAgent.environment] ?? selectedAgent.environment}
              </span>
            )}
            <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
              {selectedAgent.connection_type.toUpperCase()}
            </span>
          </div>
        )}

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flame-button-secondary min-h-8 px-3 text-xs self-end ml-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nova conversa
          </button>
        )}
      </div>

      {/* Área de mensagens */}
      <div className="flame-panel flex-1 overflow-y-auto p-4 mb-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-12 gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <MessageSquareIcon className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-sm">
              {selectedAgent
                ? `Envie uma mensagem para conversar com ${selectedAgent.name}.`
                : "Selecione um agente para começar."}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "agent" && (
              <div className="h-7 w-7 shrink-0 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                <Bot className="h-4 w-4 text-gray-500" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-red-600 text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.role === "user" ? msg.text : (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-1 prose-code:text-xs prose-pre:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="h-7 w-7 shrink-0 rounded-full bg-gray-100 flex items-center justify-center">
              <Bot className="h-4 w-4 text-gray-500" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flame-panel p-3 flex gap-2 items-center">
        <input
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-400"
          placeholder={selectedAgent ? "Digite sua mensagem..." : "Selecione um agente primeiro..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!selectedId || sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!selectedId || !input.trim() || sending}
          className="flame-button min-h-9 min-w-9 px-3 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function MessageSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  )
}
