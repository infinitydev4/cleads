import { describe, expect, it } from "vitest"
import { analyze, isAutomatic, replyBody } from "@/features/outreach/inbound"

const OWN = "paul@trycleads.com"
const SENT_ID = "<11111111-aaaa@trycleads.com>"
const crlf = (s: string) => Buffer.from(s.trim().replace(/\n/g, "\r\n") + "\r\n")

const DSN = (status: string, action = "failed") => crlf(`
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: ${OWN}
Subject: Delivery Status Notification (Failure)
Message-ID: <dsn-1@mx.google.com>
Date: Mon, 03 Nov 2026 10:00:00 +0100
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="b1"

--b1
Content-Type: text/plain; charset=UTF-8

Votre message n'a pas été remis à boulanger@example.fr car l'adresse est introuvable.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com

Final-Recipient: rfc822; Boulanger@Example.fr
Action: ${action}
Status: ${status}
Diagnostic-Code: smtp; 550 5.1.1 The email account does not exist

--b1
Content-Type: message/rfc822

Message-ID: ${SENT_ID}
From: ${OWN}
To: boulanger@example.fr
Subject: Bonjour

Texte
--b1--
`)

const REPLY = (extra = "", subject = "Re: Bonjour") => crlf(`
From: Jean Boulanger <jean@example.fr>
To: ${OWN}
Subject: ${subject}
Message-ID: <reply-1@example.fr>
In-Reply-To: ${SENT_ID}
References: ${SENT_ID}
Date: Mon, 03 Nov 2026 11:00:00 +0100
${extra}Content-Type: text/plain; charset=UTF-8

Oui, appelez-moi demain.

Le lun. 3 nov. 2026 à 10:00, Paul <${OWN}> a écrit :
> Bonjour,
> Seriez-vous d'accord ?
`)

describe("inbound mail analysis", () => {
  it("reads a permanent bounce: which message, which address, why", async () => {
    const r = await analyze(DSN("5.1.1"), OWN)
    expect(r).toMatchObject({ kind: "bounce", hard: true, originalMessageId: SENT_ID, recipient: "boulanger@example.fr" })
    expect((r as { diagnostic: string }).diagnostic).toContain("5.1.1")
  })

  it("does not treat a delay or a temporary failure as permanent", async () => {
    expect(await analyze(DSN("4.2.2", "failed"), OWN)).toMatchObject({ kind: "bounce", hard: false })
    expect(await analyze(DSN("4.4.1", "delayed"), OWN)).toMatchObject({ kind: "bounce", hard: false })
  })

  it("reads a reply and cuts the quoted history", async () => {
    const r = await analyze(REPLY(), OWN)
    expect(r).toMatchObject({ kind: "reply", automatic: false, fromEmail: "jean@example.fr", inReplyTo: [SENT_ID, SENT_ID] })
    expect((r as { text: string }).text).toBe("Oui, appelez-moi demain.")
  })

  it("recognises out-of-office notices", async () => {
    expect(await analyze(REPLY("Auto-Submitted: auto-replied\n", "Réponse automatique : Bonjour"), OWN)).toMatchObject({ kind: "reply", automatic: true })
    expect(isAutomatic({ autoSubmitted: "", precedence: "", autoreply: "", subject: "Absence du bureau" })).toBe(true)
    expect(isAutomatic({ autoSubmitted: "no", precedence: "", autoreply: "", subject: "Re: Bonjour" })).toBe(false)
  })

  it("ignores mail that is not an answer, and our own messages", async () => {
    const plain = crlf(`From: news@example.fr\nTo: ${OWN}\nSubject: Promo\nMessage-ID: <n1@example.fr>\nContent-Type: text/plain\n\nSolde`)
    expect(await analyze(plain, OWN)).toMatchObject({ kind: "ignore" })
    const own = crlf(`From: ${OWN}\nTo: ${OWN}\nSubject: Re: x\nMessage-ID: <n2@x>\nIn-Reply-To: ${SENT_ID}\nContent-Type: text/plain\n\nHi`)
    expect(await analyze(own, OWN)).toMatchObject({ kind: "ignore" })
  })

  it("cuts quoted text in several styles", () => {
    expect(replyBody("Merci\n\nOn Mon, Nov 3, 2026 at 10:00 AM Paul <p@x.com> wrote:\n> hi")).toBe("Merci")
    expect(replyBody("Ok\n\n-----Original Message-----\nFrom: a@b.c")).toBe("Ok")
    expect(replyBody("Ok\r\n> citation")).toBe("Ok")
  })
})
