/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Clock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import { center, clone, layout, layer, put } from "./model";
import { flood, options, sight, tick, cast } from "./simulation";
import * as C from "./constants";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
const engines: ReturnType<typeof createEngine>[] = [];
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});
async function setup(clock: Clock = new ConstantClock(1000 / 60)) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
    events = new EventTarget();
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    game,
    background: BACKGROUND,
    width: C.STAGE_W,
    height: C.STAGE_H,
    clock,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(e);
  await e.initialize();
  const key = (code: string, down = true) => {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    events.dispatchEvent(event);
  };
  const press = async (code: string) => {
    key(code);
    await e.advance(1);
    key(code, false);
  };
  const play = () => {
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.setScreen(s, "playing"));
  };
  return { e, key, press, play, events };
}
describe("engine integration and presentation", () => {
  it("loads all art, registers diagnostics, and opens an inert title", async () => {
    const { e } = await setup();
    const s = e.debug.snapshot(e.state);
    expect(s.screen).toBe("title");
    expect(s.predators).toHaveLength(3);
    expect(s.visibility.join("")).toMatch(/^u+$/);
    await e.advance(2);
    expect(e.state.simTime).toBeCloseTo(1 / 30);
    expect(e.diagnostics().every((r) => !r.error)).toBe(true);
  });
  it("navigates menus, remembers selection, and toggles sound", async () => {
    const { e, press } = await setup();
    await press("ArrowDown");
    await press("Enter");
    expect(e.state.screen).toBe("howto");
    await press("Escape");
    expect(e.state.menuIndex).toBe(1);
    await press("KeyM");
    expect(e.state.muted).toBe(true);
    e.apply((s) => e.debug.reset(s));
    expect(e.state.muted).toBe(true);
    await press("Enter");
    expect(e.state.screen).toBe("countdown");
    await e.advance(120);
    expect(e.state.screen).toBe("playing");
    await press("Escape");
    expect(e.state.screen).toBe("paused");
    const live = e.state.liveTime;
    await e.advance(10);
    expect(e.state.liveTime).toBe(live);
    await press("Escape");
    expect(e.state.screen).toBe("playing");
    expect(e.state.liveTime).toBeGreaterThan(live);
  });
  it("all screens render and menu rectangles agree with menus", async () => {
    const { e } = await setup();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "cleared",
      "gameover",
    ] as const) {
      e.apply((s) => e.debug.setScreen(s, screen));
      await e.advance(1);
      expect(e.debug.menuItemRect(e.state, 9)).toBeNull();
    }
    e.apply((s) => e.debug.setScreen(s, "paused"));
    expect(e.debug.menuItemRect(e.state, 2)?.w).toBeGreaterThan(0);
  });
  it("takes pointer confirmation only with matching edges", async () => {
    const { e, events } = await setup();
    const r = e.debug.menuItemRect(e.state, 1)!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type);
      Object.assign(event, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      events.dispatchEvent(event);
    };
    pointer("pointerdown", r.x + 10, r.y + 10);
    await e.advance(1);
    pointer("pointerup", 0, 0);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    pointer("pointerdown", r.x + 10, r.y + 10);
    pointer("pointerup", r.x + 10, r.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    pointer("pointerdown", 10, 10);
    pointer("pointerup", 10, 10);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
  });
});
describe("maze and fixed-step motion", () => {
  it("satisfies connectivity, symmetry, density, no dead ends and no squares", async () => {
    const { e } = await setup();
    const s = e.state,
      ds = flood(s, 16, 14, false);
    let count = 0,
      degree = 0;
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        if (s.tiles[y][x] !== ".") continue;
        count++;
        degree += options(s, { tx: x, ty: y }).length;
        expect(ds[y * C.GRID_COLS + x]).toBeGreaterThanOrEqual(0);
        expect(options(s, { tx: x, ty: y }).length).toBeGreaterThanOrEqual(2);
        if (y < 17 && x < 35)
          expect(
            [s.tiles[y][x + 1], s.tiles[y + 1][x], s.tiles[y + 1][x + 1]].every(
              (c) => c === ".",
            ),
          ).toBe(false);
        const mirror = s.tiles[y][35 - x];
        if (!"dg".includes(mirror)) expect(mirror).toBe(".");
      }
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(degree / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(layout).toHaveLength(C.GRID_ROWS);
  });
  it("moves only while held, stops at walls and reverses between centers", async () => {
    const { e, key, play } = await setup();
    play();
    e.apply((s) => e.debug.clearPlankton(s));
    const start = e.state.forager.x;
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(start - C.TILE);
    key("ArrowLeft", false);
    await e.advance(10);
    expect(e.state.forager.x).toBeCloseTo(start - C.TILE);
    key("ArrowRight");
    await e.advance(8);
    expect(e.state.forager.x).toBeGreaterThan(start - C.TILE);
  });
  it("wraps a seam continuously at ordinary speed", async () => {
    const { e, key, play } = await setup();
    play();
    e.apply((s) => e.debug.setForagerTile(s, 0, 8));
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(center(35, 8).x);
    expect(e.state.forager.tx).toBe(35);
  });
  it("is independent of frame partition and leaves previous values untouched", async () => {
    const a = await setup(),
      b = await setup(new SequenceClock([5, 11, 23, 11]));
    a.play();
    b.play();
    a.key("ArrowLeft");
    b.key("ArrowLeft");
    const original = a.e.state;
    await a.e.advance(60);
    await b.e.advance(80);
    expect(a.e.debug.snapshot(a.e.state)).toEqual(
      b.e.debug.snapshot(b.e.state),
    );
    expect(original.forager.x).toBe(center(16, 14).x);
  });
});
describe("sensing and creatures", () => {
  it("eats, holds brightness, decays, and keeps remembered fog beyond the window", async () => {
    const { e, play } = await setup();
    play();
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON);
    expect(e.state.brightness).toBe(C.BRIGHT_PER_EAT);
    e.apply((s) => e.debug.clearPlankton(s));
    await e.advance(60);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    await e.advance(54);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2, 2);
    const prior = e.state.visibility.join("");
    e.apply((s) => e.debug.setForagerTile(s, 1, 1));
    await e.advance(1);
    expect(prior).toContain("l");
    expect(e.state.visibility.join("")).toContain("r");
  });
  it("casts sonar and ink via registered actions and respects cooldowns", async () => {
    const { e, play, press } = await setup();
    play();
    await press("Space");
    expect(e.state.pulses[0].source).toBe("forager");
    expect(e.state.sonar.ready).toBe(false);
    await press("ShiftLeft");
    expect(e.state.inkClouds).toHaveLength(1);
    const x = e.state.inkClouds[0].x;
    await e.advance(30);
    expect(e.state.inkClouds[0].x).toBe(x);
    await e.advance(190);
    expect(e.state.inkClouds).toHaveLength(0);
  });
  it("lanternjaw tracks visible light, lingers, and loses its fix in ink", async () => {
    const { e, play, press } = await setup();
    play();
    e.apply((s) => e.debug.setForagerTile(s, 4, 14));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 7, 14));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].alert).toBe(false);
    e.apply((s) => e.debug.setForagerTile(s, 4, 11));
    await e.advance(30);
    expect(e.state.predators[0].state).toBe("chase");
    await e.advance(100);
    expect(e.state.predators[0].state).toBe("wander");
    e.apply((s) => e.debug.setForagerTile(s, 4, 14));
    await press("ShiftLeft");
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("gloamfin hears through walls and ink, emits a traveling ping when hearing breaks", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.setForagerTile(s, 4, 4));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 4, 5));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].hearingLock).toBe(true);
    expect(e.state.predators[0].alert).toBe(true);
    expect(e.state.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
    e.apply((s) => e.debug.setForagerTile(s, 28, 14));
    await e.advance(1);
    expect(e.state.pulses.some((p) => p.tint === "violet")).toBe(true);
  });
  it("flarefish charges, blooms through rock, then fades", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.addPredator(s, "flarefish", 1, 1));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(422);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(31);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.visibility[1][1]).toBe("l");
    await e.advance(62);
    expect(e.state.predators[0].flaring).toBe(false);
  });
  it("sonar marks non-amber hunters only on arrival", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.setForagerTile(s, 1, 14));
    for (const kind of C.DEN_ORDER) {
      e.apply((s) => e.debug.addPredator(s, kind, 10, 14));
      e.apply((s) =>
        e.debug.setPredatorMind(s, e.state.predators.length - 1, false),
      );
    }
    const n = clone(e.state);
    cast(n, "forager", "cyan", 1, 14, 9);
    e.apply(() => n);
    await e.advance(20);
    expect(e.state.predators[1].lit).toBe(false);
    await e.advance(20);
    expect(e.state.predators[0].mark).toBe(0);
    expect(e.state.predators[1].mark).toBeGreaterThan(0);
  });
  it("releases the den roster in timed order", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.predators.map((p) => p.released)).toEqual([
      true,
      false,
      false,
    ]);
    await e.advance(300);
    expect(e.state.predators[1].released).toBe(true);
    expect(e.state.predators[0].state).not.toBe("den");
  });
});
describe("progression and debug poses", () => {
  it("contact spends reserves, resets attempts, and ends the last life", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 16, 14));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.lives).toBe(C.START_LIVES - 1);
    expect(e.state.screen).toBe("countdown");
    e.apply((s) => e.debug.setLives(s, 0));
    play();
    e.apply((s) => e.debug.addPredator(s, "flarefish", 16, 14));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
  });
  it("clearing awards exact bonus and descends with capped roster and range", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setPlankton(s, 16, 14, true));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    expect(e.state.screen).toBe("cleared");
    await e.advance(120);
    expect(e.state.depth).toBe(2);
    expect(e.state.predators).toHaveLength(4);
    e.apply((s) => e.debug.setDepth(s, 50));
    expect(e.state.sonar.range).toBe(C.SONAR_RANGE_MIN);
    expect(e.state.predators).toHaveLength(6);
  });
  it("drifter cadence admits, eats for bonus, and obeys mind/travel switches", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    e.apply((s) => e.debug.spawnDrifter(s, 16, 14));
    e.apply((s) => e.debug.setDrifterMind(s, 1, false));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_DRIFTER + C.SCORE_PLANKTON);
    e.apply((s) => e.debug.setDrifterTravel(s, 0, false));
    const x = e.state.drifters[0].x;
    await e.advance(30);
    expect(e.state.drifters[0].x).toBe(x);
  });
  it("fixtures are used unchanged and isolated bodies hold", async () => {
    const { e, play } = await setup();
    play();
    const rows = layer("#");
    put(rows, 2, 2, ".");
    e.apply((s) => e.debug.setMaze(s, rows));
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setForagerTile(s, 2, 2));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 2, 2));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    e.apply((s) => e.debug.setForagerTile(s, 2, 2));
    expect(e.state.tiles).toEqual(rows);
    const n = clone(e.state);
    n.predators = [];
    const before = n.forager.x;
    tick(n, { held: ["right"], sonar: false, ink: false });
    expect(n.forager.x).toBe(before);
    expect(sight(n, center(2, 2), center(4, 2))).toBe(false);
  });
  it("poses validate domains, reconcile without sensing, and reset completely", async () => {
    const { e } = await setup();
    expect(() => e.debug.setBrightness(e.state, 2)).toThrow();
    expect(() => e.debug.setMaze(e.state, ["bad"])).toThrow();
    expect(() => e.debug.setPredatorTile(e.state, 999, 1, 1)).toThrow();
    expect(() => e.debug.setForagerTile(e.state, 0, 0)).toThrow();
    e.apply((s) => e.debug.setScore(s, 900));
    e.apply((s) => e.debug.setBrightness(s, 1));
    e.apply((s) => e.debug.setBrightHold(s, 1));
    e.apply((s) => e.debug.setSonarCooldown(s, 20));
    e.apply((s) => e.debug.setInkCooldown(s, 20));
    e.apply((s) => e.debug.clearFog(s));
    const before = e.debug.snapshot(e.state);
    e.apply((s) => e.debug.reconcile(s));
    expect(e.debug.snapshot(e.state)).toEqual(before);
    expect(e.state.visibility).toEqual(layer("u"));
    e.apply((s) => e.debug.reset(s));
    expect(e.state.score).toBe(0);
    expect(e.state.brightness).toBe(0);
    expect(e.state.simTime).toBe(0);
  });
});

