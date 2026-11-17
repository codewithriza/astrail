"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import ContactForm from "./ContactForm";
import Mascot from "./Mascot";
import {
  Logo,
  PixelArrow,
  PixelCloud,
  PixelEdge,
  PixelPlanet,
  PixelSprite,

  Reveal,
  RetroWindow,
  TypedHeading,
  useInView,
  useReducedMotion,
} from "./pixel-ui";
import {
  C,
  CHECK,
  ICON_BLOCKS,
  ICON_PALETTE,
  ICON_PALETTE_LOCKED,
  ICON_SHIELD,
  ICON_SPEC,
  LOCK,
  MENU,
  PLUS,
  SPARKLE,
  STAR,
} from "./sprites";
import { contact, footer, hero, howItWorks, links, marquee, nav } from "./content";

const EDGE = { tang: "var(--px-tang)", ink: "var(--px-ink)" };

/* ---------------- header ---------------- */

function useScrollState() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState("");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 16);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
      const mid = window.innerHeight / 2;
      let current = "";
      nav.forEach((item) => {
        if (!item.section) return;
        const el = document.getElementById(item.section);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) current = item.section;
      });
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return { scrolled, progress, active };
}

function NavLink({ item, active, className, onClick, children }) {
  const isActive = item.section && active === item.section;
  const cls = [className, isActive ? s.navActive : ""].filter(Boolean).join(" ");
  if (item.external) {
    return (
      <a href={item.href} className={cls} onClick={onClick}>
        {children ?? item.label}
        <span aria-hidden="true"> ↗</span>
      </a>
    );
  }
  if (item.href.startsWith("/")) {
    return (
      <Link href={item.href} className={cls} onClick={onClick}>
        {children ?? item.label}
      </Link>
    );
  }
  return (
    <a href={item.href} className={cls} aria-current={isActive ? "true" : undefined} onClick={onClick}>
      {children ?? item.label}
    </a>
  );
}

