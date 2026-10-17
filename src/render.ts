import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { center, menu, rect, type ReadState, type Dir } from "./model";
import { distance } from "./simulation";
export const BACKGROUND = "#02090e";
const cyan = "#83f8ef",
  dim = "#567c87",
  white = "#d7f3ee",
  amber = "#ffac66";
const font = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
type Ctx = CanvasRenderingContext2D;
function text(
  ctx: Ctx,
  t: string,
  x: number,
  y: number,
  size = 16,
  color = white,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}
function line(
  ctx: Ctx,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#16323d",
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function disc(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function glow(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function sprite(
  ctx: Ctx,
  s: ReadState,
  name: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const image = s.assets[name]?.[frame];
  if (image)
    ctx.drawImage(image as ImageBitmap, x - size / 2, y - size / 2, size, size);
}
function facing(dir: Dir) {
  return { down: 0, up: 2, left: 4, right: 6 }[dir];
}
function mote(ctx: Ctx, b: { x: number; y: number }) {
  glow(ctx, b.x, b.y, 19, "#ff854d70");
  disc(ctx, b.x, b.y, 3, amber);
  disc(ctx, b.x, b.y, 1.3, "#ffe0b5");
}
function terrain(ctx: Ctx, s: ReadState, full = false) {
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const vis = s.visibility[y][x];
      if (vis === "u" && !full) continue;
      const ch = s.tiles[y][x],
        c = center(x, y);
      let frame = 16;
      if (ch === "#")
        frame =
          (s.tiles[y - 1]?.[x] === "#" ? 1 : 0) +
          (s.tiles[y]?.[x + 1] === "#" ? 2 : 0) +
          (s.tiles[y + 1]?.[x] === "#" ? 4 : 0) +
          (s.tiles[y]?.[x - 1] === "#" ? 8 : 0);
      if (ch === "g") frame = 18;
      ctx.globalAlpha = full || vis === "l" ? 1 : 0.27;
      sprite(ctx, s, "trench-walls", frame, c.x, c.y);
      if (s.plankton[y][x] === "*" && ch === ".") {
        ctx.fillStyle = vis === "l" || full ? "#a9e7d8" : "#537880";
        ctx.beginPath();
        ctx.arc(c.x, c.y, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
        ctx.fill();
        if (vis === "l" || full) {
          glow(ctx, c.x, c.y, 8, "#62dfc535");
          disc(ctx, c.x, c.y, 1, "#eaffea");
        }
      }
    }
  ctx.globalAlpha = 1;
}
function board(ctx: Ctx, s: ReadState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.save();
  ctx.beginPath();
  ctx.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
  ctx.clip();
  terrain(ctx, s);
  glow(ctx, s.forager.x, s.forager.y, s.windowRadius, "#176b7024");
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") mote(ctx, p);
  for (const d of s.drifters) mote(ctx, d);
  ctx.restore();
  // A flare is an independent aperture through the outer darkness.
  for (const p of s.predators)
    if (p.flaring) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      terrain(ctx, s, true);
      ctx.restore();
    }
  ctx.save();
  ctx.beginPath();
  ctx.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
  ctx.clip();
  for (const cloud of s.inkClouds) {
    ctx.globalAlpha = Math.min(1, cloud.remaining);
    glow(ctx, cloud.x, cloud.y, cloud.radius * 1.2, "#000308f0");
    disc(ctx, cloud.x, cloud.y, cloud.radius * 0.7, "#00040bd0");
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  for (const pulse of s.pulses) {
    const color =
      pulse.tint === "cyan"
        ? cyan
        : pulse.tint === "violet"
          ? "#c095ff"
          : "#ff9b56";
    for (let j = 0; j < pulse.distances.length; j++) {
      const d = pulse.distances[j],
        delta = pulse.front - d;
      if (d < 0 || d > pulse.range || delta < -0.3 || delta > 1.3) continue;
      const b = center(j % C.GRID_COLS, Math.floor(j / C.GRID_COLS));
      ctx.globalAlpha = Math.max(0, 1 - Math.abs(delta) / 1.3) * 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 12, b.y - 12, 24, 24);
      glow(ctx, b.x, b.y, 23, color + "40");
    }
    ctx.globalAlpha = 1;
  }
  for (const d of s.drifters)
    if (
      d.lit &&
      (distance(d, s.forager) <= s.windowRadius ||
        s.predators.some((p) => p.flaring && distance(p, d) <= C.FLARE_RADIUS))
    )
      sprite(ctx, s, "drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
  for (const p of s.predators) {
    if (p.lit) {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.simTime * 8) % 8)
          : facing(p.dir) + (Math.floor(s.simTime * 7) % 2);
      ctx.globalAlpha =
        p.mark > 0 && !p.alert && distance(p, s.forager) > s.visionRadius
          ? Math.min(1, p.mark / 0.6)
          : 1;
      sprite(ctx, s, p.kind, frame, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (p.alert) {
      const t = 1 - p.alertLeft / C.ALERT_TIME,
        r = 12 + t * 31;
      ctx.strokeStyle = p.kind === "gloamfin" ? "#cfacff" : "#ffba76";
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(a) * r,
          p.y + Math.sin(a) * r,
          p.x + Math.cos(a) * (r + 10),
          p.y + Math.sin(a) * (r + 10),
          ctx.strokeStyle,
        );
      }
      ctx.globalAlpha = 1;
    }
    if (p.kind === "flarefish" && (p.flarePhase > 0 || p.fade > 0)) {
      const frame =
        p.fade > 0
          ? 6 + Math.min(1, Math.floor((0.4 - p.fade) * 5))
          : p.flareCharging
            ? Math.min(2, Math.floor((p.flarePhase / C.FLARE_CHARGE) * 3))
            : 3 +
              Math.min(
                2,
                Math.floor(
                  ((p.flarePhase - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3,
                ),
              );
      sprite(ctx, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
    }
  }
  glow(ctx, s.forager.x, s.forager.y, 44, "#5bf6dd40");
  sprite(
    ctx,
    s,
    "glimmerfin",
    facing(s.forager.dir) +
      (s.forager.moving ? Math.floor(s.simTime * 9) % 2 : 0),
    s.forager.x,
    s.forager.y,
  );
  ctx.restore();
  // Fine cartographic ticks frame the viewport, without disclosing its contents.
  for (let x = 64; x <= 1216; x += 96) {
    line(ctx, x, 75, x, 79);
    line(ctx, x, 657, x, 662);
  }
  for (let y = 80; y <= 656; y += 96) {
    line(ctx, 57, y, 63, y);
    line(ctx, 1217, y, 1223, y);
  }
}
function gauge(
  ctx: Ctx,
  label: string,
  key: string,
  x: number,
  amount: number,
) {
  text(ctx, label, x, 682, 12, amount === 1 ? cyan : dim);
  text(ctx, key, x + 152, 682, 11, dim, "right");
  ctx.fillStyle = "#10232b";
  ctx.fillRect(x, 692, 152, 4);
  ctx.fillStyle = amount === 1 ? cyan : "#417e88";
  ctx.fillRect(x, 692, 152 * Math.max(0, amount), 4);
}
function hud(ctx: Ctx, s: ReadState) {
  text(ctx, C.TITLE_TEXT, 64, 34, 22, cyan);
  text(ctx, C.DIVE_LABEL, 65, 56, 11, dim);
  text(ctx, "SCORE", 434, 26, 10, dim);
  text(ctx, String(s.score).padStart(6, "0"), 640, 59, 48, white, "center");
  text(ctx, `${s.planktonRemaining} MOTES REMAIN`, 1216, 31, 12, dim, "right");
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1216,
    55,
    10,
    dim,
    "right",
  );
  line(ctx, 64, 69, 1216, 69);
  line(ctx, 64, 665, 1216, 665);
  for (let i = 0; i < s.lives; i++)
    sprite(ctx, s, "glimmerfin", 6, 79 + i * 29, 691, 24);
  text(ctx, `DEPTH ${s.depth}`, 243, 695, 16, white);
  gauge(ctx, "SONAR", "SPACE", 470, 1 - s.sonar.cooldown / C.SONAR_COOLDOWN);
  gauge(ctx, "INK", "SHIFT", 678, 1 - s.ink.cooldown / C.INK_COOLDOWN);
  text(ctx, "WASD / ARROWS  SWIM", 1216, 684, 10, dim, "right");
  text(ctx, "ESC / P  PAUSE", 1216, 704, 10, dim, "right");
}
function panel(ctx: Ctx) {
  ctx.fillStyle = "#02090ee8";
  ctx.fillRect(340, 190, 600, 405);
  line(ctx, 340, 190, 940, 190, "#27535e");
  line(ctx, 340, 595, 940, 595, "#27535e");
}
function menus(ctx: Ctx, s: ReadState) {
  menu(s).forEach((item, i) => {
    const r = rect(s, i);
    if (!r) return;
    const active = s.menuIndex === i;
    ctx.fillStyle = active ? "#103039" : "#07141c";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? "#558e93" : "#16303a";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (active) {
      ctx.fillStyle = cyan;
      ctx.fillRect(r.x, r.y, 3, r.h);
      text(ctx, "›", r.x + 18, r.y + 32, 23, cyan);
    }
    text(ctx, item, r.x + r.w / 2, r.y + 31, 16, active ? cyan : dim, "center");
    text(
      ctx,
      `0${i + 1}`,
      r.x + r.w - 15,
      r.y + 30,
      10,
      active ? "#659d9e" : "#29434c",
      "right",
    );
  });
}
function title(ctx: Ctx, s: ReadState) {
  // Static bathymetric linework: a quiet, deliberately composed trench chart.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#1a5260";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    for (let j = 0; j <= 100; j++) {
      const a = (j / 100) * Math.PI * 2,
        rx = 270 + i * 36,
        ry = 170 + i * 20;
      const x = 640 + Math.cos(a) * rx + Math.sin(a * 5) * 12,
        y = 346 + Math.sin(a) * ry + Math.cos(a * 7) * 8;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, 640, 260, 310, "#12696d28");
  text(
    ctx,
    "A B I O L U M I N E S C E N T   D E S C E N T",
    640,
    139,
    11,
    dim,
    "center",
  );
  text(ctx, C.TITLE_TEXT, 640, 274, 112, cyan, "center");
  text(ctx, C.TAGLINE_TEXT.split("").join(" "), 640, 316, 16, white, "center");
  line(ctx, 556, 345, 724, 345, "#34636b");
  disc(ctx, 640, 345, 3, cyan);
  menus(ctx, s);
  text(
    ctx,
    "Your light is a lifeline. And a lure.",
    640,
    554,
    14,
    "#86a6ac",
    "center",
  );
  text(
    ctx,
    "SWIM  WASD / ↑↓←→     SONAR  SPACE     INK  SHIFT",
    640,
    599,
    11,
    dim,
    "center",
  );
  // Specimen silhouettes sit at either edge, never behind the title copy.
  sprite(ctx, s, "glimmerfin", 6, 259, 362, 64);
  glow(ctx, 259, 362, 75, "#44e6d030");
  sprite(ctx, s, "lanternjaw", 0, 1021, 362, 64);
  mote(ctx, { x: 1021, y: 350 });
  text(ctx, "01 / FORAGER", 259, 428, 10, dim, "center");
  text(ctx, "02 / UNKNOWN", 1021, 428, 10, dim, "center");
  line(ctx, 64, 64, 1216, 64);
  line(ctx, 64, 655, 1216, 655);
  text(ctx, "F / 001", 64, 48, 11, dim);
  text(ctx, "ABYSSAL FIELD NOTES", 1216, 48, 11, dim, "right");
  text(ctx, "KINDLE DIVE", 64, 686, 12, cyan);
  text(ctx, "ENTER TO SELECT  ·  M SOUND", 1216, 686, 11, dim, "right");
}
function howto(ctx: Ctx, s: ReadState) {
  text(ctx, "FIELD GUIDE / 01", 80, 64, 12, cyan);
  text(ctx, "Learn the dark.", 80, 126, 44, white);
  text(ctx, "Eat to shine. Shine to be seen.", 80, 163, 16, dim);
  line(ctx, 80, 194, 1200, 194);
  const cards = [
    {
      name: "LANTERNJAW",
      sense: "FOLLOWS YOUR LIGHT",
      copy: [
        "An amber glimmer may be a meal.",
        "Or jaws. Dim down and break sight.",
      ],
      sprite: "lanternjaw",
      color: amber,
    },
    {
      name: "GLOAMFIN",
      sense: "FOLLOWS YOUR SOUND",
      copy: [
        "Your sonar finds it. It hears you, too.",
        "Turn corners to shed its speed.",
      ],
      sprite: "gloamfin",
      color: "#c9a2ff",
    },
    {
      name: "FLAREFISH",
      sense: "HUNTS IN A FLASH",
      copy: [
        "Its flare burns straight through rock.",
        "Drop ink before the bloom finds you.",
      ],
      sprite: "flarefish",
      color: "#ffbd7e",
    },
  ];
  cards.forEach((card, i) => {
    const x = 80 + i * 384;
    ctx.fillStyle = "#071820";
    ctx.fillRect(x, 224, 352, 227);
    sprite(ctx, s, card.sprite, 6, x + 42, 266, 48);
    text(ctx, card.name, x + 80, 263, 19, card.color);
    text(ctx, card.sense, x + 80, 286, 10, dim);
    card.copy.forEach((t, j) => text(ctx, t, x + 20, 337 + j * 26, 12, white));
    line(ctx, x + 20, 405, x + 332, 405);
    text(ctx, `0${i + 1}  /  KNOW YOUR HUNTER`, x + 20, 429, 10, dim);
  });
  text(ctx, "WASD / ARROWS", 80, 505, 14, cyan);
  text(ctx, "Hold to swim. Release to stop.", 80, 531, 12, white);
  text(ctx, "SPACE / SONAR", 480, 505, 14, cyan);
  text(ctx, "Flood passages; remember the way.", 480, 531, 12, white);
  text(ctx, "SHIFT / INK", 880, 505, 14, cyan);
  text(ctx, "Blind eyes, not ears.", 880, 531, 12, white);
  text(
    ctx,
    "Your glow reveals nearby walls. Sonar remembers more. Eat every mote to descend.",
    80,
    584,
    13,
    dim,
  );
  text(ctx, "P / ESC  PAUSE     M  MUTE", 80, 617, 11, dim);
  line(ctx, 80, 645, 1200, 645);
  text(ctx, "ENTER / ESC / TAP TO RETURN", 1200, 684, 12, cyan, "right");
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    return;
  }
  if (s.screen === "gameover") {
    glow(ctx, 640, 260, 300, "#12455030");
    text(ctx, "SIGNAL LOST", 640, 224, 15, dim, "center");
    text(ctx, "DIVE ENDED", 640, 294, 56, white, "center");
    text(
      ctx,
      `${String(s.score).padStart(6, "0")} POINTS   /   DEPTH ${s.depth}`,
      640,
      335,
      17,
      cyan,
      "center",
    );
    menus(ctx, s);
    text(ctx, "The abyss keeps its secrets.", 640, 559, 14, dim, "center");
    return;
  }
  board(ctx, s);
  hud(ctx, s);
  if (s.screen === "paused") {
    panel(ctx);
    text(ctx, "HOLDING DEPTH", 640, 250, 12, dim, "center");
    text(ctx, "PAUSED", 640, 314, 48, white, "center");
    menus(ctx, s);
  }
  if (s.screen === "countdown") {
    text(ctx, "DIVE", 640, 326, 52, white, "center");
    text(
      ctx,
      String(Math.max(1, Math.ceil(s.timer))),
      640,
      390,
      40,
      cyan,
      "center",
    );
    text(ctx, "LET YOUR LIGHT LEAD YOU", 640, 433, 11, dim, "center");
  }
  if (s.screen === "cleared") {
    panel(ctx);
    text(ctx, `DEPTH ${s.depth} CLEARED`, 640, 322, 34, cyan, "center");
    text(ctx, "Deeper water. More hunters.", 640, 375, 16, white, "center");
    text(ctx, `+${C.SCORE_CLEAR}  /  DESCENDING`, 640, 430, 13, dim, "center");
  }
}
