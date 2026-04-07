"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createTestCase } from "@/lib/api"

export default function NewTestCasePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: "", input: "", expected_output: "", context: "", tags: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const context = form.context
        ? form.context.split("\n").map((l) => l.trim()).filter(Boolean)
        : undefined
      await createTestCase({
        title: form.title,
        input: form.input,
        expected_output: form.expected_output || undefined,
        context,
        tags: form.tags || undefined,
      })
      window.location.href = "/test-cases"
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Caso de Teste</h1>
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
        <Field label="Contexto (opcional)" hint="Uma informação por linha — usado para detectar alucinação">
          <textarea className={`${inp} h-24 resize-none`} value={form.context} onChange={set("context")}
            placeholder={"A empresa foi fundada em 2010.\nO produto custa R$ 99/mês."} />
        </Field>
        <Field label="Tags (opcional)" hint="Separadas por vírgula">
          <input className={inp} value={form.tags} onChange={set("tags")} placeholder="suporte, faq" />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Salvando..." : "Salvar caso de teste"}
        </button>
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

const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
