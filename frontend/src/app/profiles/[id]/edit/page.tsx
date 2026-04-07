"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getProfile, updateProfile } from "@/lib/api"
import ProfileForm, { type ProfileFormData } from "@/components/ProfileForm"

export default function EditProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [initial, setInitial] = useState<ProfileFormData | null>(null)

  useEffect(() => {
    getProfile(Number(id)).then(p => setInitial({
      name: p.name,
      use_relevancy: p.use_relevancy,
      relevancy_threshold: p.relevancy_threshold,
      use_hallucination: p.use_hallucination,
      hallucination_threshold: p.hallucination_threshold,
      use_toxicity: p.use_toxicity ?? false,
      toxicity_threshold: p.toxicity_threshold ?? 0.5,
      use_bias: p.use_bias ?? false,
      bias_threshold: p.bias_threshold ?? 0.5,
      use_faithfulness: p.use_faithfulness ?? false,
      faithfulness_threshold: p.faithfulness_threshold ?? 0.5,
      use_latency: p.use_latency ?? false,
      latency_threshold_ms: p.latency_threshold_ms ?? 5000,
      criteria: p.criteria,
    })).catch(() => {})
  }, [id])

  async function handleSubmit(data: ProfileFormData) {
    await updateProfile(Number(id), data)
    window.location.href = "/profiles"
  }

  if (!initial) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar Perfil</h1>
      <ProfileForm initial={initial} onSubmit={handleSubmit} submitLabel="Salvar alterações" backHref="/profiles" />
    </div>
  )
}
