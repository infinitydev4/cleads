"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { AuditButton, useDialogFocus } from "./primitives";
import { method } from "./content";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

export function MotionFilm({
  open,
  onOpenChange,
  onAudit,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onAudit: () => void;
}) {
  const copy = useHomeCopy();
  const reduced = useReducedMotion();
  const focus = useDialogFocus();
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const completed = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === iframeRef.current?.contentWindow &&
        event.data?.type === "cleads-motion-complete"
      )
        setPlaying(false);
    };
    window.addEventListener("message", completed);
    return () => window.removeEventListener("message", completed);
  }, []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setPlaying(false);
        onOpenChange(value);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={s.dialogOverlay} />
        <Dialog.Content className={s.filmDialog} {...focus}>
          <Dialog.Close
            className={s.dialogClose}
            aria-label={copy.film.close}
          >
            <X size={21} />
          </Dialog.Close>
          <Dialog.Title>{copy.film.title}</Dialog.Title>
          <Dialog.Description>{copy.film.description}</Dialog.Description>
          {open && (
            <iframe
              ref={iframeRef}
              key={replay}
              className={s.filmFrame}
              src="/motion/machine.html"
              title={copy.film.frameTitle}
            />
          )}
          <div
            className={s.filmControls}
            aria-label={reduced ? copy.film.reduced : copy.film.controls}
          >
            <button
              onClick={() => {
                const frame = iframeRef.current;
                frame?.contentWindow?.postMessage(
                  { type: "cleads-motion", action: playing ? "pause" : "play" },
                  window.location.origin,
                );
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? copy.film.pause : copy.film.play}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setReplay(replay + 1);
              }}
            >
              <RotateCcw size={16} />
              {copy.film.restart}
            </button>
          </div>
          <ol className={s.filmTranscript}>
            {method.map((_, index) => (
              <li key={copy.method.steps[index].title}>
                <b>
                  0{index + 1}. {copy.method.steps[index].title}
                </b>
                <span>{copy.method.steps[index].text}</span>
              </li>
            ))}
          </ol>
          <AuditButton onClick={onAudit}>{copy.film.cta}</AuditButton>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
