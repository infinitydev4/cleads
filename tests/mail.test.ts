import { createSign, generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { isTrustedCertUrl, isTrustedSubscribeUrl, stringToSign, verifySnsMessage, type SnsMessage } from "@/lib/mail/sns"
import { suppressionTargets } from "@/lib/mail/events"

const CERT = "https://sns.eu-north-1.amazonaws.com/SimpleNotificationService-abc123.pem"
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = publicKey.export({ type: "spki", format: "pem" }).toString()

function signed(over: Partial<SnsMessage> = {}, algo: "RSA-SHA1" | "RSA-SHA256" = "RSA-SHA256"): SnsMessage {
  const m: SnsMessage = { Type: "Notification", MessageId: "m-1", TopicArn: "arn:aws:sns:eu-north-1:1:t", Message: '{"eventType":"Bounce"}', Timestamp: "2026-10-30T22:00:00.000Z", SignatureVersion: algo === "RSA-SHA256" ? "2" : "1", Signature: "", SigningCertURL: CERT, ...over }
  const signer = createSign(algo)
  signer.update(stringToSign(m)!, "utf8")
  m.Signature = signer.sign(privateKey, "base64")
  return m
}
const getCert = async () => pem

describe("SNS signature", () => {
  it("builds the text AWS signs, alphabetically, leaving out absent fields", () => {
    const text = stringToSign(signed({ Subject: "Hello" }))!
    expect(text.split("\n").filter((_, i) => i % 2 === 0 && _)).toEqual(["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"])
    expect(stringToSign(signed())).not.toContain("Subject")
    const sub = stringToSign({ ...signed(), Type: "SubscriptionConfirmation", Token: "tok", SubscribeURL: "https://sns.eu-north-1.amazonaws.com/?x=1" })!
    expect(sub).toContain("Token\ntok\n")
    expect(sub.indexOf("SubscribeURL")).toBeLessThan(sub.indexOf("Timestamp"))
    expect(stringToSign({ ...signed(), Type: "Other" as never })).toBeNull()
  })

  it("accepts a genuine message, in both signature versions", async () => {
    expect(await verifySnsMessage(signed(), getCert)).toBe(true)
    expect(await verifySnsMessage(signed({}, "RSA-SHA1"), getCert)).toBe(true)
  })

  it("rejects a message changed after signing, a wrong key and an unknown version", async () => {
    expect(await verifySnsMessage({ ...signed(), Message: '{"eventType":"Complaint"}' }, getCert)).toBe(false)
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString()
    expect(await verifySnsMessage(signed(), async () => other)).toBe(false)
    expect(await verifySnsMessage({ ...signed(), SignatureVersion: "3" }, getCert)).toBe(false)
    expect(await verifySnsMessage({ ...signed(), Signature: "" }, getCert)).toBe(false)
    expect(await verifySnsMessage(null as never, getCert)).toBe(false)
  })

  it("never downloads a certificate from anywhere but AWS", async () => {
    let asked = false
    const spy = async () => ((asked = true), pem)
    for (const bad of ["http://sns.eu-north-1.amazonaws.com/SimpleNotificationService-a.pem", "https://evil.example/SimpleNotificationService-a.pem", "https://sns.eu-north-1.amazonaws.com.evil.example/SimpleNotificationService-a.pem", "https://sns.eu-north-1.amazonaws.com/other.pem", "https://amazonaws.com/SimpleNotificationService-a.pem"]) {
      expect(isTrustedCertUrl(bad)).toBe(false)
      expect(await verifySnsMessage(signed({ SigningCertURL: bad }), spy)).toBe(false)
    }
    expect(asked).toBe(false)
    expect(isTrustedCertUrl(CERT)).toBe(true)
  })

  it("only follows a subscription URL on an AWS SNS host", () => {
    expect(isTrustedSubscribeUrl("https://sns.eu-north-1.amazonaws.com/?Action=ConfirmSubscription&Token=x")).toBe(true)
    expect(isTrustedSubscribeUrl("https://evil.example/?Action=ConfirmSubscription")).toBe(false)
    expect(isTrustedSubscribeUrl("http://sns.eu-north-1.amazonaws.com/")).toBe(false)
    expect(isTrustedSubscribeUrl("https://sns.eu-north-1.amazonaws.com.evil.example/")).toBe(false)
  })
})

describe("what an SES event suppresses", () => {
  it("a permanent bounce suppresses each bounced address, lower-cased", () => {
    const t = suppressionTargets({ eventType: "Bounce", bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "Gone@Example.com", diagnosticCode: "550 no such user" }, { emailAddress: "other@example.com" }] } })
    expect(t.map((x) => [x.email, x.reason])).toEqual([["gone@example.com", "BOUNCED"], ["other@example.com", "BOUNCED"]])
    expect(t[0].detail).toContain("550 no such user")
  })
  it("a temporary bounce suppresses nothing: the address may work tomorrow", () => {
    expect(suppressionTargets({ eventType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "full@example.com" }] } })).toEqual([])
    expect(suppressionTargets({ eventType: "Bounce", bounce: { bounceType: "Undetermined", bouncedRecipients: [{ emailAddress: "x@example.com" }] } })).toEqual([])
  })
  it("a complaint suppresses the complaining address", () => {
    const t = suppressionTargets({ eventType: "Complaint", complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "angry@example.com" }] } })
    expect(t).toEqual([{ email: "angry@example.com", reason: "COMPLAINED", detail: "abuse" }])
  })
  it("understands the classic notification format too", () => {
    expect(suppressionTargets({ notificationType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@example.com" }] } })).toHaveLength(1)
  })
  it("ignores deliveries, junk addresses and garbage", () => {
    expect(suppressionTargets({ eventType: "Delivery" })).toEqual([])
    expect(suppressionTargets({ eventType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "not-an-email" }, {}] } })).toEqual([])
    expect(suppressionTargets(null)).toEqual([])
    expect(suppressionTargets("text")).toEqual([])
  })
})