function Header() {
  const { scrolled, progress, active } = useScrollState();
  const [open, setOpen] = useState(false);
  const menuBtn = useRef(null);
  const closeBtn = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => menuBtn.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const blocks = Math.round(progress * 48) / 48;

  return (
    <>
      <header className={`${s.header} ${scrolled ? s.headerScrolled : ""}`}>
        <div className={s.headerInner}>
          <Link href="/" className={s.brandLink} aria-label="Astrail home">
            <Logo />
            <span className={s.brandTag}>open source</span>
          </Link>
          <nav aria-label="Main" className={s.desktopNav}>
            {nav.map((item) => (
              <NavLink key={item.label} item={item} active={active} className={s.navLink} />
            ))}
          </nav>
          <div className={s.headerRight}>
            <a href="#contact" className={`${s.btn} ${s.btnSm} ${s.headerCta}`}>
              let&apos;s talk!
            </a>
            <button
              ref={menuBtn}
              type="button"
              className={s.menuBtn}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(true)}
            >
              <PixelSprite rows={MENU} className={s.menuIcon} />
              <span className={s.srOnly}>Open menu</span>
            </button>
          </div>
        </div>
        <div className={s.progress} aria-hidden="true">
          <span style={{ transform: `scaleX(${blocks})` }} />
        </div>
      </header>

      {open && (
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Site menu" className={s.mobileMenu}>
          <div className={s.mobileTop}>
            <Logo />
            <button ref={closeBtn} type="button" className={s.menuBtn} onClick={close}>
              <PixelSprite rows={PLUS} className={`${s.menuIcon} ${s.closeIcon}`} />
              <span className={s.srOnly}>Close menu</span>
            </button>
          </div>
          <nav aria-label="Mobile" className={s.mobileNav}>
            {nav.map((item, i) => (
              <NavLink
                key={item.label}
                item={item}
                active={active}
                className={s.mobileLink}
                onClick={() => setOpen(false)}
              >
                <span className={s.mobileNum}>{String(i + 1).padStart(2, "0")}</span>
                <span className={s.mobileLabel} style={{ animationDelay: `${160 + i * 70}ms` }}>
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className={s.mobileBottom}>
            <a href="#contact" className={`${s.btn} ${s.btnLg} ${s.btnPaper} ${s.btnFull}`} onClick={() => setOpen(false)}>
              let&apos;s talk!
              <PixelArrow />
            </a>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- hero ---------------- */

function PopWord({ word, start, accent }) {
  return (
    <span className={`${s.word} ${accent ? s.wordAccent : ""}`}>
      {[...word].map((ch, i) => (
        <span key={i} className={s.letter} style={{ animationDelay: `${start + i * 55}ms` }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

function wordStarts(words, start) {
  const starts = [];
  words.reduce((at, w) => {
    starts.push(at);
    return at + w.length * 55 + 55;
  }, start);
  return starts;
}

function Hero() {
  const words1 = hero.line1.split(" ");
  const starts1 = wordStarts(words1, 150);
  const line1 = words1.map((w, i) => <PopWord key={w} word={w} start={starts1[i]} />);
  const words2 = [...hero.line2.split(" "), hero.line2Accent];
  const starts2 = wordStarts(words2, 760);
  const line2 = words2.map((w, i) => <PopWord key={w} word={w} start={starts2[i]} accent={i === words2.length - 1} />);

  return (
    <section id="hero" className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroDecor} aria-hidden="true">
        <PixelCloud shape="big" className={s.cloudA} />
        <PixelCloud shape="small" className={s.cloudB} />
        <PixelCloud shape="big" className={s.cloudC} />
        <PixelCloud shape="small" className={s.cloudD} />
        <PixelPlanet className={s.planetHero} />
        <PixelSprite rows={STAR} palette={{ K: C.tang }} className={`${s.star} ${s.starA}`} />
        <PixelSprite rows={STAR} palette={{ K: C.cobalt }} className={`${s.star} ${s.starB}`} />
        <PixelSprite rows={SPARKLE} palette={{ K: C.lemon }} className={`${s.star} ${s.starC}`} />
      </div>

      <div className={s.heroInner}>
        <p className={`${s.pill} ${s.popIn}`}>
          <span className={s.pillDot} />
          {hero.eyebrow}
        </p>
        <h1 id="hero-title" className={s.heroTitle}>
          <span className={s.srOnly}>
            {hero.line1} {hero.line2} {hero.line2Accent}
          </span>
          <span aria-hidden="true" className={s.heroLine1}>
            {line1}
          </span>
          <span aria-hidden="true" className={s.heroLine2}>
            {line2}
          </span>
        </h1>
        <p className={`${s.heroIntro} ${s.popIn}`} style={{ animationDelay: "1.35s" }}>
          {hero.intro}
        </p>
        <div className={`${s.heroActions} ${s.popIn}`} style={{ animationDelay: "1.5s" }}>
          <a href={links.github} className={`${s.btn} ${s.btnLg}`}>
            {hero.primary}
            <PixelArrow rotate={-45} />
          </a>
          <Link href={links.docs} className={s.textLink}>
            {hero.secondary}
            <PixelArrow />
          </Link>
        </div>
        <div className={s.heroBot}>
          <Mascot interactive rollIn firstLine={hero.mascotLine} />
        </div>
      </div>

      <div className={s.heroNotes}>
        <p className={s.noteLeft}>{hero.noteLeft}</p>
        <a href="#how-it-works" className={s.scrollCue}>
          scroll
          <PixelArrow rotate={90} />
        </a>
        <p className={s.noteRight}>{hero.noteRight}</p>
      </div>
    </section>
  );
}

/* ---------------- marquee ---------------- */

function Band({ items, tone }) {
  const list = (hidden) => (
    <ul className={s.bandList} aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item} className={s.bandItem}>
          {item}
          <PixelSprite rows={SPARKLE} className={s.bandSparkle} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`${s.band} ${tone === "ink" ? s.bandInk : s.bandTang}`}>
      <div className={`${s.bandTrack} ${tone === "ink" ? s.bandReverse : ""}`}>
        {list(false)}
        {list(true)}
      </div>
    </div>
  );
}

function Marquee() {
  return (
    <section className={s.marquee} aria-label="What Astrail works with">
      <Band items={marquee.top} tone="tang" />
      <Band items={marquee.bottom} tone="ink" />
    </section>
  );
}

/* ---------------- how it works ---------------- */

const ICONS = { spec: ICON_SPEC, shield: ICON_SHIELD, blocks: ICON_BLOCKS };
const ICON_ANIM = { spec: "wobble", shield: "float", blocks: "hop" };

function LevelCard({ item, unlocked }) {
  return (
    <li className={`${s.level} ${unlocked ? s.levelOn : ""}`}>
      <div className={s.levelTop}>
        <span>level {item.level}</span>
        <span className={s.badge}>
          {unlocked ? (
            <>
              <PixelSprite rows={CHECK} className={s.badgeIcon} />
              cleared
            </>
          ) : (
            <>
              <PixelSprite rows={LOCK} palette={{ K: "#8a8a8a" }} className={s.badgeIcon} />
              locked
            </>
          )}
        </span>
      </div>
      <div className={s.levelTile}>
        <PixelSprite
          rows={ICONS[item.icon]}
          palette={unlocked ? ICON_PALETTE : ICON_PALETTE_LOCKED}
          className={`${s.levelIcon} ${unlocked ? s[ICON_ANIM[item.icon]] : ""}`}
        />
      </div>
      <p className={s.levelStage}>stage: {item.stage}</p>
      <h3 className={s.levelTitle}>{item.title}</h3>
      <p className={s.levelText}>{item.text}</p>
    </li>
  );
}

function HowItWorks() {
  const listRef = useRef(null);
  const inView = useInView(listRef, { threshold: 0.3 });
  const reduced = useReducedMotion();
  const total = howItWorks.levels.length;
  const [unlocked, setUnlocked] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) {
      setUnlocked(total);
      return undefined;
    }
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setUnlocked(n);
      if (n >= total) clearInterval(t);
    }, 650);
    return () => clearInterval(t);
  }, [inView, reduced, total]);

  const filled = Math.round((unlocked / total) * 24);
  const t = howItWorks.terminal;

  return (
    <section id="how-it-works" className={s.dark} aria-labelledby="how-title">
      <PixelEdge color={EDGE.ink} seed={11} />
      <div className={s.container}>
        <div className={s.howGrid}>
          <Reveal variant="left">
            <p className={s.eyebrowTang}>{howItWorks.eyebrow}</p>
            <TypedHeading id="how-title" text={howItWorks.title} accentFrom={howItWorks.accentFrom} className={s.howTitle} />
            <p className={s.howText}>{howItWorks.text}</p>
            <a href={links.example} className={`${s.textLink} ${s.textLinkDark}`}>
              {howItWorks.exampleLink}
              <PixelArrow rotate={-45} />
            </a>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <RetroWindow title={t.title} className={s.terminalWindow} bodyClassName={s.terminalBody}>
              <div className={s.terminalHead}>
                <span>{t.label}</span>
                <span>{t.runtime}</span>
              </div>
              <pre className={s.pre}>
                <code>{t.code}</code>
              </pre>
              <ul className={s.results}>
                {t.results.map((r) => (
                  <li key={r.tool}>
                    <code>{r.tool}</code>
                    <span className={`${s.policy} ${s[`policy_${r.policy}`]}`}>{r.policy}</span>
                  </li>
                ))}
              </ul>
              <p className={s.caption}>{t.caption}</p>
            </RetroWindow>
          </Reveal>
        </div>

        <ol ref={listRef} className={s.levels} aria-label="What is included">
          {howItWorks.levels.map((item, i) => (
            <LevelCard key={item.level} item={item} unlocked={i < unlocked} />
          ))}
        </ol>

        <div className={s.xpRow}>
          <span className={s.xpLabel}>xp</span>
          <span className={s.xpBar} aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} className={i < filled ? s.xpOn : ""} />
            ))}
          </span>
          <span className={s.xpCount} aria-label={`${unlocked} of ${total} levels cleared`}>
            {unlocked}/{total}
          </span>
          <a href={links.github} className={`${s.xpLink} ${unlocked >= total ? s.xpLinkDone : ""}`}>
            {unlocked >= total ? howItWorks.xpDone : howItWorks.xpStart}
            <PixelArrow rotate={-45} />
          </a>
        </div>
      </div>
      <PixelEdge color={EDGE.ink} seed={23} flip />
    </section>
  );
}

