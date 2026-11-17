/*
 * Astrail pixel sprites.
 * Every sprite is a grid of characters. "." is transparent, every other
 * character maps to a color token through a palette. Larger sprites are
 * generated with deterministic integer math so every render is identical.
 */

export const C = {
  tang: "var(--px-tang)",
  tangDeep: "var(--px-tang-deep)",
  tangSoft: "var(--px-tang-soft)",
  cobalt: "var(--px-cobalt)",
  cobaltDeep: "var(--px-cobalt-deep)",
  cobaltLight: "var(--px-cobalt-light)",
  cobaltSoft: "var(--px-cobalt-soft)",
  lemon: "var(--px-lemon)",
  ink: "var(--px-ink)",
  paper: "var(--px-paper)",
  white: "#ffffff",
  cream: "var(--px-cream)",
  grey: "#9a9a9a",
  greyLight: "#ececec",
  cloudShade: "#e9e3d8",
  cloudLine: "#d6cfc2",
};

/* ---------- helpers ---------- */

function grid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill("."));
}

function rect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch;
}

function px(g, x, y, ch) {
  if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch;
}

function toRows(g) {
  return g.map((r) => r.join(""));
}

/** Mask helpers: a mask is a Set of "x,y" keys. */
function maskRect(m, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.add(`${x},${y}`);
}
function maskCut(m, pts) {
  pts.forEach(([x, y]) => m.delete(`${x},${y}`));
}

/**
 * Paint a shaded blob: fill, 1px highlight on top edges, 1px shade on
 * bottom edges, 1px outline around it (4-neighbour so diagonals stay clean).
 */
function paintBlob(g, mask, { fill, light, shade, outline, skipOutlineBelow = false }) {
  const has = (x, y) => mask.has(`${x},${y}`);
  mask.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    let ch = fill;
    if (shade && !has(x, y + 1)) ch = shade;
    if (light && !has(x, y - 1)) ch = light;
    px(g, x, y, ch);
  });
  if (!outline) return;
  mask.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      if (skipOutlineBelow && dy === 1) return;
      const nx = x + dx;
      const ny = y + dy;
      if (!has(nx, ny)) px(g, nx, ny, outline);
    });
  });
}

/* ---------- the mascot: "railbot" the skateboarding robot ---------- */

export const BOT_W = 34;
export const BOT_H = 38;

const botPalette = {
  K: C.ink,
  C: C.cobalt,
  L: C.cobaltLight,
  S: C.cobaltDeep,
  T: C.tang,
  D: C.tangDeep,
  P: C.tangSoft,
  W: C.cream,
  Y: C.lemon,
  g: C.grey,
  w: C.greyLight,
};

