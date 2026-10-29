"use client";

import { type ReactNode, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { ArrowRight, MousePointer2 } from "lucide-react";
import s from "./home.module.css";

/** Controlled dialogs have multiple CTA openers instead of a single Trigger. */
export function useDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      requestAnimationFrame(() => {
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('header button');
        target?.focus({ preventScroll: true });
      });
    },
  };
}

export function Brand({ light = false }: { light?: boolean }) {
  if (light) {
    return (
      <Link
        className={`${s.brand} ${s.brandLight} ${s.brandLogo}`}
        href="/"
        aria-label="Cleads, accueil"
      >
        <img src="/logo-white.svg" alt="" width={162} height={30} />
      </Link>
    );
  }
  return (
    <Link
      className={`${s.brand} ${light ? s.brandLight : ""}`}
      href="/"
      aria-label="Cleads, accueil"
    >
      <span className={s.brandMark}>
        <MousePointer2 fill="white" strokeWidth={2.5} />
      </span>
      <span>
        Cleads<span className={s.brandDot}>.</span>
      </span>
    </Link>
  );
}

export function AuditButton({
  children = "Demander mon audit gratuit",
  onClick,
  className = "",
  dark = false,
}: {
  children?: ReactNode;
  onClick: () => void;
  className?: string;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${s.button} ${dark ? s.buttonDark : ""} ${className}`}
    >
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

export function Eyebrow({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span className={`${s.eyebrow} ${dark ? s.eyebrowDark : ""}`}>
      {children}
    </span>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className={s.sectionIntro}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id}>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={reduced ? undefined : { y: [18, 0], opacity: [0.55, 1] }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Artwork({
  name,
  alt = "",
  className = "",
  priority = false,
  sizes = "(max-width: 700px) 90vw, 30vw",
}: {
  name: string;
  alt?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={`${s.artwork} ${className}`}>
      <Image
        src={`/images/home/${name}.webp`}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
      />
    </div>
  );
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <motion.div
      aria-hidden="true"
      className={s.scrollProgress}
      style={{ scaleX: reduced ? scrollYProgress : scaleX }}
    />
  );
}
