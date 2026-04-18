"use client"
import { useState } from "react"
import { createTestCase, type Turn } from "@/lib/api"
import { showAfterNav } from "@/components/PendingToast"
import { LoadingButton } from "@/components/ui/LoadingButton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

type TurnItem = { input: string; expected_output: string }
type VarItem = { key: string; value: string }

export default function NewTestCasePage() {
  const [title, setTitle] = useState("")
  const [context, setContext] = useState("")
  const [tags, setTags] = useState("")

  // Single-turn fields
  const [input, setInput] = useState("")
  const [expectedOutput, setExpectedOutput] = useState("")

  // Multi-turn state
  const [isMultiTurn, setIsMultiTurn] = useState(false)
  const [turns, setTurns] = useState<TurnItem[]>([{ input: "", expected_output: "" }])

  // Variables (placeholders)
  const [variables, setVariables] = useState<VarItem[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addVar() { setVariables(prev => [...prev, { key: "", value: "" }]) }
  function removeVar(i: number) { setVariables(prev => prev.filter((_, idx) => idx !== i)) }
  function updateVar(i: number, field: keyof VarItem, value: string) {
    setVariables(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v))
  }
  function buildVariablesDict(): Record<string, string> | undefined {
    const entries = variables.filter(v => v.key.trim())
    if (!entries.length) return undefined
    return Object.fromEntries(entries.map(v => [v.key.trim(), v.value]))
  }

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
    setLoading(true)
    setError(null)
    try {
      const contextArr = context
        ? context.split("\n").map(l => l.trim()).filter(Boolean)
        : undefined

      const varsDict = buildVariablesDict()
      if (isMultiTurn) {
        const turnsPayload: Turn[] = turns.map(t => ({
          input: t.input,
          expected_output: t.expected_output || undefined,
        }))
        await createTestCase({
          title,
          input: turns[0]?.input || "",
          expected_output: turns[turns.length - 1]?.expected_output || undefined,
          context: contextArr,
          tags: tags || undefined,
          turns: turnsPayload,
          variables: varsDict,
        })
      } else {
        await createTestCase({
          title,
          input,
          expected_output: expectedOutput || undefined,
          context: contextArr,
          tags: tags || undefined,
          variables: varsDict,
        })
      }
      showAfterNav("Caso de teste criado")
      window.location.href = "/test-cases"
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <Breadcrumb items={[{ label: "Casos de Teste", href: "/test-cases" }, { label: "Novo caso de teste" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Caso de Teste</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <Field label="Título" required>
          <input className={inp} value={title} onChange={e => setTitle(e.target.value)} required />
        </Field>

        {/* Mode toggle */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 mr-1">Modo:</span>
            <button type="button" onClick={() => setIsMultiTurn(false)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${!isMultiTurn ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Turno único
            </button>
            <button type="button" onClick={() => setIsMultiTurn(true)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${isMultiTurn ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Multi-turno
            </button>
          </div>
          <p className="text-xs text-gray-400 min-h-[1rem]">
            {isMultiTurn ? "O agente recebe um sessionId compartilhado em todos os turnos." : ""}
          </p>
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

        <Field label="Contexto (opcional)" hint="Uma informação por linha — usado para detectar alucinação">
          <textarea className={`${inp} h-24 resize-none`} value={context} onChange={e => setContext(e.target.value)}
            placeholder={"A empresa foi fundada em 2010.\nO produto custa R$ 99/mês."} />
        </Field>
        <Field label="Tags (opcional)" hint="Separadas por vírgula">
          <input className={inp} value={tags} onChange={e => setTags(e.target.value)} placeholder="suporte, faq" />
        </Field>

        {/* Variáveis */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Variáveis <span className="font-normal text-gray-400">(opcional)</span></label>
            <button type="button" onClick={addVar}
              className="text-xs px-2.5 py-1 border border-dashed border-gray-300 rounded hover:border-red-400 text-gray-500">
              + Adicionar variável
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Use <code className="bg-gray-100 px-1 rounded">{"{{chave}}"}</code> no body do agente para substituir pelo valor definido aqui.
          </p>
          {variables.length > 0 && (
            <div className="space-y-2">
              {variables.map((v, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={`${inp} flex-1`} value={v.key} onChange={e => updateVar(i, "key", e.target.value)}
                    placeholder="chave" />
                  <span className="text-gray-400 text-sm">=</span>
                  <input className={`${inp} flex-1`} value={v.value} onChange={e => updateVar(i, "value", e.target.value)}
                    placeholder="valor" />
                  <button type="button" onClick={() => removeVar(i)}
                    className="text-gray-400 hover:text-red-500 text-xs shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <LoadingButton
          type="submit"
          isLoading={loading}
          loadingText="Salvando caso de teste…"
          className="w-full"
        >
          Salvar caso de teste
        </LoadingButton>
      </form>
    </div>
  )
}

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
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
