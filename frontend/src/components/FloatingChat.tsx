"use client"

import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { MessageSquare, X, Send, Bot, User, Loader2 } from "lucide-react"
import { API, workspaceHeaders } from "@/lib/api"

type Message = {
  role: "user" | "assistant"
  content: string
  timestamp?: Date
  tokens?: number
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou o assistente do Santander AgentEval. Posso ajudar você a criar agentes, perfis de avaliação, casos de teste e iniciar execuções. O que você precisa?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Painel de chat */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[380px] max-h-[600px] flex flex-col bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--santander-red)] text-white shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <span className="font-semibold text-sm">Assistente Santander AgentEval</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="hover:bg-[var(--santander-red-dark)] rounded-full p-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-0.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      m.role === "user" ? "bg-white border border-red-200 text-red-600" : "bg-white border border-gray-200 text-[var(--flame-teal)]"
                    }`}
                  >
                    {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-[var(--santander-red)] text-white rounded-tr-sm"
                        : "bg-gray-100 text-gray-800 rounded-tl-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
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
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
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
              <div className="flex gap-2">
                <div className="shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[var(--flame-teal)]">
                  <Bot size={14} />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
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
