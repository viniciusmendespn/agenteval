"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getTestCase, updateTestCase } from "@/lib/api"

export default function EditTestCasePage() {
  const { id } = useParams<{ id: string }>()

  const [form, setForm] = useState({
    title: "", input: "", expected_output: "", context: "", tags: "",
  })
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTestCase(Number(id))
      .then(tc => setForm({
        title: tc.title,
        input: tc.input,
        expected_output: tc.expected_output ?? "",
        context: tc.context?.join("\n") ?? "",
        tags: tc.tags ?? "",
      }))
      .catch(() => setError("Caso de teste não encontrado"))
      .finally(() => setFetching(false))
  }, [id])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await updateTestCase(Number(id), {
        title: form.title,
        input: form.input,
        expected_output: form.expected_output || undefined,
        context: form.context ? form.context.split("\n").map(l => l.trim()).filter(Boolean) : undefined,
        tags: form.tags || undefined,
      })
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
          <input className={inp} value={form.title} onChange={set("title")} required />
        </Field>
        <Field label="Pergunta / Entrada" required>
          <textarea className={`${inp} h-28 resize-none`} value={form.input} onChange={set("input")} required />
        </Field>
        <Field label="Resposta esperada (opcional)">
          <textarea className={`${inp} h-24 resize-none`} value={form.expected_output} onChange={set("expected_output")} />
        </Field>
        <Field label="Contexto (opcional)" hint="Uma informação por linha">
          <textarea className={`${inp} h-24 resize-none`} value={form.context} onChange={set("context")}
            placeholder={"A empresa foi fundada em 2010.\nO produto custa R$ 99/mês."} />
        </Field>
        <Field label="Tags (opcional)" hint="Separadas por vírgula">
          <input className={inp} value={form.tags} onChange={set("tags")} placeholder="suporte, faq" />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <a href="/test-cases" className="flex-1 text-center py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancelar
          </a>
          <button type="submit" disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
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

const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
