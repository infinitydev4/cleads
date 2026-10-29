"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn, useSession, signOut } from "next-auth/react"
import Image from "next/image"
import { motion } from "framer-motion"
import { LogIn } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { toast } from "sonner"

const formSchema = z.object({
  currentPassword: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  newPassword: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})

export default function ChangePasswordPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || "Une erreur est survenue")
        setError(data.error || "Une erreur est survenue")
        return
      }

      toast.success("Mot de passe modifié avec succès")
      
      // Déconnexion et reconnexion pour mettre à jour la session
      await signOut({ redirect: false })
      await signIn("credentials", {
        email: session?.user?.email,
        password: values.newPassword,
        redirect: false
      })

      // Rediriger vers la page appropriée selon le rôle
      router.push("/dashboard")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue"
      toast.error(errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#BFFF00]/10 via-transparent to-transparent" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative"
      >
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-8">
          <div className="flex flex-col items-center mb-8">
            <Image src="/logo-white.svg" alt="Logo" width={150} height={40} className="mb-6" />
            <h1 className="text-2xl font-bold text-white">Changement de mot de passe</h1>
            <p className="text-gray-400 text-sm">Créez votre nouveau mot de passe</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Mot de passe actuel</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        className="bg-gray-900 border-gray-800 text-white"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Nouveau mot de passe</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        className="bg-gray-900 border-gray-800 text-white"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Confirmer le mot de passe</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        className="bg-gray-900 border-gray-800 text-white"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-[#BFFF00] hover:bg-[#BFFF00]/90 text-black"
                disabled={isLoading}
              >
                {isLoading ? (
                  "Modification en cours..."
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Changer le mot de passe
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </motion.div>
    </div>
  )
} 