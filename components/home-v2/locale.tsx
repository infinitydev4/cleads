"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { messages, type HomeCopy, type Locale } from "./messages";
import s from "./home.module.css";

const STORAGE_KEY = "cleads-locale";

const LocaleContext = createContext<{
  locale: Locale;
  copy: HomeCopy;
  setLocale: (locale: Locale) => void;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "fr") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].metaTitle;
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LocaleContext.Provider value={{ locale, copy: messages[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useHomeCopy() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useHomeCopy must be used within LocaleProvider");
  return value.copy;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}

export function LanguageSwitch() {
  const { locale, setLocale, copy } = useLocale();
  return (
    <div className={s.langSwitch} role="group" aria-label={copy.nav.language}>
      <button
        type="button"
        aria-pressed={locale === "fr"}
        aria-label={copy.nav.french}
        onClick={() => setLocale("fr")}
      >
        <FlagFrance />
      </button>
      <button
        type="button"
        aria-pressed={locale === "en"}
        aria-label={copy.nav.english}
        onClick={() => setLocale("en")}
      >
        <FlagUsa />
      </button>
    </div>
  );
}

function FlagFrance() {
  return (
    <svg viewBox="0 0 22 16" aria-hidden="true">
      <rect width="7.34" height="16" fill="#0055A4" />
      <rect x="7.34" width="7.33" height="16" fill="#FFFFFF" />
      <rect x="14.67" width="7.33" height="16" fill="#EF4135" />
    </svg>
  );
}

function FlagUsa() {
  return (
    <svg viewBox="0 0 22 16" aria-hidden="true">
      <rect width="22" height="16" fill="#B22234" />
      <rect y="1.23" width="22" height="1.23" fill="#FFFFFF" />
      <rect y="3.69" width="22" height="1.23" fill="#FFFFFF" />
      <rect y="6.15" width="22" height="1.23" fill="#FFFFFF" />
      <rect y="8.62" width="22" height="1.23" fill="#FFFFFF" />
      <rect y="11.08" width="22" height="1.23" fill="#FFFFFF" />
      <rect y="13.54" width="22" height="1.23" fill="#FFFFFF" />
      <rect width="9.2" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}
