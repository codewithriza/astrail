"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./landing.module.css";
import {
  ARROW,
  C,
  CLOUD_BIG,
  CLOUD_SMALL,
  LOGO,
  LOGO_DARK,
  PLANET,
  WIN_CLOSE,
  WIN_MAX,
  WIN_MIN,
  edgeHeights,
} from "./sprites";

/* ---------- rendering ---------- */

/** Merge each row into runs of equal color, one <path> per color. */
export function rowsToPaths(rows, palette = {}) {
  const byColor = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ".") {
        x += 1;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === ch) end += 1;
      const color = palette[ch] ?? "currentColor";
      const d = byColor.get(color) ?? [];
      d.push(`M${x} ${y}h${end - x + 1}v1h-${end - x + 1}z`);
      byColor.set(color, d);
      x = end + 1;
    }
  });
  return [...byColor.entries()].map(([color, d]) => ({ color, d: d.join("") }));
}

function Paths({ rows, palette }) {
  const paths = useMemo(() => rowsToPaths(rows, palette), [rows, palette]);
  return paths.map((p) => <path key={p.color} d={p.d} fill={p.color} />);
}

export function PixelSprite({ rows, palette, label, className, style }) {
  const w = rows[0].length;
  const h = rows.length;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: "false" };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={[s.sprite, className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${w} / ${h}`, ...style }}
      {...a11y}
    >
      <Paths rows={rows} palette={palette} />
    </svg>
  );
}

/** Several same-size layers in one SVG, each with its own animation class. */
export function PixelStack({ layers, label, className, style }) {
  const w = layers[0].rows[0].length;
  const h = layers[0].rows.length;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: "false" };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={[s.sprite, className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${w} / ${h}`, ...style }}
      {...a11y}
    >
      {layers.map((layer, i) => (
        <g key={i} className={layer.className}>
          <Paths rows={layer.rows} palette={layer.palette} />
        </g>
      ))}
    </svg>
  );
}

export function PixelArrow({ rotate = 0, className }) {
  return (
    <PixelSprite
      rows={ARROW}
      className={[s.arrow, className].filter(Boolean).join(" ")}
      style={rotate ? { "--rot": `${rotate}deg` } : undefined}
    />
  );
}

/* ---------- hooks ---------- */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useInView(ref, { once = true, threshold = 0.2, rootMargin = "0px 0px -8% 0px" } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold, rootMargin]);
  return inView;
}

/* ---------- building blocks ---------- */

export function Reveal({ as: Tag = "div", variant = "up", delay = 0, className, children, ...rest }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  return (
    <Tag
      ref={ref}
      className={[s.reveal, s[`reveal_${variant}`], inView ? s.revealIn : "", className].filter(Boolean).join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Logo({ dark = false }) {
  const mark = dark ? LOGO_DARK : LOGO;
  return (
    <span className={`${s.logo} ${dark ? s.logoDark : ""}`}>
      <PixelSprite rows={mark.rows} palette={mark.palette} className={s.logoMark} />
      <span className={s.logoWord}>astrail</span>
    </span>
  );
}

export function RetroWindow({ title, tone = "tang", className, children, bodyClassName }) {
  return (
    <div className={[s.window, className].filter(Boolean).join(" ")}>
      <div className={`${s.windowBar} ${tone === "ink" ? s.windowBarInk : ""}`}>
        <span className={s.windowIcon} aria-hidden="true" />
        <span className={s.windowTitle}>{title}</span>
        <span className={s.windowButtons} aria-hidden="true">
          {[WIN_MIN, WIN_MAX, WIN_CLOSE].map((rows, i) => (
            <span key={i} className={s.windowBtn}>
              <PixelSprite rows={rows} palette={{ K: C.ink }} />
            </span>
          ))}
        </span>
      </div>
      <div className={[s.windowBody, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </div>
  );
}

export function PixelCloud({ shape = "big", className, style }) {
  const c = shape === "big" ? CLOUD_BIG : CLOUD_SMALL;
  return <PixelSprite rows={c.rows} palette={c.palette} className={[s.cloud, className].filter(Boolean).join(" ")} style={style} />;
}

export function PixelPlanet({ color = C.cobalt, ring = C.tang, moon = C.lemon, className, style }) {
  return <PixelSprite rows={PLANET} palette={{ K: color, R: ring, M: moon }} className={className} style={style} />;
}

/** Jagged skyline edge. Drawn at a fixed pixel size and cropped, never stretched. */
export function PixelEdge({ color, seed = 1, flip = false }) {
  const d = useMemo(() => {
    const heights = edgeHeights(seed);
    return heights.map((h, x) => `M${x} ${8 - h}h1v${h}h-1z`).join("");
  }, [seed]);
  return (
    <div className={`${s.edge} ${flip ? s.edgeFlip : ""}`} aria-hidden="true">
      <svg viewBox="0 0 360 8" shapeRendering="crispEdges" preserveAspectRatio="xMinYMax meet">
        <path d={d} fill={color} />
      </svg>
    </div>
  );
}

/** Heading that types itself out once visible. Screen readers get the full text. */
export function TypedHeading({ as: Tag = "h2", text, id, speed = 85, accentFrom = -1, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) {
      setCount(text.length);
      return undefined;
    }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [inView, reduced, speed, text]);
  return (
    <Tag ref={ref} id={id} className={[s.typed, className].filter(Boolean).join(" ")}>
      <span className={s.srOnly}>{text}</span>
      <span aria-hidden="true">
        {[...text].map((ch, i) => (
          <span
            key={i}
            className={[i < count ? "" : s.typedHidden, accentFrom >= 0 && i >= accentFrom ? s.typedAccent : ""].filter(Boolean).join(" ")}
          >
            {ch}
          </span>
        ))}
        <span className={s.typedCursor} />
      </span>
    </Tag>
  );
}
