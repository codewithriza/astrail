"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import { PixelStack } from "./pixel-ui";
import { BOT } from "./sprites";
import { mascotLines } from "./content";

/**
 * Railbot: Astrail's skateboarding robot.
 * interactive: one button that kickflips on every click and cycles the bubble.
 */
export default function Mascot({ interactive = false, rollIn = false, firstLine = "beep! tap me", bubble = true, ollieOnce = false, className }) {
  const [tricks, setTricks] = useState(0);
  const [ollieKey, setOllieKey] = useState(ollieOnce ? 1 : 0);
  const robotRef = useRef(null);

  const line = tricks === 0 ? firstLine : mascotLines[(tricks - 1) % mascotLines.length];

  useEffect(() => {
    if (!ollieKey || !robotRef.current) return;
    const el = robotRef.current;
    el.classList.remove(s.ollie);
    // restart the animation on every click
    void el.offsetWidth;
    el.classList.add(s.ollie);
  }, [ollieKey]);

  const art = (
    <span ref={robotRef} className={s.botArt}>
      <PixelStack
        className={s.botSvg}
        layers={[
          { rows: BOT.board, palette: BOT.palette },
          { rows: BOT.wheelBack, palette: BOT.palette, className: s.wheel },
          { rows: BOT.wheelFront, palette: BOT.palette, className: s.wheel },
          { rows: BOT.body, palette: BOT.palette, className: s.bob },
          { rows: BOT.eyesOpen, palette: BOT.palette, className: `${s.bob} ${s.eyeOpen}` },
          { rows: BOT.eyesClosed, palette: BOT.palette, className: `${s.bob} ${s.eyeClosed}` },
        ]}
      />
    </span>
  );

  return (
    <div className={[s.mascot, rollIn ? s.rollIn : "", className].filter(Boolean).join(" ")}>
      {bubble && (
        <span className={s.bubble} aria-hidden="true">
          <span key={line} className={s.bubbleText}>
            {line}
          </span>
        </span>
      )}
      {interactive ? (
        <>
          <button
            type="button"
            className={s.botButton}
            aria-label="Make the robot do a kickflip"
            onClick={() => {
              setTricks((t) => t + 1);
              setOllieKey((k) => k + 1);
            }}
          >
            {art}
          </button>
          <span className={s.srOnly} aria-live="polite">
            {tricks > 0 ? `Tricks landed: ${tricks}` : ""}
          </span>
        </>
      ) : (
        art
      )}
    </div>
  );
}
