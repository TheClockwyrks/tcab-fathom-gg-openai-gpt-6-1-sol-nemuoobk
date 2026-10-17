import * as C from "./constants";
import {
  center,
  directions,
  vectors,
  opposite,
  tile,
  put,
  reconcile,
  roster,
  enter,
  fresh,
  type FathomState,
  type Body,
  type Predator,
  type Dir,
  type Pulse,
  type ReadState,
} from "./model";
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export function open(s: ReadState, x: number, y: number, pred = false) {
  const ch = s.tiles[y]?.[x];
  return ch === "." || (pred && (ch === "d" || ch === "g"));
}
export function neighbor(s: ReadState, x: number, y: number, d: Dir) {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  const wrap = s.tiles.findIndex(
    (r) => r[0] === "." && r[C.GRID_COLS - 1] === ".",
  );
  if (y === wrap && ny === y) nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return { tx: nx, ty: ny };
}
export function options(
  s: ReadState,
  b: { tx: number; ty: number },
  pred = false,
) {
  return directions.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return open(s, n.tx, n.ty, pred);
  });
}
export function flood(s: ReadState, tx: number, ty: number, pred = true) {
  const ds = Array<number>(C.GRID_COLS * C.GRID_ROWS).fill(-1);
  if (!open(s, tx, ty, pred)) return ds;
  const q = [{ tx, ty }];
  ds[ty * C.GRID_COLS + tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    for (const d of options(s, b, pred)) {
      const n = neighbor(s, b.tx, b.ty, d),
        j = n.ty * C.GRID_COLS + n.tx;
      if (ds[j] < 0) {
        ds[j] = ds[b.ty * C.GRID_COLS + b.tx] + 1;
        q.push(n);
      }
    }
  }
  return ds;
}
function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
function wander(s: FathomState, b: Body, pred: boolean) {
  const all = options(s, b, pred),
    forward = all.filter((d) => d !== opposite[b.dir]);
  const choices = forward.length ? forward : all;
  return choices[Math.floor(random(s) * choices.length)] ?? b.dir;
}
function route(
  s: FathomState,
  b: Body,
  target: { tx: number; ty: number },
  pred = false,
): Dir | null {
  const ds = flood(s, target.tx, target.ty, pred),
    here = ds[b.ty * C.GRID_COLS + b.tx];
  if (here <= 0) return null;
  return (
    options(s, b, pred).find((d) => {
      const n = neighbor(s, b.tx, b.ty, d);
      return ds[n.ty * C.GRID_COLS + n.tx] === here - 1;
    }) ?? null
  );
}
/** Integrates a center-line body in exact center-to-center segments, including seam crossings. */
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  pred: boolean,
  choose: () => Dir | null,
) {
  Object.assign(b, tile(b));
  if (!open(s, b.tx, b.ty, pred)) return false;
  let left = speed * C.TICK_DT,
    moved = false;
  for (let guard = 0; left > 1e-9 && guard < 8; guard++) {
    const c = center(b.tx, b.ty);
    const at = Math.abs(b.x - c.x) < 1e-7 && Math.abs(b.y - c.y) < 1e-7;
    if (at) {
      b.x = c.x;
      b.y = c.y;
      const next = choose();
      if (next === null) break;
      b.dir = next;
      const n = neighbor(s, b.tx, b.ty, b.dir);
      if (!open(s, n.tx, n.ty, pred)) break;
    }
    const [dx, dy] = vectors[b.dir];
    const along = dx ? b.x - c.x : b.y - c.y;
    const sign = dx || dy;
    let toCenter =
      along * sign < -1e-8 ? Math.abs(along) : C.TILE - Math.abs(along);
    if (at) toCenter = C.TILE;
    // A closed tile ahead stops motion at the current center, never its boundary.
    const amount = Math.min(left, toCenter);
    b.x += dx * amount;
    b.y += dy * amount;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    Object.assign(b, tile(b));
    left -= amount;
    moved = true;
  }
  return moved;
}
/** Super-sampled grid ray: target rock is visible, but occludes everything behind it. */
export function sight(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  targetRock = false,
) {
  const n = Math.max(1, Math.ceil(distance(a, b) / 4)),
    end = tile(b);
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      q = tile({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (
      s.tiles[q.ty]?.[q.tx] === "#" &&
      !(targetRock && q.tx === end.tx && q.ty === end.ty)
    )
      return false;
  }
  return true;
}
function segmentDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = dx * dx + dy * dy;
  const t =
    l === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function blinded(s: FathomState, p: Predator) {
  return s.inkClouds.some((c) => segmentDistance(p, s.forager, c) <= c.radius);
}
function fix(
  s: FathomState,
  p: Predator,
  target = { tx: s.forager.tx, ty: s.forager.ty },
) {
  if (p.state !== "chase") {
    if (p.kind !== "lanternjaw") {
      p.alert = true;
      p.alertLeft = C.ALERT_TIME;
    }
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    const d = route(s, p, target);
    if (d === opposite[p.dir]) p.dir = d;
  }
  p.state = "chase";
  p.fix = { ...target };
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flarePhase > 0) p.fade = 0.4;
    p.flarePhase = 0;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
  }
}
function drop(p: Predator) {
  p.fix = null;
  p.state = "wander";
  p.flareIn = C.FLARE_INTERVAL;
}
export function cast(
  s: FathomState,
  source: Pulse["source"],
  tint: Pulse["tint"],
  ox: number,
  oy: number,
  range: number,
  owner: number | null = null,
) {
  s.pulses.push({
    source,
    tint,
    ox,
    oy,
    front: 0,
    range,
    distances: flood(s, ox, oy),
    owner,
    hit: false,
  });
}
export function sense(s: FathomState) {
  const v = s.visibility.map((r) => r.replace(/l/g, "r").split(""));
  const flares = s.predators.filter((p) => p.flaring);
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const c = center(x, y);
      if (
        (distance(c, s.forager) <= s.visionRadius &&
          sight(s, s.forager, c, true)) ||
        flares.some((p) => distance(p, c) <= C.FLARE_RADIUS)
      )
        v[y][x] = "l";
    }
  // Already-arrived sonar corridors remain lit until the front has passed the passage.
  for (const pulse of s.pulses)
    if (pulse.source === "forager")
      for (let j = 0; j < pulse.distances.length; j++) {
        const d = pulse.distances[j];
        if (d >= 0 && d <= pulse.front && pulse.front - d < 0.8) {
          const x = j % C.GRID_COLS,
            y = Math.floor(j / C.GRID_COLS);
          v[y][x] = "l";
          for (const dir of directions) {
            const n = neighbor(s, x, y, dir);
            if (s.tiles[n.ty]?.[n.tx] === "#") v[n.ty][n.tx] = "l";
          }
        }
      }
  s.visibility = v.map((r) => r.join(""));
  const lit = (b: Body) =>
    (distance(b, s.forager) <= s.visionRadius && sight(s, s.forager, b)) ||
    flares.some((p) => distance(b, p) <= C.FLARE_RADIUS);
  for (const p of s.predators)
    p.lit = p.state !== "den" && (lit(p) || p.mark > 0 || p.alert);
  for (const d of s.drifters) d.lit = lit(d);
}
function pulses(s: FathomState) {
  for (const pulse of s.pulses) {
    const old = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const reached = (tx: number, ty: number) => {
      const d = pulse.distances[ty * C.GRID_COLS + tx];
      return (
        d >= 0 &&
        d <= pulse.range &&
        d <= pulse.front &&
        (d > old || (old === 0 && d === 0))
      );
    };
    if (pulse.source === "forager") {
      for (let j = 0; j < pulse.distances.length; j++) {
        const x = j % C.GRID_COLS,
          y = Math.floor(j / C.GRID_COLS);
        if (reached(x, y)) {
          put(s.visibility, x, y, "l");
          for (const dir of directions) {
            const n = neighbor(s, x, y, dir);
            if (s.tiles[n.ty]?.[n.tx] === "#")
              put(s.visibility, n.tx, n.ty, "l");
          }
        }
      }
      for (const p of s.predators)
        if (p.state !== "den" && reached(p.tx, p.ty)) {
          if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) fix(s, p);
        }
    } else if (!pulse.hit && reached(s.forager.tx, s.forager.ty)) {
      pulse.hit = true;
      const p = pulse.owner === null ? undefined : s.predators[pulse.owner];
      if (p?.mind && p.state !== "den") fix(s, p);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
function minds(s: FathomState, cues: Set<string>) {
  s.predators.forEach((p, index) => {
    if (!p.mind) return;
    p.alertLeft = Math.max(0, p.alertLeft - C.TICK_DT);
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    p.fade = Math.max(0, p.fade - C.TICK_DT);
    if (p.state === "den") {
      if (!s.tiles.some((r) => r.includes("d"))) return;
      if (p.slot !== null && s.liveTime + 1e-9 >= p.slot * C.DEN_RELEASE_GAP)
        p.released = true;
      if (!p.released) return;
      const gy = s.tiles.findIndex((r) => r.includes("g")),
        gx = s.tiles[gy]?.indexOf("g");
      if (gy < 0) return;
      const exits = directions
        .map((d) => neighbor(s, gx, gy, d))
        .filter((n) => s.tiles[n.ty]?.[n.tx] === ".");
      if (p.travel && exits[0])
        move(s, p, C.PREDATOR_SPEED, true, () => route(s, p, exits[0], true));
      if (s.tiles[p.ty]?.[p.tx] === ".") p.state = "wander";
      return;
    }
    if (p.kind === "gloamfin") {
      const wasLock = p.hearingLock;
      p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
      if (p.hearingLock) fix(s, p);
      if (wasLock && !p.hearingLock) p.pingIn = 0;
      p.pingIn = Math.max(0, p.pingIn - C.TICK_DT);
      p.sincePing += C.TICK_DT;
      if (p.state === "chase") {
        p.chaseSpeed = Math.min(
          C.GLOAMFIN_CHASE_SPEED,
          p.chaseSpeed +
            ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
              C.GLOAMFIN_RAMP_TIME,
        );
        if (
          p.fix &&
          p.tx === p.fix.tx &&
          p.ty === p.fix.ty &&
          (p.tx !== s.forager.tx || p.ty !== s.forager.ty)
        ) {
          p.state = "search";
          p.searchTime = 0;
          p.searchPing = false;
        }
      }
      if (p.state === "search") {
        p.searchTime += C.TICK_DT;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
      }
      const guaranteed =
        p.state === "search" &&
        !p.searchPing &&
        p.searchTime >= C.GLOAMFIN_SEARCH_DELAY;
      if (
        !p.hearingLock &&
        p.sincePing >= C.GLOAMFIN_PING_MIN_GAP &&
        (guaranteed || p.pingIn <= 0)
      ) {
        cast(
          s,
          "gloamfin",
          guaranteed ? "orange" : "violet",
          p.tx,
          p.ty,
          C.GLOAMFIN_PING_RANGE,
          index,
        );
        if (guaranteed) p.searchPing = true;
        p.pingIn = C.GLOAMFIN_PING_INTERVAL;
        p.sincePing = 0;
        cues.add(C.CUES.predatorPing);
      }
    } else {
      const blind = blinded(s, p);
      const sees =
        !blind &&
        distance(p, s.forager) <= (p.detectRange ?? 0) &&
        sight(s, p, s.forager);
      const bloomLock =
        p.kind === "flarefish" &&
        p.flaring &&
        !blind &&
        distance(p, s.forager) <= C.FLARE_RADIUS;
      if (sees || bloomLock) fix(s, p);
      else if (blind) {
        if (p.state === "chase") drop(p);
      } else if (p.state === "chase") {
        p.linger -= C.TICK_DT;
        if (p.linger <= 0) drop(p);
      }
      if (p.kind === "flarefish") {
        if (p.state === "wander") {
          if (p.flarePhase === 0) {
            p.flareIn -= C.TICK_DT;
            if (p.flareIn <= 0) p.flarePhase = C.TICK_DT;
          } else p.flarePhase += C.TICK_DT;
          p.flareCharging = p.flarePhase > 0 && p.flarePhase < C.FLARE_CHARGE;
          const bloom =
            p.flarePhase >= C.FLARE_CHARGE &&
            p.flarePhase < C.FLARE_CHARGE + C.FLARE_BLOOM;
          if (bloom && !p.flaring) cues.add(C.CUES.flare);
          p.flaring = bloom;
          p.flareRadius = bloom ? C.FLARE_RADIUS : 0;
          // The bloom's first tick senses too; there is no grace frame.
          if (bloom && !blind && distance(p, s.forager) <= C.FLARE_RADIUS)
            fix(s, p);
          if (p.flarePhase >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
            p.flarePhase = 0;
            p.flaring = false;
            p.flareRadius = 0;
            p.flareIn = C.FLARE_INTERVAL;
            p.fade = 0.4;
          }
        }
      }
    }
    reconcile(s);
    if (p.travel) {
      const before = p.dir;
      move(s, p, p.speed, true, () => {
        if (p.fix && p.state === "chase") return route(s, p, p.fix);
        if (
          p.state === "search" &&
          p.fix &&
          Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
            C.GLOAMFIN_SEARCH_ROAM
        )
          return route(s, p, p.fix);
        return wander(s, p, false);
      });
      if (
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        p.dir !== before &&
        p.dir !== opposite[before]
      )
        p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
    }
  });
}
export function resetAttempt(s: FathomState) {
  s.forager = { ...center(16, 14), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.liveTime = 0;
  enter(s, "countdown");
  reconcile(s);
}
export interface TickInput {
  held: Dir[];
  sonar: boolean;
  ink: boolean;
}
export function tick(s: FathomState, input: TickInput): Set<string> {
  const cues = new Set<string>();
  s.simTime += C.TICK_DT;
  if (s.screen === "countdown") {
    s.timer -= C.TICK_DT;
    sense(s);
    if (s.timer <= 1e-9) enter(s, "playing");
    return cues;
  }
  if (s.screen === "cleared") {
    s.timer -= C.TICK_DT;
    if (s.timer <= 1e-9) {
      const next = fresh(s.assets, s.muted);
      next.depth = s.depth + 1;
      next.predators = roster(next.depth);
      next.score = s.score;
      next.lives = s.lives;
      next.simTime = s.simTime;
      next.titleIndex = s.titleIndex;
      next.remainder = s.remainder;
      Object.assign(s, next);
      enter(s, "countdown");
      reconcile(s);
    }
    return cues;
  }
  if (s.screen !== "playing") return cues;
  s.sonar.cooldown = Math.max(0, s.sonar.cooldown - C.TICK_DT);
  s.ink.cooldown = Math.max(0, s.ink.cooldown - C.TICK_DT);
  if (s.brightHold > 0) s.brightHold = Math.max(0, s.brightHold - C.TICK_DT);
  else s.brightness *= 0.5 ** (C.TICK_DT / C.BRIGHT_HALFLIFE);
  if (input.held.length) {
    s.desired = input.held[input.held.length - 1];
    if (s.desired === opposite[s.forager.dir]) s.forager.dir = s.desired;
    s.forager.moving = move(s, s.forager, C.FORAGER_SPEED, false, () => {
      const opts = options(s, s.forager);
      return opts.includes(s.desired)
        ? s.desired
        : opts.includes(s.forager.dir)
          ? s.forager.dir
          : null;
    });
  } else s.forager.moving = false;
  if (input.sonar && s.sonar.cooldown === 0) {
    cast(s, "forager", "cyan", s.forager.tx, s.forager.ty, s.sonar.range);
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (input.ink && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - C.TICK_DT }))
    .filter((c) => c.remaining > 0);
  const f = s.forager;
  if (s.tiles[f.ty]?.[f.tx] === "." && s.plankton[f.ty]?.[f.tx] === "*") {
    put(s.plankton, f.tx, f.ty, "-");
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    reconcile(s);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      enter(s, "cleared");
      cues.add(C.CUES.descend);
      sense(s);
      return cues;
    }
  }
  reconcile(s);
  // Marks are an external reveal, independent of whether a hunter's mind runs.
  for (const p of s.predators) p.mark = Math.max(0, p.mark - C.TICK_DT);
  pulses(s);
  minds(s, cues);
  for (const d of s.drifters)
    if (d.mind && d.travel)
      move(s, d, C.DRIFTER_SPEED, false, () => wander(s, d, false));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  s.drifterIn = Math.max(0, s.drifterIn - C.TICK_DT);
  if (
    s.drifterIn === 0 &&
    s.drifters.length < C.DRIFTER_MAX &&
    s.planktonRemaining > 0
  ) {
    const y = s.tiles.findIndex((r) => r.includes("g"));
    if (y >= 0) {
      const x = s.tiles[y].indexOf("g");
      const n = directions
        .map((d) => neighbor(s, x, y, d))
        .find((n) => open(s, n.tx, n.ty));
      if (n) {
        s.drifters.push({
          ...center(n.tx, n.ty),
          dir: "up",
          lit: false,
          mind: true,
          travel: true,
        });
        s.drifterIn = C.DRIFTER_INTERVAL;
      }
    }
  }
  if (
    s.predators.some((p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty)
  ) {
    cues.add(C.CUES.caught);
    if (s.lives > 0) {
      s.lives--;
      resetAttempt(s);
    } else enter(s, "gameover");
  }
  s.liveTime += C.TICK_DT;
  reconcile(s);
  sense(s);
  return cues;
}
