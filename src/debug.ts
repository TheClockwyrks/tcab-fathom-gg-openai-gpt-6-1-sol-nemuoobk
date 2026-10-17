import { flood } from "./simulation";
import * as C from "./constants";
import {
  clone,
  fresh,
  reconcile,
  enter,
  menu,
  rect,
  center,
  put,
  layer,
  roster,
  makePredator,
  directions,
  type ReadState,
  type Screen,
  type Dir,
  type PredatorKind,
  type FathomState,
} from "./model";
function valid(condition: boolean): asserts condition {
  if (!condition)
    throw new RangeError("Fathom: invalid pose argument or subject");
}
function number(n: number, min = 0, max = Infinity, whole = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!whole || Number.isInteger(n)),
  );
}
function position(s: ReadState, x: number, y: number, allowed = ".") {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  valid(allowed.includes(s.tiles[y][x]));
}
function predator(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drifter(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function boolean(v: boolean) {
  valid(typeof v === "boolean");
}
function direction(d: Dir) {
  valid(directions.includes(d));
}
const pose = (s: ReadState, change: (s: FathomState) => void) => {
  const n = clone(s);
  change(n);
  return reconcile(n);
};
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) =>
    fresh({ ...s.assets } as Record<string, ImageBitmap[]>, s.muted),
  snapshot: (s: ReadState) => {
    const n = reconcile(clone(s));
    const {
      assets: _assets,
      remainder: _remainder,
      desired: _desired,
      timer: _timer,
      liveTime: _liveTime,
      rng: _rng,
      pointerStarts: _pointerStarts,
      pending: _pending,
      ...out
    } = n;
    return {
      ...out,
      forager: { ...n.forager },
      drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: n.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
    };
  },
  reconcile: (s: ReadState) => reconcile(clone(s)),
  setScreen: (s: ReadState, screen: Screen) =>
    pose(s, (n) => {
      valid(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(screen),
      );
      enter(n, screen);
      if (screen === "playing") n.liveTime = 0;
    }),
  setMenuIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, menu(n).length - 1, true);
      n.menuIndex = index;
    }),
  setTitleIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = index;
    }),
  menuItemRect: rect,
  setScore: (s: ReadState, points: number) =>
    pose(s, (n) => {
      number(points, 0, Infinity, true);
      n.score = points;
    }),
  setLives: (s: ReadState, lives: number) =>
    pose(s, (n) => {
      number(lives, 0, Infinity, true);
      n.lives = lives;
    }),
  setDepth: (s: ReadState, d: number) =>
    pose(s, (n) => {
      number(d, 1, Infinity, true);
      n.depth = d;
      n.predators = roster(d);
      n.liveTime = 0;
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      valid(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
      );
      const all = rows.join(""),
        g = all.split("g").length - 1;
      valid(!/[dg]/.test(all) || g === 1);
      n.tiles = [...rows];
      n.pulses = n.pulses.map((p) => ({
        ...p,
        distances: flood(n, p.ox, p.oy),
      }));
    }),
  setPlankton: (s: ReadState, tx: number, ty: number, present: boolean) =>
    pose(s, (n) => {
      position(n, tx, ty);
      boolean(present);
      put(n.plankton, tx, ty, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = layer("u");
    }),
  setForagerTile: (s: ReadState, tx: number, ty: number) =>
    pose(s, (n) => {
      position(n, tx, ty);
      Object.assign(n.forager, center(tx, ty), { moving: false });
    }),
  setForagerDir: (s: ReadState, dir: Dir) =>
    pose(s, (n) => {
      direction(dir);
      n.forager.dir = dir;
      n.desired = dir;
      n.forager.moving = false;
    }),
  setBrightness: (s: ReadState, g: number) =>
    pose(s, (n) => {
      number(g, 0, 1);
      n.brightness = g;
    }),
  setBrightHold: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.BRIGHT_HOLD);
      n.brightHold = seconds;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, kind: PredatorKind, tx: number, ty: number) =>
    pose(s, (n) => {
      valid(C.DEN_ORDER.includes(kind));
      position(n, tx, ty);
      n.predators.push(makePredator(kind, tx, ty, null));
    }),
  setPredatorTile: (s: ReadState, index: number, tx: number, ty: number) =>
    pose(s, (n) => {
      position(n, tx, ty, ".dg");
      Object.assign(predator(n, index), center(tx, ty));
    }),
  setPredatorDir: (s: ReadState, index: number, dir: Dir) =>
    pose(s, (n) => {
      direction(dir);
      predator(n, index).dir = dir;
    }),
  setPredatorState: (
    s: ReadState,
    index: number,
    value: "den" | "wander" | "chase",
  ) =>
    pose(s, (n) => {
      valid(["den", "wander", "chase"].includes(value));
      const p = predator(n, index);
      position(n, p.tx, p.ty, value === "den" ? "dg" : ".");
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = value === "chase" ? C.LINGER_TIME : 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.flarePhase = 0;
      p.flareIn = C.FLARE_INTERVAL;
      p.flareCharging = p.kind === "flarefish" ? false : null;
      p.flaring = p.kind === "flarefish" ? false : null;
      p.flareRadius = p.kind === "flarefish" ? 0 : null;
    }),
  setPredatorReleased: (s: ReadState, index: number, released: boolean) =>
    pose(s, (n) => {
      boolean(released);
      predator(n, index).released = released;
    }),
  setPredatorMind: (s: ReadState, index: number, enabled: boolean) =>
    pose(s, (n) => {
      boolean(enabled);
      predator(n, index).mind = enabled;
    }),
  setPredatorTravel: (s: ReadState, index: number, enabled: boolean) =>
    pose(s, (n) => {
      boolean(enabled);
      predator(n, index).travel = enabled;
    }),
  spawnDrifter: (s: ReadState, tx: number, ty: number) =>
    pose(s, (n) => {
      position(n, tx, ty);
      n.drifters.push({
        ...center(tx, ty),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, index: number, enabled: boolean) =>
    pose(s, (n) => {
      boolean(enabled);
      drifter(n, index).mind = enabled;
    }),
  setDrifterTravel: (s: ReadState, index: number, enabled: boolean) =>
    pose(s, (n) => {
      boolean(enabled);
      drifter(n, index).travel = enabled;
    }),
  setDrifterIn: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = seconds;
    }),
  setSonarCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.sonar.cooldown = seconds;
    }),
  setInkCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.ink.cooldown = seconds;
    }),
};
export type FathomDebugApi = typeof debug;
