import { NextResponse } from "next/server"
import { getResend } from "@/lib/resend"
import { notifications } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"


const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body as Record<string, unknown>

    if (
      [name, email, subject, message].some((v) => typeof v !== "string" || !v.trim()) ||
      (name as string).length > 200 ||
      (email as string).length > 254 ||
      (subject as string).length > 300 ||
      (message as string).length > 5000 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email as string)
    ) {
      return NextResponse.json(
        { error: "Tous les champs sont requis" },
        { status: 400 }
      )
    }

    const safe = {
      name: escapeHtml(name as string),
      email: escapeHtml(email as string),
      subject: escapeHtml(subject as string),
      message: escapeHtml(message as string).replace(/\n/g, "<br>"),
    }

    // Envoyer l'email via Resend
    const resend = getResend()
    if (!resend) {
      console.error("[CONTACT_FORM] RESEND_API_KEY is not set: the request was not forwarded")
      return NextResponse.json({ error: "Envoi indisponible pour le moment" }, { status: 503 })
    }
    await resend.emails.send({
      from: "Cleads <contact@cleads.fr>",
      to: "contact@cleads.fr",
      subject: `Nouveau message de contact : ${(subject as string).replace(/[\r\n]+/g, " ")}`,
      html: `
        <h2>Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${safe.name}</p>
        <p><strong>Email :</strong> ${safe.email}</p>
        <p><strong>Sujet :</strong> ${safe.subject}</p>
        <p><strong>Message :</strong></p>
        <p>${safe.message}</p>
      `,
    })

    // Envoyer une copie au client
    await resend.emails.send({
      from: "Cleads <contact@cleads.fr>",
      to: email as string,
      subject: "Confirmation de votre message",
      html: `
        <h2>Merci pour votre message</h2>
        <p>Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.</p>
        <p>Cordialement,<br>L'équipe Cleads</p>
      `,
    })

    // Envoyer une notification aux administrateurs
    const admins = await prisma.user.findMany({
      where: { role: { in: ["OWNER", "MANAGER"] }, active: true },
      select: { id: true },
    })

    for (const admin of admins) {
      await notifications.contactForm(admin.id, {
        name: name as string,
        email: email as string,
        subject: subject as string,
        message: message as string,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[CONTACT_FORM]", error)
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message" },
      { status: 500 }
    )
  }
} 