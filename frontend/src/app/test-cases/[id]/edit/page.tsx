"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getTestCase, updateTestCase, type Turn } from "@/lib/api"

type TurnItem = { input: string; expected_output: string }

export default function EditTestCasePage() {
  const { id } = useParams<{ id: string }>()

  const [title, setTitle] = useState("")
  const [context, setContext] = useState("")
  const [tags, setTags] = useState("")

  const [input, setInput] = useState("")
  const [expectedOutput, setExpectedOutput] = useState("")

  const [isMultiTurn, setIsMultiTurn] = useState(false)
  const [turns, setTurns] = useState<TurnItem[]>([{ input: "", expected_output: "" }])

  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTestCase(Number(id))
      .then(tc => {
        setTitle(tc.title)
        setContext(tc.context?.join("\n") ?? "")
        setTags(tc.tags ?? "")
        if (tc.turns && tc.turns.length > 0) {
          setIsMultiTurn(true)
          setTurns(tc.turns.map(t => ({ input: t.input, expected_output: t.expected_output ?? "" })))
        } else {
          setInput(tc.input)
          setExpectedOutput(tc.expected_output ?? "")
        }
      })
      .catch(() => setError("Caso de teste não encontrado"))
      .finally(() => setFetching(false))
  }, [id])

  function updateTurn(i: number, field: keyof TurnItem, value: string) {
    setTurns(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  function addTurn() {
    setTurns(prev => [...prev, { input: "", expected_output: "" }])
  }

  function removeTurn(i: number) {
    setTurns(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const contextArr = context
        ? context.split("\n").map(l => l.trim()).filter(Boolean)
        : undefined

      if (isMultiTurn) {
        const turnsPayload: Turn[] = turns.map(t => ({
          input: t.input,
          expected_output: t.expected_output || undefined,
        }))
        await updateTestCase(Number(id), {
          title,
          input: turns[0]?.input || "",
          expected_output: turns[turns.length - 1]?.expected_output || undefined,
          context: contextArr,
          tags: tags || undefined,
          turns: turnsPayload,
        })
      } else {
        await updateTestCase(Number(id), {
          title,
          input,
          expected_output: expectedOutput || undefined,
          context: contextArr,
          tags: tags || undefined,
          turns: undefined,
        })
      }
      window.location.href = "/test-cases"
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  if (fetching) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/test-cases" className="text-gray-400 hover:text-gray-600 text-sm">← Casos de Teste</a>
        <h1 className="text-2xl font-bold text-gray-900">Editar Caso de Teste</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <Field label="Título" required>
          <input className={inp} value={title} onChange={e => setTitle(e.target.value)} required />
        </Field>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm font-medium text-gray-700 mr-1">Modo:</span>
          <button type="button" onClick={() => setIsMultiTurn(false)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${!isMultiTurn ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
            Turno único
          </button>
          <button type="button" onClick={() => setIsMultiTurn(true)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${isMultiTurn ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
            Multi-turno
          </button>
          {isMultiTurn && (
            <span className="text-xs text-gray-400 ml-1">O agente recebe um sessionId compartilhado em todos os turnos</span>
          )}
        </div>

        {/* Single-turn */}
        {!isMultiTurn && (
          <>
            <Field label="Pergunta / Entrada" required>
              <textarea className={`${inp} h-28 resize-none`} value={input}
                onChange={e => setInput(e.target.value)} required />
            </Field>
            <Field label="Resposta esperada (opcional)">
              <textarea className={`${inp} h-24 resize-none`} value={expectedOutput}
                onChange={e => setExpectedOutput(e.target.value)} />
            </Field>
          </>
        )}

        {/* Multi-turn */}
        {isMultiTurn && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Turnos da conversa</p>
              <button type="button" onClick={addTurn}
                className="text-xs px-2.5 py-1 border border-dashed border-gray-300 rounded hover:border-red-400 text-gray-500">
                + Adicionar turno
              </button>
            </div>
            {turns.map((turn, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Turno {i + 1}</span>
                  {turns.length > 1 && (
                    <button type="button" onClick={() => removeTurn(i)}
                      className="text-xs text-gray-400 hover:text-red-500">Remover</button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem do usuário *</label>
                  <textarea className={`${inp} h-20 resize-none`} value={turn.input}
                    onChange={e => updateTurn(i, "input", e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Resposta esperada{i === turns.length - 1 ? " (avaliada)" : " (opcional)"}
                  </label>
                  <textarea className={`${inp} h-16 resize-none`} value={turn.expected_output}
                    onChange={e => updateTurn(i, "expected_output", e.target.value)} />
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">
              A avaliação usa apenas o último turno como sinal de qualidade. Os anteriores estabelecem o contexto da conversa.
            </p>
          </div>
        )}

        <Field label="Contexto (opcional)" hint="Uma informação por linha">
          <textarea className={`${inp} h-24 resize-none`} value={context} onChange={e => setContext(e.target.value)}
            placeholder={"A empresa foi fundada em 2010.\nO produto custa R$ 99/mês."} />
        </Field>
        <Field label="Tags (opcional)" hint="Separadas por vírgula">
          <input className={inp} value={tags} onChange={e => setTags(e.target.value)} placeholder="suporte, faq" />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <a href="/test-cases" className="flex-1 text-center py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancelar
          </a>
          <button type="submit" disabled={loading}
            className="flex-1 flame-button disabled:opacity-50">
            {loading ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children, required, hint }: {
  label: string; children: React.ReactNode; required?: boolean; hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
