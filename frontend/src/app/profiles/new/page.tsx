"use client"
import { useRouter } from "next/navigation"
import { createProfile } from "@/lib/api"
import ProfileForm, { type ProfileFormData } from "@/components/ProfileForm"

export default function NewProfilePage() {
  const router = useRouter()

  async function handleSubmit(data: ProfileFormData) {
    await createProfile(data)
    window.location.href = "/profiles"
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Perfil de Avaliação</h1>
      <ProfileForm onSubmit={handleSubmit} backHref="/profiles" />
    </div>
  )
}