function buildBotBody() {
  const g = grid(BOT_W, BOT_H);

  // antenna
  rect(g, 16, 4, 16, 5, "K");
  const ball = new Set();
  maskRect(ball, 15, 0, 17, 2);
  paintBlob(g, ball, { fill: "T", light: "P", shade: "D", outline: "K" });

  // ears / bolts
  rect(g, 4, 9, 5, 12, "g");
  rect(g, 3, 9, 3, 12, "K");
  rect(g, 4, 8, 5, 8, "K");
  rect(g, 4, 13, 5, 13, "K");
  rect(g, 28, 9, 29, 12, "g");
  rect(g, 30, 9, 30, 12, "K");
  rect(g, 28, 8, 29, 8, "K");
  rect(g, 28, 13, 29, 13, "K");

  // head
  const head = new Set();
  maskRect(head, 7, 7, 26, 16);
  maskCut(head, [[7, 7], [26, 7], [7, 16], [26, 16]]);
  paintBlob(g, head, { fill: "C", light: "L", shade: "S", outline: "K" });

  // visor
  rect(g, 10, 8, 23, 12, "K");
  px(g, 10, 8, "C");
  px(g, 23, 8, "C");
  px(g, 10, 12, "C");
  px(g, 23, 12, "C");
  px(g, 11, 9, "g"); // visor glare

  // smile + blush
  rect(g, 15, 15, 18, 15, "K");
  px(g, 14, 14, "K");
  px(g, 19, 14, "K");
  rect(g, 11, 14, 12, 14, "T");
  rect(g, 21, 14, 22, 14, "T");

  // neck
  rect(g, 14, 18, 19, 18, "g");
  px(g, 13, 18, "K");
  px(g, 20, 18, "K");
  px(g, 15, 18, "w");

  // arms
  const armL = new Set();
  maskRect(armL, 6, 20, 8, 25);
  const armR = new Set();
  maskRect(armR, 25, 20, 27, 25);
  paintBlob(g, armL, { fill: "C", light: "L", shade: "S", outline: "K" });
  paintBlob(g, armR, { fill: "C", light: "L", shade: "S", outline: "K" });
  rect(g, 6, 24, 8, 25, "T");
  rect(g, 25, 24, 27, 25, "T");
  rect(g, 6, 25, 8, 25, "D");
  rect(g, 25, 25, 27, 25, "D");

  // body
  const body = new Set();
  maskRect(body, 10, 20, 23, 27);
  maskCut(body, [[10, 27], [23, 27]]);
  paintBlob(g, body, { fill: "C", light: "L", shade: "S", outline: "K" });

  // chest panel
  rect(g, 13, 22, 20, 26, "K");
  rect(g, 14, 23, 19, 25, "W");
  rect(g, 14, 24, 15, 24, "T");
  rect(g, 18, 24, 19, 24, "Y");
  px(g, 16, 23, "C");
  px(g, 17, 23, "C");

  // legs (feet stand flush on the deck)
  const legL = new Set();
  maskRect(legL, 12, 29, 14, 30);
  const legR = new Set();
  maskRect(legR, 19, 29, 21, 30);
  paintBlob(g, legL, { fill: "S", outline: "K", skipOutlineBelow: true });
  paintBlob(g, legR, { fill: "S", outline: "K", skipOutlineBelow: true });
  px(g, 16, 30, "K"); // toes point forward
  px(g, 23, 30, "K");

  return toRows(g);
}

function buildBoard() {
  const g = grid(BOT_W, BOT_H);
  rect(g, 3, 31, 30, 31, "K");
  px(g, 2, 30, "K");
  px(g, 1, 29, "K");
  px(g, 31, 30, "K");
  px(g, 32, 29, "K");
  rect(g, 3, 32, 30, 32, "T");
  px(g, 2, 32, "K");
  px(g, 31, 32, "K");
  rect(g, 3, 33, 30, 33, "K");
  rect(g, 7, 34, 10, 34, "g");
  rect(g, 23, 34, 26, 34, "g");
  return toRows(g);
}

function buildWheel(cx) {
  const g = grid(BOT_W, BOT_H);
  // 5x3 visible wheel region y 35..37 plus centered 5x5 for symmetric spin
  const x0 = cx - 2;
  const y0 = 33;
  const ring = [
    ".KKK.",
    "KwwwK",
    "KwKgK",
    "KwwwK",
    ".KKK.",
  ];
  ring.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== "." && px(g, x0 + dx, y0 + dy, ch)));
  return toRows(g);
}

function buildEyes(open) {
  const g = grid(BOT_W, BOT_H);
  if (open) {
    rect(g, 13, 9, 14, 11, "W");
    rect(g, 19, 9, 20, 11, "W");
    px(g, 14, 9, "Y");
    px(g, 20, 9, "Y");
  } else {
    rect(g, 13, 11, 14, 11, "W");
    rect(g, 19, 11, 20, 11, "W");
  }
  return toRows(g);
}

export const BOT = {
  palette: botPalette,
  body: buildBotBody(),
  board: buildBoard(),
  wheelBack: buildWheel(9),
  wheelFront: buildWheel(25),
  eyesOpen: buildEyes(true),
  eyesClosed: buildEyes(false),
};

/* ---------- logo mark: railbot head bust 14 x 12 ---------- */

