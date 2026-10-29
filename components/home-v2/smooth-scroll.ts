"use client";

import { useEffect, type RefObject } from "react";

let rafId = 0;
let timerId = 0;
let running = false;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function targetTop(element: HTMLElement) {
  const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
  const top = element.getBoundingClientRect().top + window.scrollY - margin;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.max(0, Math.min(top, max));
}

function easeOutQuart(progress: number) {
  return 1 - (1 - progress) ** 4;
}

function clearHandles() {
  if (rafId) cancelAnimationFrame(rafId);
  if (timerId) clearTimeout(timerId);
  rafId = 0;
  timerId = 0;
}

export function cancelSectionScroll() {
  running = false;
  clearHandles();
}

function schedule(step: (now: number) => void) {
  clearHandles();
  const fire = (now: number) => {
    if (!running) return;
    clearHandles();
    step(now);
  };
  rafId = requestAnimationFrame(fire);
  timerId = window.setTimeout(() => fire(performance.now()), 16);
}

export function scrollToSection(element: HTMLElement) {
  const top = targetTop(element);
  const start = window.scrollY;
  const distance = top - start;
  cancelSectionScroll();

  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    window.scrollTo(0, top);
    return;
  }

  const duration = Math.min(1400, Math.max(680, Math.abs(distance) * 0.45));
  const started = performance.now();
  running = true;

  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    window.scrollTo(0, start + distance * easeOutQuart(progress));
    if (!running) return;
    if (progress < 1) schedule(step);
    else running = false;
  };

  schedule(step);
}

function sectionFromHash(hash: string, root: HTMLElement) {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return null;
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement) || !root.contains(element)) return null;
  return element;
}

export function useSectionScroll(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href^='#']");
      if (!(anchor instanceof HTMLAnchorElement) || !root.contains(anchor)) return;
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const element = sectionFromHash(hash, root);
      if (!element) return;
      event.preventDefault();
      scrollToSection(element);
      const nextUrl = `${window.location.pathname}${window.location.search}#${element.id}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
        history.pushState(null, "", nextUrl);
      }
    };

    const onPopState = () => {
      const element = sectionFromHash(window.location.hash, root);
      if (element) scrollToSection(element);
      else {
        cancelSectionScroll();
        window.scrollTo(0, 0);
      }
    };

    const interrupt = () => cancelSectionScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        cancelSectionScroll();
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchmove", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);

    const initial = sectionFromHash(window.location.hash, root);
    const initialTimer = window.setTimeout(() => {
      if (initial && Math.abs(window.scrollY - targetTop(initial)) > 8) scrollToSection(initial);
    }, 0);

    return () => {
      window.clearTimeout(initialTimer);
      cancelSectionScroll();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchmove", interrupt);
      window.removeEventListener("keydown", onKey);
    };
  }, [rootRef]);
}
