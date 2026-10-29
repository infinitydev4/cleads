"use client";

import { useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { Clock3, Video, Zap } from "lucide-react";
import { HomeNavigation, HomeFooter } from "./navigation";
import { HomeHero, TrustBar } from "./hero";
import { MachineSection, MethodSection, TeamSection } from "./machine";
import { AgentsSection, DiagnosticInvitation } from "./agents";
import { OffersSection } from "./offers";
import {
  FaqSection,
  OutcomesSection,
  TestimonialsSection,
} from "./proof-and-faq";
import { AuditButton, Reveal, ScrollProgress } from "./primitives";
import { AuditDialog } from "./audit-dialog";
import { MotionFilm } from "./motion-film";
import { LocaleProvider, useHomeCopy } from "./locale";
import { useSectionScroll } from "./smooth-scroll";
import s from "./home.module.css";

export function HomeExperience() {
  return (
    <LocaleProvider>
      <HomePage />
    </LocaleProvider>
  );
}

function HomePage() {
  const copy = useHomeCopy();
  const pageRef = useRef<HTMLDivElement>(null);
  useSectionScroll(pageRef);
  const [auditOpen, setAuditOpen] = useState(false);
  const [context, setContext] = useState("");
  const [filmOpen, setFilmOpen] = useState(false);
  function openAudit(value = "") {
    setContext(value);
    setAuditOpen(true);
  }
  return (
    <MotionConfig reducedMotion="user">
      <div ref={pageRef} className={s.home}>
        <a href="#contenu" className={s.skipLink}>
          {copy.skip}
        </a>
        <ScrollProgress />
        <HomeNavigation onAudit={() => openAudit()} />
        <main id="contenu">
          <HomeHero
            onAudit={() => openAudit()}
            onFilm={() => setFilmOpen(true)}
          />
          <div className={s.sections}>
            <TrustBar />
            <MachineSection />
            <MethodSection />
            <TeamSection />
            <AgentsSection onAudit={() => openAudit(copy.agents.context)} />
            <DiagnosticInvitation onAudit={() => openAudit()} />
            <OffersSection onSelect={openAudit} />
            <OutcomesSection onAudit={openAudit} />
            <TestimonialsSection />
            <FaqSection />
            <Reveal>
              <section className={s.finalCta}>
                <img
                  className={s.targetArt}
                  src="/images/home/target.png"
                  alt=""
                />
                <div className={s.finalCopy}>
                  <span className={s.microLabel}>{copy.final.label}</span>
                  <h2>
                    {copy.final.title1}
                    <br />
                    <span>{copy.final.title2}</span>
                  </h2>
                  <p>
                    {copy.final.text1}
                    <br />
                    {copy.final.text2}
                  </p>
                </div>
                <div className={s.finalAction}>
                  <AuditButton onClick={() => openAudit()}>
                    {copy.final.cta}
                  </AuditButton>
                  <div>
                    <span>
                      <Clock3 />
                      {copy.final.minutes}
                    </span>
                    <span>
                      <Video />
                      {copy.final.video}
                    </span>
                    <span>
                      <Zap />
                      {copy.final.free}
                    </span>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>
        </main>
        <HomeFooter onAudit={() => openAudit()} />
        <AuditDialog
          open={auditOpen}
          onOpenChange={setAuditOpen}
          context={context}
        />
        <MotionFilm
          open={filmOpen}
          onOpenChange={setFilmOpen}
          onAudit={() => {
            setFilmOpen(false);
            openAudit();
          }}
        />
      </div>
    </MotionConfig>
  );
}