function buildLogo(outline, glint) {
  const g = grid(14, 12);
  rect(g, 6, 0, 7, 0, "T");
  rect(g, 6, 1, 7, 1, "K");
  const head = new Set();
  maskRect(head, 2, 3, 11, 10);
  maskCut(head, [[2, 3], [11, 3], [2, 10], [11, 10]]);
  paintBlob(g, head, { fill: "C", light: "L", shade: "S", outline: "K" });
  rect(g, 4, 5, 9, 7, "K");
  px(g, 5, 6, "W");
  px(g, 8, 6, "W");
  px(g, 6, 9, "K");
  px(g, 7, 9, "K");
  px(g, 4, 9, "T");
  px(g, 9, 9, "T");
  rect(g, 0, 6, 0, 7, "K");
  rect(g, 13, 6, 13, 7, "K");
  rect(g, 1, 11, 12, 11, "K");
  const rows = toRows(g);
  return {
    rows,
    palette: { K: outline, C: C.cobalt, L: C.cobaltLight, S: C.cobaltDeep, T: C.tang, W: glint },
  };
}

export const LOGO = buildLogo(C.ink, C.cream);
export const LOGO_DARK = buildLogo(C.paper, C.cream);

/* ---------- clouds ---------- */

function buildCloud(w, h, circles) {
  const g = grid(w, h);
  const mask = new Set();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const inside = circles.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
      if (inside) mask.add(`${x},${y}`);
    }
  }
  const has = (x, y) => mask.has(`${x},${y}`);
  mask.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    px(g, x, y, !has(x, y + 1) || !has(x, y + 2) ? "h" : "W");
  });
  mask.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      if (!has(x + dx, y + dy)) px(g, x + dx, y + dy, "o");
    });
  });
  return toRows(g);
}

const cloudPalette = { W: C.white, h: C.cloudShade, o: C.cloudLine };
export const CLOUD_BIG = {
  rows: buildCloud(26, 10, [[9, 6, 4.6], [15, 5.4, 4], [20.5, 6.6, 3], [5, 7.4, 2.4], [13, 8.5, 2], [18, 8.5, 2]]),
  palette: cloudPalette,
};
export const CLOUD_SMALL = {
  rows: buildCloud(18, 8, [[7, 4.8, 3.6], [11.8, 5.2, 2.8], [4, 5.8, 2], [9, 6.5, 2]]),
  palette: cloudPalette,
};

/* ---------- line-art planet (orbit) 27 x 27 ---------- */

function buildPlanet() {
  const S = 27;
  const g = grid(S, S);
  const c = 13;
  const r = 7.2;
  const set = (x, y, ch) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && ix < S && iy >= 0 && iy < S) g[iy][ix] = ch;
  };
  // planet outline
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180;
    set(c + r * Math.cos(a), c + r * Math.sin(a), "K");
  }
  // inner crescent shade line
  for (let i = 200; i < 300; i++) {
    const a = (i * Math.PI) / 180;
    set(c + 1 + (r - 3) * Math.cos(a), c + 1 + (r - 3) * Math.sin(a), "K");
  }
  // tilted ring, hidden behind planet on the back half
  const tilt = (-24 * Math.PI) / 180;
  for (let i = 0; i < 720; i++) {
    const t = (i * Math.PI) / 360;
    const ex = 12.4 * Math.cos(t);
    const ey = 3.4 * Math.sin(t);
    const x = c + ex * Math.cos(tilt) - ey * Math.sin(tilt);
    const y = c + ex * Math.sin(tilt) + ey * Math.cos(tilt);
    const back = Math.sin(t) < 0;
    const inside = (x - c) ** 2 + (y - c) ** 2 < (r + 0.6) ** 2;
    if (back && inside) continue;
    if (!back && inside) {
      set(x, y, "R");
      continue;
    }
    set(x, y, "R");
  }
  // moon
  set(23, 4, "M");
  set(24, 4, "M");
  set(23, 5, "M");
  set(24, 5, "M");
  return toRows(g);
}
export const PLANET = buildPlanet();

