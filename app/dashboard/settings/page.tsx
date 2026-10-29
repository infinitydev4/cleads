"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useNotificationSettings } from "@/hooks/useNotificationSettings"

interface Profile {
  name: string
  email: string
  phone: string
  avatar: string
}

const notificationOptions = [
  { key: "email", label: "Notifications par email" },
  { key: "appointments", label: "Nouveaux rendez-vous" },
  { key: "appointmentReminders", label: "Rappels de rendez-vous" },
  { key: "appointmentChanges", label: "Modifications de rendez-vous" },
  { key: "appointmentCancellations", label: "Annulations de rendez-vous" },
  { key: "contactForm", label: "Demandes d'audit reçues" },
  { key: "securityAlerts", label: "Alertes de sécurité" },
] as const

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { settings, isLoading, updateNotificationSettings } = useNotificationSettings()

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setProfile({ name: data.admin.name ?? "", email: data.admin.email ?? "", phone: data.admin.phone ?? "", avatar: data.admin.avatar ?? "" }))
      .catch(() => toast.error("Impossible de charger votre profil"))
  }, [])

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, email: profile.email, phone: profile.phone }),
      })
      if (!res.ok) throw new Error()
      toast.success("Profil mis à jour")
    } catch {
      toast.error("La mise à jour a échoué")
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append("avatar", file)
      const res = await fetch("/api/settings/avatar", { method: "POST", body })
      if (!res.ok) throw new Error(await res.text())
      const user = await res.json()
      setProfile((p) => (p ? { ...p, avatar: user.image ?? "" } : p))
      toast.success("Photo mise à jour")
    } catch {
      toast.error("L'envoi de la photo a échoué")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <section className="space-y-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
        <h2 className="text-lg font-semibold text-white">Mon profil</h2>
        {!profile ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Chargement" />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.avatar} alt="" />
                <AvatarFallback>{profile.name.slice(0, 2).toUpperCase() || "CL"}</AvatarFallback>
              </Avatar>
              <label className="text-sm text-gray-300">
                <span className="mb-1 block">Photo (image, 5 Mo maximum)</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                  className="text-sm"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-gray-300">
                Nom
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                Téléphone
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm text-gray-300 sm:col-span-2">
                Email de connexion
                <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              </label>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={saveProfile} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Link href="/auth/change-password" className="text-sm text-gray-400 underline hover:text-white">
                Changer mon mot de passe
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-950 p-6">
        <h2 className="text-lg font-semibold text-white">Notifications</h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Chargement" />
        ) : (
          <ul className="divide-y divide-gray-800">
            {notificationOptions.map(({ key, label }) => (
              <li key={key} className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-200" id={`n-${key}`}>{label}</span>
                <Switch
                  aria-labelledby={`n-${key}`}
                  checked={settings[key]}
                  onCheckedChange={(checked) => updateNotificationSettings({ [key]: checked })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
