"use client"
import { useRouter } from "next/navigation"
import { showAfterNav } from "@/components/PendingToast"
import { createProfile } from "@/lib/api"
import ProfileForm, { type ProfileFormData } from "@/components/ProfileForm"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

export default function NewProfilePage() {
  const router = useRouter()

  async function handleSubmit(data: ProfileFormData) {
    await createProfile(data)
    showAfterNav("Perfil criado")
    window.location.href = "/profiles"
  }

  return (
    <div className="max-w-xl">
      <Breadcrumb items={[{ label: "Perfis de Avaliação", href: "/profiles" }, { label: "Novo perfil" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Perfil de Avaliação</h1>
      <ProfileForm onSubmit={handleSubmit} backHref="/profiles" />
    </div>
  )
}
