"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Megaphone,
  Target,
} from "lucide-react";
import { plans } from "./content";
import { Reveal, SectionIntro } from "./primitives";
import { useHomeCopy } from "./locale";
import s from "./home.module.css";

export function OffersSection({
  onSelect,
}: {
  onSelect: (name: string) => void;
}) {
  const copy = useHomeCopy();
  return (
    <Reveal>
      <section
        id="offres"
        className={`${s.panel} ${s.offers}`}
        aria-labelledby="offers-title"
      >
        <SectionIntro
          id="offers-title"
          eyebrow={copy.offers.eyebrow}
          title={
            <>
              {copy.offers.title1} <br />
              {copy.offers.title2}
            </>
          }
        >
          {copy.offers.text}
        </SectionIntro>
        <div className={s.plans}>
          {plans.map((plan, index) => {
            const text = copy.offers.plans[index];
            return (
            <article
              key={plan.name}
              className={`${s.plan} ${plan.featured ? s.planFeatured : ""}`}
            >
              {plan.featured && (
                <span className={s.planBadge}>
                  <Sparkle /> {copy.offers.badge}
                </span>
              )}
              <h3>
                <plan.icon size={23} />
                {plan.name}
              </h3>
              <p>{text.description}</p>
              <div className={s.planPrice}>
                {plan.price ? (
                  <>
                    <span>{copy.offers.from}</span>
                    <strong>{plan.price} €</strong>
                    <small>{copy.offers.unit}</small>
                  </>
                ) : (
                  <>
                    <span>{copy.offers.singular}</span>
                    <strong>{copy.offers.quote}</strong>
                    <small>{copy.offers.forYou}</small>
                  </>
                )}
              </div>
              <ul>
                {text.features.map((feature) => (
                  <li key={feature}>
                    <Check size={14} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button onClick={() => onSelect(plan.name)}>
                {text.cta}
                <ArrowRight size={16} />
              </button>
            </article>
            );
          })}
        </div>
        <div className={s.offerConditions}>
          <span>
            <CalendarDays />
            <b>{copy.offers.conditions[0].title}</b>
            <small>{copy.offers.conditions[0].text}</small>
          </span>
          <span>
            <Target />
            <b>{copy.offers.conditions[1].title}</b>
            <small>{copy.offers.conditions[1].text}</small>
          </span>
          <span>
            <Megaphone />
            <b>{copy.offers.conditions[2].title}</b>
            <small>{copy.offers.conditions[2].text}</small>
          </span>
        </div>
      </section>
    </Reveal>
  );
}

function Sparkle() {
  return <CircleCheck size={13} />;
}
