"use client"
import { useEffect, useState } from "react"
import { getLLMProviders, type LLMProvider } from "@/lib/api"

interface Props {
  value: number | null | undefined
  onChange: (id: number | null) => void
  label?: string
  className?: string
}

export default function LLMProviderSelector({ value, onChange, label = "LLM Juiz", className = "" }: Props) {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getLLMProviders().then(setProviders).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  return (
    <div className={className}>
      <label className="flame-field-label">{label}</label>
      {loaded && providers.length === 0 ? (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
          Nenhum provedor LLM configurado.{" "}
          <a href="/settings/llm-providers" className="underline hover:text-amber-800">
            Adicione um em Configurações → Provedores LLM
          </a>{" "}
          para executar avaliações.
        </p>
      ) : (
        <>
          <p className="flame-helper mb-2">
            Escolha o modelo LLM que avaliará as respostas. "Primeiro disponível" usa o provedor mais recente configurado.
          </p>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
            value={value ?? ""}
            onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Primeiro disponível (automático)</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.model_name} ({p.provider_type})
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}
