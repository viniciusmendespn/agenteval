"use client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { User, Bot } from "lucide-react"

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700
      prose-headings:font-semibold prose-headings:text-gray-900
      prose-a:text-blue-600 prose-a:underline
      prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
      prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
      prose-table:text-sm prose-th:bg-gray-50 prose-th:font-semibold
      prose-strong:text-gray-900 prose-li:my-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

export default function ConversationThread({
  turns,
  lastExpected,
}: {
  turns: Array<{ input: string; output: string }>
  lastExpected?: string | null
}) {
  const multiTurn = turns.length > 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversa</h2>
        {multiTurn && (
          <span className="text-xs text-gray-400">{turns.length} turnos</span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {turns.map((turn, i) => {
          const isLast = i === turns.length - 1
          return (
            <div key={i} className={`px-5 py-4 space-y-3 ${isLast && multiTurn ? "bg-blue-50/30" : ""}`}>
              {/* Header de turno — só exibe em multi-turn */}
              {multiTurn && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Turno {i + 1}
                  </span>
                  {isLast && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                      avaliado
                    </span>
                  )}
                </div>
              )}

              {/* Mensagem do usuário */}
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div className="flex-1 bg-gray-100 rounded-xl rounded-tl-sm px-4 py-2.5">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{turn.input}</p>
                </div>
              </div>

              {/* Resposta do agente */}
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-red-600" />
                </div>
                <div className="flex-1 bg-white border border-gray-200 rounded-xl rounded-tl-sm px-4 py-2.5">
                  {turn.output
                    ? <MarkdownBlock content={turn.output} />
                    : <p className="text-sm text-gray-400 italic">Sem resposta registrada</p>
                  }
                </div>
              </div>

              {/* Saída esperada no último turno */}
              {isLast && lastExpected && (
                <div className="ml-9 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-amber-700 mb-0.5">Saída esperada</p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{lastExpected}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