/* ---------------- contact ---------------- */

function Contact() {
  const d = contact.docs;
  return (
    <section id="contact" className={s.contact} aria-labelledby="contact-title">
      <PixelEdge color={EDGE.tang} seed={37} />
      <PixelPlanet color="rgba(21,19,26,.22)" ring="rgba(21,19,26,.22)" moon="rgba(21,19,26,.22)" className={s.planetContact} />
      <div className={`${s.container} ${s.contactGrid}`}>
        <div className={s.contactLeft}>
          <Reveal variant="left">
            <p className={s.eyebrowInk}>{contact.eyebrow}</p>
            <h2 id="contact-title" className={s.contactTitle}>
              {contact.title}
            </h2>
            <p className={s.contactText}>{contact.text}</p>
          </Reveal>
          <Reveal variant="left" delay={140}>
            <RetroWindow title={d.window} tone="ink" className={s.docsWindow}>
              <h3 className={s.docsTitle}>{d.title}</h3>
              <p className={s.docsText}>{d.text}</p>
              <div className={s.docsLinks}>
                <Link href={links.docs} className={s.textLink}>
                  {d.browse}
                  <PixelArrow />
                </Link>
                <a href={links.limitations} className={s.textLink}>
                  {d.limits}
                  <PixelArrow rotate={-45} />
                </a>
              </div>
            </RetroWindow>
          </Reveal>
          <div className={s.contactBot}>
            <Mascot interactive firstLine={contact.mascotLine} />
          </div>
        </div>
        <Reveal variant="right" delay={120}>
          <RetroWindow title={contact.form.window} tone="ink" className={s.formWindow}>
            <ContactForm />
          </RetroWindow>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- footer ---------------- */

function Footer() {
  const [year, setYear] = useState(null);
  useEffect(() => setYear(new Date().getFullYear()), []);
  return (
    <footer className={s.footer}>
      <PixelEdge color={EDGE.ink} seed={53} />
      <div className={`${s.container} ${s.footerGrid}`}>
        <div>
          <Link href="/" aria-label="Astrail home" className={s.brandLink}>
            <Logo dark />
          </Link>
          <p className={s.footerBlurb}>{footer.blurb}</p>
        </div>
        <nav aria-label="Footer" className={s.footerCol}>
          <p className={s.footerHead}>explore</p>
          <ul>
            {footer.explore.map((l) => (
              <li key={l.label}>
                {l.href.startsWith("/") ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
              </li>
            ))}
          </ul>
        </nav>
        <div className={s.footerCol}>
          <p className={s.footerHead}>community</p>
          <ul>
            {footer.community.map((l) => (
              <li key={l.label}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
        <div className={s.footerCol}>
          <p className={s.footerHead}>say hi</p>
          <p className={s.footerBlurb}>{footer.sayHi}</p>
          <a href="#contact" className={s.footerCta}>
            send a message
            <PixelArrow />
          </a>
        </div>
      </div>
      <div className={s.wordmark} aria-hidden="true">
        {[..."astrail"].map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </div>
      <div className={`${s.container} ${s.footerBottom}`}>
        <span>
          {year ? `© ${year} ` : ""}
          {footer.license}
        </span>
        <span>{footer.tagline}</span>
        <a href="#hero" className={s.backTop}>
          back to top
          <PixelArrow rotate={-90} />
        </a>
      </div>
    </footer>
  );
}

/* ---------------- page ---------------- */

export default function App() {
  return (
    <div className={s.site} data-pixel-site="">
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Marquee />
        <HowItWorks />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}


