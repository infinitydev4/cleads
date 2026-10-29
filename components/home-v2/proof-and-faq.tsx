"use client";

import {
  ArrowUpRight,
  Building2,
  BriefcaseBusiness,
  Hammer,
  Plus,
  Quote,
} from "lucide-react";
import { Reveal, SectionIntro } from "./primitives";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

const sectors = [
  {
    title: "BTP & industrie",
    icon: Hammer,
    number: "01",
    text: "Décrocher les bons échanges",
    detail:
      "Identifiez les décideurs, rendez votre expertise visible et structurez votre suivi commercial.",
    art: "construction",
  },
  {
    title: "Conseil & expertise",
    icon: BriefcaseBusiness,
    number: "02",
    text: "Remplir un pipeline ciblé",
    detail:
      "Faites émerger votre différence auprès des entreprises qui ont besoin de votre savoir-faire.",
    art: "consulting",
  },
  {
    title: "Services & tech",
    icon: Building2,
    number: "03",
    text: "Accélérer sans s’éparpiller",
    detail:
      "Reliez votre acquisition, votre site et vos outils pour faire progresser chaque opportunité.",
    art: "services",
  },
];

export function OutcomesSection({
  onAudit,
}: {
  onAudit: (sector: string) => void;
}) {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        className={`${s.panel} ${s.outcomes}`}
        aria-labelledby="outcomes-title"
      >
        <SectionIntro
          id="outcomes-title"
          eyebrow={copy.outcomes.eyebrow}
          title={
            <>
              {copy.outcomes.title1} <br />
              {copy.outcomes.title2}
            </>
          }
        >
          {copy.outcomes.text}
        </SectionIntro>
        <div className={s.sectorGrid}>
          {sectors.map((sector, index) => {
            const text = copy.outcomes.sectors[index];
            return (
            <button
              key={sector.art}
              className={`${s.sectorCard} ${s[sector.art]}`}
              onClick={() => onAudit(text.title)}
            >
              <span className={s.sectorTop}>
                <sector.icon size={25} />
                <span>
                  <ArrowUpRight size={20} />
                </span>
              </span>
              <div>
                <span className={s.sectorName}>{text.title}</span>
                <h3>{text.text}</h3>
                <p>{text.detail}</p>
              </div>
              <span className={s.sectorCta}>
                {copy.outcomes.cta} <ArrowUpRight size={14} />
              </span>
            </button>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}

export function TestimonialsSection() {
  const copy = useHomeCopy();
  const photos = [
    "/images/home/reviews/mathieu.jpg",
    "/images/home/reviews/nordine.jpg",
    "/images/home/reviews/victoire.jpg",
  ];
  const names = ["Mathieu D.", "Nordine M.", "Victoire M."];
  return (
    <Reveal>
      <section className={`${s.panel} ${s.reviews}`}>
        <SectionIntro
          eyebrow={copy.reviews.eyebrow}
          title={
            <>
              {copy.reviews.title1} <br />
              {copy.reviews.title2}
            </>
          }
        >
          {copy.reviews.text}
        </SectionIntro>
        <div className={s.reviewGrid}>
          {copy.reviews.items.map((review, index) => (
            <figure key={names[index]} className={s.review}>
              <Quote size={20} className={s.quoteIcon} />
              <blockquote>« {review.quote} »</blockquote>
              <figcaption>
                <img className={s.avatar} src={photos[index]} alt="" />
                <span>
                  <strong>{names[index]}</strong>
                  <small>{review.role}</small>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

export function FaqSection() {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section className={`${s.panel} ${s.faq}`}>
        <SectionIntro
          eyebrow={copy.faq.eyebrow}
          title={
            <>
              {copy.faq.title1} <br />
              {copy.faq.title2}
            </>
          }
        >
          {copy.faq.text}
        </SectionIntro>
        <div>
          {copy.faq.items.map((item) => (
            <details key={item.q} className={s.faqItem}>
              <summary>
                {item.q}
                <Plus size={19} />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </Reveal>
  );
}