/* ---------- pixel edge (jagged skyline) ---------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function edgeHeights(seed, columns = 360) {
  const rand = mulberry32(seed);
  const heights = [];
  let h = 3;
  for (let i = 0; i < columns; i++) {
    const r = rand();
    if (r < 0.28) h -= 1;
    else if (r > 0.72) h += 1;
    h = Math.max(1, Math.min(6, h));
    let col = h;
    if (rand() < 0.05) col = Math.min(8, h + 2 + Math.floor(rand() * 2));
    // keep short runs so the edge reads as chunky blocks
    const run = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < run && heights.length < columns; k++) heights.push(k === 0 ? col : h);
    i += run - 1;
  }
  return heights.slice(0, columns);
}

/* ---------- small hand-drawn sprites ---------- */

export const SPARKLE = [
  "...K...",
  "...K...",
  "..KKK..",
  "KKKKKKK",
  "..KKK..",
  "...K...",
  "...K...",
];

export const ARROW = [
  "....K...",
  "....KK..",
  "KKKKKKK.",
  "KKKKKKKK",
  "KKKKKKK.",
  "....KK..",
  "....K...",
];

export const PLUS = [
  "..KK..",
  "..KK..",
  "KKKKKK",
  "KKKKKK",
  "..KK..",
  "..KK..",
];

export const MENU = [
  "KKKKKKK",
  ".......",
  "KKKKKKK",
  ".......",
  "KKKKKKK",
];

export const CHECK = [
  ".......K",
  "......KK",
  "K....KK.",
  "KK..KK..",
  ".KKKK...",
  "..KK....",
];

export const LOCK = [
  "...KKK...",
  "..K...K..",
  "..K...K..",
  ".KKKKKKK.",
  ".K.....K.",
  ".K..K..K.",
  ".K..K..K.",
  ".K.....K.",
  ".KKKKKKK.",
];

export const STAR = [
  "..K..",
  "..K..",
  "KKKKK",
  "..K..",
  "..K..",
];

export const WIN_MIN = [".....", ".....", ".....", ".....", "KKKKK"];
export const WIN_MAX = ["KKKKK", "K...K", "K...K", "K...K", "KKKKK"];
export const WIN_CLOSE = ["K...K", ".K.K.", "..K..", ".K.K.", "K...K"];

/* level icons */
export const ICON_SPEC = [
  "KKKKKKK....",
  "KWWWWWKK...",
  "KWWWWWKWK..",
  "KWWWWWKKKK.",
  "KWTTTTTWWK.",
  "KWWWWWWWWK.",
  "KWCCCCCCWK.",
  "KWWWWWWWWK.",
  "KWTTTTWWWK.",
  "KWWWWWWWWK.",
  "KWCCCCCWWK.",
  "KKKKKKKKKK.",
];

export const ICON_SHIELD = [
  ".KKKKKKKKK.",
  "KCCCCCCCCCK",
  "KCLLCCCCWCK",
  "KCLCCCCWWCK",
  "KCWCCCWWCCK",
  "KCWWCWWCCCK",
  "KCCWWWCCCCK",
  ".KCCWCCCCK.",
  ".KCCCCCCCK.",
  "..KCCCCCK..",
  "...KCCCK...",
  "....KKK....",
];

export const ICON_BLOCKS = [
  "...KKKKK...",
  "...KTTTK...",
  "...KTPTK...",
  "...KTTTK...",
  "KKKKKKKKKKK",
  "KCCCCKYYYYK",
  "KCLCCKYWYYK",
  "KCCCCKYYYYK",
  "KCCCCKYYYYK",
  "KKKKKKKKKKK",
];

export const ICON_PALETTE = {
  K: C.ink,
  W: C.cream,
  T: C.tang,
  P: C.tangSoft,
  C: C.cobalt,
  L: C.cobaltLight,
  Y: C.lemon,
};

export const ICON_PALETTE_LOCKED = {
  K: "#6b6b6b",
  W: "#3d3d3d",
  T: "#2b2b2b",
  P: "#3d3d3d",
  C: "#2b2b2b",
  L: "#3d3d3d",
  Y: "#3d3d3d",
};
