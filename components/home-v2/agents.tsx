"use client";

import { ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { AuditButton, Eyebrow, Reveal } from "./primitives";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

export function AgentsSection({ onAudit }: { onAudit: () => void }) {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        id="agents-ia"
        className={`${s.panel} ${s.agents}`}
        aria-labelledby="agents-title"
      >
        <div className={s.agentCopy}>
          <Eyebrow dark>
            <Sparkles size={12} /> {copy.agents.eyebrow}
          </Eyebrow>
          <h2 id="agents-title">
            {copy.agents.title1}
            <br />
            <span>{copy.agents.title2}</span>
          </h2>
          <p>{copy.agents.body}</p>
          <div className={s.agentPanel}>
            <h3>{copy.agents.panelTitle}</h3>
            <p>{copy.agents.panelText}</p>
          </div>
          <button className={s.agentLink} onClick={onAudit}>
            {copy.agents.link} <ArrowUpRight size={17} />
          </button>
          <span className={s.agentGuard}>
            <ShieldCheck size={14} /> {copy.agents.guard}
          </span>
        </div>
        <div className={s.agentVisual}>
          <img className={s.robotArt} src="/images/home/agent.png" alt="" />
          <span className={s.agentVisualNote}>{copy.agents.note}</span>
        </div>
      </section>
    </Reveal>
  );
}

export function DiagnosticInvitation({ onAudit }: { onAudit: () => void }) {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section className={s.diagnosticInvite}>
        <span className={s.questIcon}>
          <Sparkles size={25} />
        </span>
        <div>
          <span className={s.microLabel}>{copy.diagnostic.label}</span>
          <h2>{copy.diagnostic.title}</h2>
          <p>{copy.diagnostic.text}</p>
        </div>
        <AuditButton onClick={onAudit} dark>
          {copy.diagnostic.cta}
        </AuditButton>
      </section>
    </Reveal>
  );
}
