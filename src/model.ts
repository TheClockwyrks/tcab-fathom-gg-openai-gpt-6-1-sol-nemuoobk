import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
export type Dir = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export type PredatorKind = C.PredatorKind;
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  chaseSpeed: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flarePhase: number;
  fade: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  distances: number[];
  owner: number | null;
  hit: boolean;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  assets: Record<string, ImageBitmap[]>;
  remainder: number;
  desired: Dir;
  timer: number;
  liveTime: number;
  rng: number;
  pointerStarts: Record<number, number>;
  pending: string[];
}
export type ReadState = DeepReadonly<FathomState>;
export const directions: Dir[] = ["up", "down", "left", "right"];
export const vectors: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const opposite: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
export function tile(b: { x: number; y: number }) {
  return {
    tx: Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE),
    ty: Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE),
  };
}
export function clone(s: ReadState): FathomState {
  const { assets, ...data } = s;
  return { ...structuredClone(data), assets } as FathomState;
}
export function layer(char: string) {
  return Array.from({ length: C.GRID_ROWS }, () => char.repeat(C.GRID_COLS));
}
export function put(rows: string[], x: number, y: number, ch: string) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
export const layout = [
  "####################################",
  "#..................................#",
  "#.##.##.##.##.##.##.##.##.##.##.##.#",
  "#.##.##.##.##.##.##.##.##.##.##.##.#",
  "#................##................#",
  "#.##.##.##.##.##....##.##.##.##.##.#",
  "#.##.##.##.##.###g####.##.##.##.##.#",
  "#.##.##.##.##.##dddd##.##.##.##.##.#",
  "..............##dddd##..............",
  "#.##.##.##.##.##dddd##.##.##.##.##.#",
  "#.##.##.##.##.########.##.##.##.##.#",
  "#..................................#",
  "#.##.##.##.##.##.##.##.##.##.##.##.#",
  "#.##.##.##.##.##.##.##.##.##.##.##.#",
  "#..................................#",
  "#.##.##.##.##.##.##.##.##.##.##.##.#",
  "#..................................#",
  "####################################",
];
export function makePredator(
  kind: PredatorKind,
  tx: number,
  ty: number,
  slot: number | null,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    lit: false,
    mind: true,
    travel: true,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flarePhase: 0,
    fade: 0,
    slot,
  };
}
export function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ].map((k, i) => makePredator(k, 16 + (i % 4), 8 + Math.floor(i / 4), i));
}
export function reconcile(s: FathomState) {
  Object.assign(s.forager, tile(s.forager));
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  for (const d of s.drifters) Object.assign(d, tile(d));
  for (const p of s.predators) {
    Object.assign(p, tile(p));
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
  }
  return s;
}
export function fresh(
  assets: Record<string, ImageBitmap[]>,
  muted = false,
): FathomState {
  const s: FathomState = {
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles: [...layout],
    plankton: layout.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(16, 14), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    assets,
    remainder: 0,
    desired: "left",
    timer: 2,
    liveTime: 0,
    rng: 17391,
    pointerStarts: {},
    pending: [],
  };
  return reconcile(s);
}
export function enter(s: FathomState, screen: Screen) {
  const previous = s.screen;
  s.screen = screen;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
  if (screen === "playing" && previous !== "paused") s.liveTime = 0;
  if (screen === "countdown" || screen === "cleared") s.timer = 2;
}
export function menu(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function rect(s: ReadState, i: number) {
  return Number.isInteger(i) && i >= 0 && i < menu(s).length
    ? { x: 480, y: (s.screen === "title" ? 386 : 370) + i * 62, w: 320, h: 50 }
    : null;
}
