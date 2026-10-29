"use client";

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  CircleCheck,
  LoaderCircle,
  Mail,
  Megaphone,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { Brand, useDialogFocus } from "./primitives";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

const goalIcons = [Target, TrendingUp, Megaphone, Bot];

export function AuditDialog({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  context: string;
}) {
  const focus = useDialogFocus();
  const copy = useHomeCopy();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.dialogOverlay} />
        <Dialog.Content
          {...focus}
          className={s.auditDialog}
          aria-describedby="audit-description"
        >
          <Dialog.Close
            className={s.dialogClose}
            aria-label={copy.audit.close}
          >
            <X size={21} />
          </Dialog.Close>
          {open && (
            <AuditFlow context={context} onClose={() => onOpenChange(false)} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AuditFlow({
  context,
  onClose,
}: {
  context: string;
  onClose: () => void;
}) {
  const copy = useHomeCopy().audit;
  const goals = copy.goals.map((item, index) => ({
    ...item,
    icon: goalIcons[index],
  }));
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(context.includes("IA") || context.includes("AI") ? 3 : 0);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [details, setDetails] = useState({ name: "", email: "", company: "", website: "", phone: "" });
  const [consent, setConsent] = useState(false);
  function field(name: keyof typeof details) {
    return { value: details[name], onChange: (event: ChangeEvent<HTMLInputElement>) => setDetails(previous => ({ ...previous, [name]: event.target.value })) };
  }
  const requestRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step > 0 || status === "success") headingRef.current?.focus();
  }, [step, status]);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = new FormData(event.currentTarget);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: String(data.get("name")).trim(),
          email: String(data.get("email")).trim(),
          subject: `${copy.subject} — ${goals[goal].label}`,
          message: [
            `${copy.fields.goal} : ${goals[goal].label}`,
            `${copy.fields.stage} : ${copy.stages[stage]}`,
            `${copy.fields.interest} : ${context || copy.interest}`,
            `${copy.fields.company} : ${data.get("company")}`,
            `${copy.fields.website} : ${data.get("website") || copy.notProvided}`,
            `${copy.fields.phone} : ${data.get("phone") || copy.notProvided}`,
            copy.requestLine,
          ].join("\n"),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true)
        throw new Error(copy.errorSend);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error && err.name === "AbortError"
          ? copy.errorTimeout
          : copy.errorSend,
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (status === "success")
    return (
      <div className={s.auditSuccess}>
        <span>
          <CheckCheck size={38} />
        </span>
        <p className={s.microLabel}>{copy.doneLabel}</p>
        <Dialog.Title ref={headingRef} tabIndex={-1}>
          {copy.doneTitle1}
          <br />
          {copy.doneTitle2}
        </Dialog.Title>
        <Dialog.Description id="audit-description">
          {copy.doneText}
        </Dialog.Description>
        <div>
          <CircleCheck size={18} /> {copy.priority} {goals[goal].label}
        </div>
        <button className={s.button} onClick={onClose}>
          {copy.backHome} <ArrowRight size={17} />
        </button>
      </div>
    );

  return (
    <>
      <div className={s.auditHeader}>
        <Brand />
        <span>{copy.plan}</span>
      </div>
      <div className={s.auditProgress} aria-label={`${copy.stepOf} ${step + 1} ${copy.of} 3`}>
        <div>
          {copy.steps.map((label, index) => (
              <span
                key={label}
                aria-current={step === index ? "step" : undefined}
                data-complete={index < step}
              >
                <i>{index < step ? <Check size={12} /> : index + 1}</i>
                {label}
              </span>
          ))}
        </div>
        <div className={s.auditProgressTrack}>
          <span style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
      </div>
      <div className={s.auditBody}>
        <span className={s.microLabel}>
          {copy.stepLabel} 0{step + 1} / 03 ·{" "}
          {step < 2 ? copy.check : copy.action}
        </span>
        <Dialog.Title ref={headingRef} tabIndex={-1}>
          {copy.titles[step]}
        </Dialog.Title>
        <Dialog.Description id="audit-description">
          {copy.descriptions[step]}
        </Dialog.Description>
        {step === 0 && (
          <fieldset className={s.goalOptions}>
            <legend className="sr-only">{copy.goalLegend}</legend>
            {goals.map((option, index) => (
              <label key={option.label}>
                <input
                  type="radio"
                  name="goal"
                  checked={goal === index}
                  onChange={() => setGoal(index)}
                />
                <span>
                  <option.icon size={23} />
                  <b>{option.label}</b>
                  <i>{goal === index && <Check size={13} />}</i>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {step === 1 && (
          <div className={s.stageOptions}>
            <label htmlFor="audit-stage">{copy.stageLabel}</label>
            <select
              id="audit-stage"
              value={stage}
              onChange={(event) => setStage(Number(event.target.value))}
            >
              {copy.stages.map((option, index) => (
                <option key={option} value={index}>
                  {option}
                </option>
              ))}
            </select>
            <div className={s.recommendation}>
              <span>
                {(() => {
                  const Icon = goals[goal].icon;
                  return <Icon size={23} />;
                })()}
              </span>
              <h3>{goals[goal].result}</h3>
              <p>{goals[goal].plan}</p>
              <small>
                <CircleCheck size={13} /> {copy.hint}
              </small>
            </div>
          </div>
        )}
        {step === 2 && (
          <form id="audit-form" onSubmit={submit} className={s.auditForm}>
            <div>
              <label>
                {copy.name}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder={copy.namePlaceholder}
                />
              </label>
              <label>
                {copy.email}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="camille@entreprise.fr"
                />
              </label>
            </div>
            <label>
              {copy.company}
              <input
                name="company"
                autoComplete="organization"
                required
                maxLength={150}
                placeholder={copy.companyPlaceholder}
              />
            </label>
            <div>
              <label>
                {copy.website} <small>{copy.optional}</small>
                <input
                  name="website"
                  maxLength={200}
                  placeholder="exemple.fr"
                />
              </label>
              <label>
                {copy.phone} <small>{copy.optional}</small>
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  placeholder="06 12 34 56 78"
                />
              </label>
            </div>
            <label className={s.auditConsent}>
              <input type="checkbox" required />{" "}
              <span>
                {copy.consentBefore}{" "}
                <a
                  href="/politique-de-confidentialite"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.privacy}
                </a>
                {copy.consentAfter}
              </span>
            </label>
            {status === "error" && (
              <p className={s.formError} role="alert">
                {error} <a href="mailto:contact@cleads.fr">contact@cleads.fr</a>
              </p>
            )}
          </form>
        )}
      </div>
      <div className={s.auditBottom}>
        {step > 0 ? (
          <button
            className={s.backButton}
            onClick={() => setStep(step - 1)}
            disabled={status === "sending"}
          >
            <ArrowLeft size={16} />
            {copy.back}
          </button>
        ) : (
          <span>
            <Mail size={14} />
            {copy.noEmail}
          </span>
        )}
        {step < 2 ? (
          <button className={s.button} onClick={() => setStep(step + 1)}>
            {copy.next} <ArrowRight size={17} />
          </button>
        ) : (
          <button
            form="audit-form"
            type="submit"
            className={s.button}
            disabled={status === "sending"}
          >
            {status === "sending" ? (
              <>
                <LoaderCircle className={s.spinner} size={17} />
                {copy.sending}
              </>
            ) : (
              <>
                {copy.submit} <ArrowRight size={17} />
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}
