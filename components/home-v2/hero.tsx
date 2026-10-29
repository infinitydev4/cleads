"use client";

import Image from "next/image";
import { ArrowDown, Check, Play, Sparkles, TrendingUp } from "lucide-react";
import { AuditButton } from "./primitives";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

export function HomeHero({
  onAudit,
  onFilm,
}: {
  onAudit: () => void;
  onFilm: () => void;
}) {
  const copy = useHomeCopy();
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroImage}>
        <Image
          src="/images/home/hero.webp"
          alt={copy.hero.imageAlt}
          fill
          priority
          sizes="100vw"
          unoptimized
        />
      </div>
      <div className={s.heroShade} />
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <span className={s.heroBadge}>
            <span /> {copy.hero.badge}
          </span>
          <h1 id="hero-title">
            <span className={s.heroTitleLine}>{copy.hero.line1}</span>
            <span className={s.heroTitleBadge}>{copy.hero.badgeWord}</span>
            <span className={s.heroTitleLine}>{copy.hero.line2}</span>
          </h1>
          <p>
            {copy.hero.lead}
            <br />
            <strong>{copy.hero.leadStrong}</strong>
          </p>
          <p className={s.heroDescription}>{copy.hero.description}</p>
          <div className={s.heroActions}>
            <AuditButton onClick={onAudit}>{copy.hero.cta}</AuditButton>
            <button className={s.playButton} onClick={onFilm}>
              <span>
                <Play size={13} fill="currentColor" />
              </span>
              {copy.hero.play}
            </button>
          </div>
          <div className={s.heroReassurance}>
            {copy.hero.checks.map((item) => (
              <span key={item}>
                <Check />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className={s.heroSignal}>
          <span className={s.signalIcon}>
            <TrendingUp size={20} />
          </span>
          <div>
            <span>{copy.hero.signal}</span>
            <strong>{copy.hero.signalStrong}</strong>
          </div>
          <Sparkles size={16} />
        </div>
        <div className={s.heroBottom}>
          <span>
            <i /> {copy.hero.bottom}
          </span>
          <a href="#la-machine" aria-label={copy.hero.discover}>
            <ArrowDown size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

const trustLogos = [
  { src: "/images/home/logos/vinci.png", alt: "VINCI" },
  { src: "/images/home/logos/eiffage.png", alt: "EIFFAGE" },
  { src: "/images/home/logos/spie.png", alt: "SPIE" },
  { src: "/images/home/logos/btp-services.png", alt: "BTP Services" },
  { src: "/images/home/logos/kpmg.png", alt: "KPMG" },
];

export function TrustBar() {
  const copy = useHomeCopy();
  return (
    <section className={s.trust} aria-label={copy.trust.label}>
      <p>{copy.trust.label}</p>
      <div className={s.trustMarquee}>
        <div className={s.trustTrack}>
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1}>
              {trustLogos.map((logo) => (
                <li key={`${copy}-${logo.alt}`}>
                  <Image
                    src={logo.src}
                    alt={copy === 0 ? logo.alt : ""}
                    width={180}
                    height={56}
                    className={s.trustLogo}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <p className={s.trustCount}>
        <strong>+50</strong>
        {copy.trust.count}
      </p>
    </section>
  );
}
