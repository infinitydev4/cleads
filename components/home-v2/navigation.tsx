"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X, ArrowRight } from "lucide-react";
import { Brand, AuditButton } from "./primitives";
import { LanguageSwitch, useHomeCopy } from "./locale";
import s from "./home.module.css";

export function HomeNavigation({ onAudit }: { onAudit: () => void }) {
  const copy = useHomeCopy();
  const [open, setOpen] = useState(false);
  return (
    <header className={s.header}>
      <div className={s.headerInner}>
        <Brand light />
        <nav className={s.desktopNav} aria-label={copy.nav.label}>
          {copy.nav.links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className={s.headerActions}>
          <LanguageSwitch />
          <AuditButton onClick={onAudit}>{copy.nav.audit}</AuditButton>
          <button
            className={s.menuToggle}
            aria-label={open ? copy.nav.closeMenu : copy.nav.openMenu}
            aria-expanded={open}
            aria-controls="home-mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="home-mobile-menu"
          className={s.mobileMenu}
          aria-label={copy.nav.mobileLabel}
        >
          {copy.nav.links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
              <ArrowUpRight size={18} />
            </a>
          ))}
          <Link href="/auth/login">
            {copy.nav.clientSpace}
            <ArrowUpRight size={18} />
          </Link>
        </nav>
      )}
    </header>
  );
}

export function HomeFooter({ onAudit }: { onAudit: () => void }) {
  const copy = useHomeCopy();
  return (
    <>
      <footer className={s.footer}>
        <div className={s.footerMain}>
          <div>
            <Brand />
            <p>
              {copy.footer.line1}
              <br />
              {copy.footer.line2}
            </p>
          </div>
          <div className={s.footerLinks}>
            <a href="#la-machine">{copy.footer.machine}</a>
            <a href="#agents-ia">{copy.footer.agents}</a>
            <a href="#offres">{copy.footer.offers}</a>
          </div>
          <div className={s.footerLinks}>
            <a href="mailto:contact@cleads.fr">
              contact@cleads.fr <ArrowUpRight size={14} />
            </a>
            <a href="tel:+33767036848">+33 7 67 03 68 48</a>
            <Link href="/auth/login">{copy.nav.clientSpace}</Link>
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>
            © {new Date().getFullYear()} Cleads. {copy.footer.copyright}
          </span>
          <div>
            <Link href="/mentions-legales">{copy.footer.legal}</Link>
            <Link href="/politique-de-confidentialite">{copy.footer.privacy}</Link>
            <Link href="/cgv">{copy.footer.terms}</Link>
          </div>
        </div>
      </footer>
      <div className={s.mobileConversion}>
        <span>
          <i />
          {copy.footer.mobileLead}
        </span>
        <button onClick={onAudit}>
          {copy.footer.mobileCta} <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}