describe("routing, search, and automation consistency", () => {
  it("routes a chase around rock instead of steering through it", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setForagerTile(s, 4, 4));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 1, 1));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    for (let i = 0; i < 50; i++) {
      await e.advance(1);
      const p = e.state.predators[0];
      expect(e.state.tiles[p.ty][p.tx]).toBe(".");
      const c = center(p.tx, p.ty);
      expect(Math.abs(p.x - c.x) < 1e-5 || Math.abs(p.y - c.y) < 1e-5).toBe(
        true,
      );
    }
  });
  it("searches a vacated fix, sends one orange ping, then gives up", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.clearPlankton(s));
    e.apply((s) => e.debug.setForagerTile(s, 4, 14));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 4, 14));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    e.apply((s) => e.debug.setForagerTile(s, 31, 1));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("search");
    await e.advance(74);
    expect(e.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    await e.advance(230);
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("frozen minds hold all bodies while travel-off minds still sense", async () => {
    const { e, play } = await setup();
    play();
    e.apply((s) => e.debug.setForagerTile(s, 4, 14));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 7, 14));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    e.apply((s) => e.debug.setPredatorDir(s, 0, "left"));
    await e.advance(20);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].x).toBe(center(7, 14).x);
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    e.apply((s) => e.debug.setPredatorMind(s, 0, true));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].alert).toBe(true);
    expect(e.state.predators[0].x).toBe(center(7, 14).x);
  });
  it("menu confirmations restart and quit without retaining a run", async () => {
    const { e, press, play } = await setup();
    play();
    e.apply((s) => e.debug.setScore(s, 900));
    e.apply((s) => e.debug.setScreen(s, "paused"));
    e.apply((s) => e.debug.setMenuIndex(s, 1));
    await press("Enter");
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toBe(0);
    e.apply((s) => e.debug.setScreen(s, "paused"));
    e.apply((s) => e.debug.setMenuIndex(s, 2));
    await press("Enter");
    expect(e.state.screen).toBe("title");
    e.apply((s) => e.debug.setScreen(s, "gameover"));
    await press("Enter");
    expect(e.state.screen).toBe("countdown");
    e.apply((s) => e.debug.setScreen(s, "gameover"));
    await press("Escape");
    expect(e.state.screen).toBe("title");
  });
  it("clears spawned creatures and preserves precise release poses", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.setTitleIndex(s, 1));
    expect(e.state.menuIndex).toBe(0);
    e.apply((s) => e.debug.setScreen(s, "title"));
    expect(e.state.menuIndex).toBe(1);
    e.apply((s) => e.debug.setPredatorTile(s, 0, 17, 7));
    e.apply((s) => e.debug.setPredatorState(s, 0, "den"));
    e.apply((s) => e.debug.setPredatorReleased(s, 0, true));
    expect(e.state.predators[0].released).toBe(true);
    e.apply((s) => e.debug.setForagerDir(s, "right"));
    expect(e.state.forager.dir).toBe("right");
    e.apply((s) => e.debug.spawnDrifter(s, 1, 1));
    e.apply((s) => e.debug.clearDrifters(s));
    expect(e.state.drifters).toHaveLength(0);
    e.apply((s) => e.debug.setPlankton(s, 1, 1, false));
    expect(e.state.plankton[1][1]).toBe("-");
  });
});
