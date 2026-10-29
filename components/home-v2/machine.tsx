"use client";

import { ChevronsRight, X } from "lucide-react";
import { Brand, Reveal, SectionIntro } from "./primitives";
import { method, team } from "./content";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

export function MachineSection() {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        id="la-machine"
        className={`${s.panel} ${s.machine}`}
        aria-labelledby="machine-title"
      >
        <img
          className={s.advisorArt}
          src="/images/home/advisor.webp"
          alt=""
        />
        <ul className={s.painList}>
          {copy.machine.pains.map((item) => (
            <li key={item}>
              <span>
                <X size={12} strokeWidth={2.75} />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <ChevronsRight
          className={s.machineArrow}
          size={44}
          aria-hidden="true"
        />
        <div className={s.machineSolution}>
          <div className={s.machineCopy}>
            <Brand />
            <h2 id="machine-title">
              {copy.machine.title1}
              <br />
              {copy.machine.title2}
            </h2>
            <p>{copy.machine.body}</p>
          </div>
          <img className={s.rocketArt} src="/images/home/rocket.png" alt="" />
        </div>
      </section>
    </Reveal>
  );
}

export function MethodSection() {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        id="methode"
        className={`${s.panel} ${s.method}`}
        aria-labelledby="method-title"
      >
        <SectionIntro
          id="method-title"
          eyebrow={copy.method.eyebrow}
          title={copy.method.title}
        >
          {copy.method.text}
        </SectionIntro>
        <ol className={s.methodSteps}>
          {method.map((item, index) => (
            <li className={s.methodStep} key={index}>
              <div
                className={s.methodArt}
                style={{ backgroundPositionX: `${(index * 100) / 3}%` }}
                aria-hidden="true"
              />
              <h3>
                <span>0{index + 1}.</span> {copy.method.steps[index].title}
              </h3>
              <p>{copy.method.steps[index].text}</p>
            </li>
          ))}
        </ol>
      </section>
    </Reveal>
  );
}

export function TeamSection() {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        id="equipe"
        className={`${s.panel} ${s.team}`}
        aria-labelledby="team-title"
      >
        <SectionIntro
          id="team-title"
          eyebrow={copy.team.eyebrow}
          title={
            <>
              {copy.team.title1} <br />
              {copy.team.title2}
            </>
          }
        >
          {copy.team.text}
        </SectionIntro>
        <div className={s.teamGrid}>
          {team.map((person, index) => (
            <article className={s.teamCard} key={person.image}>
              <img
                className={s.teamPortrait}
                src={person.image}
                alt={copy.team.people[index].role}
              />
              <span className={s.teamIcon}>
                <person.icon size={23} />
              </span>
              <div className={s.teamCaption}>
                <h3>{copy.team.people[index].role}</h3>
                <p>{copy.team.people[index].text}</p>
              </div>
            </article>
          ))}
          <span className={s.teamNote}>{copy.team.note}</span>
        </div>
      </section>
    </Reveal>
  );
}
