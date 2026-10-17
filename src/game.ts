import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  fresh,
  clone,
  enter,
  menu,
  rect,
  reconcile,
  directions,
  type FathomState,
} from "./model";
import { debug, type FathomDebugApi } from "./debug";
import { tick } from "./simulation";
import { render, BACKGROUND } from "./render";
export { BACKGROUND };
export type {
  FathomState,
  Dir,
  Screen,
  Body,
  Drifter,
  Predator,
  PredatorKind,
  Pulse,
} from "./model";
export type { FathomDebugApi } from "./debug";
function restart(s: FathomState, title = false) {
  const n = fresh(s.assets, s.muted);
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  Object.assign(s, n);
  enter(s, title ? "title" : "countdown");
}
function confirm(s: FathomState) {
  if (s.screen === "title") {
    s.titleIndex = s.menuIndex ?? 0;
    if (s.menuIndex === 1) enter(s, "howto");
    else restart(s);
  } else if (s.screen === "paused") {
    if (s.menuIndex === 0) enter(s, "playing");
    else restart(s, s.menuIndex === 2);
  } else if (s.screen === "gameover") restart(s, s.menuIndex === 1);
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    Object.values(C.CUES).forEach((name, i) =>
      api.audio.define(name, {
        wave: i === 2 ? "triangle" : "sine",
        freq: [740, 920, 120, 330, 180, 240, 400][i],
        freqTo: [1100, 160, 45, 660, 1800, 50, 1000][i],
        gain: 0.12,
        durationMs: [65, 420, 300, 250, 500, 550, 650][i],
      }),
    );
    const assets: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      [
        ["glimmerfin", 8],
        ["lanternjaw", 16],
        ["gloamfin", 8],
        ["flarefish", 8],
        ["drifter", 8],
        ["flare-bloom", 8],
        ["trench-walls", 19],
      ].map(async ([name, count]) => {
        const key = String(name);
        assets[key] = await Promise.all(
          Array.from({ length: Number(count) }, (_, i) =>
            api.assets.loadImage(`${key}/${i}.png`),
          ),
        );
      }),
    );
    for (const name of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(name, (s) => s[name]);
    api.diagnostics.register(
      "cooldowns",
      (s) =>
        `sonar ${s.sonar.cooldown.toFixed(2)} / ink ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`hunter ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(0)} alert:${p.alert}`
          : "none";
      });
    return [fresh(assets), debug];
  },
  update(state, api, dt) {
    const s = clone(state),
      input = api.input;
    if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    let accept = false;
    const samples = input.pointerSamples();
    for (const sample of samples) {
      const hit = menu(s).findIndex((_, i) => {
        const r = rect(s, i);
        return (
          r !== null &&
          sample.x >= r.x &&
          sample.x <= r.x + r.w &&
          sample.y >= r.y &&
          sample.y <= r.y + r.h
        );
      });
      if (hit >= 0 && (sample.type === "move" || sample.type === "down"))
        s.menuIndex = hit;
      if (sample.type === "down")
        s.pointerStarts[sample.id] = s.screen === "howto" ? -2 : hit;
      if (sample.type === "up") {
        const start = s.pointerStarts[sample.id];
        if (
          start !== undefined &&
          ((hit >= 0 && start === hit) ||
            (s.screen === "howto" && start === -2))
        ) {
          if (hit >= 0) s.menuIndex = hit;
          accept = true;
        }
        delete s.pointerStarts[sample.id];
      }
    }
    const screen = s.screen;
    if (screen === "playing" && input.pressed("pause")) enter(s, "paused");
    else if (
      screen === "paused" &&
      (input.pressed("pause") || input.pressed("back"))
    )
      enter(s, "playing");
    else if (screen === "howto") {
      if (input.pressed("confirm") || input.pressed("back") || accept)
        restart(s, true);
    } else if (menu(s).length) {
      const count = menu(s).length;
      if (input.pressed("up"))
        s.menuIndex = ((s.menuIndex ?? 0) + count - 1) % count;
      if (input.pressed("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % count;
      if (screen === "gameover" && input.pressed("back")) restart(s, true);
      else if (input.pressed("confirm") || accept) confirm(s);
    }
    if (screen === "playing" && s.screen === "playing") {
      if (input.pressed("a")) s.pending.push("sonar");
      if (input.pressed("b")) s.pending.push("ink");
    }
    const held = directions.filter((d) => input.value(d) > 0);
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder -= C.TICK_DT;
      const cues = tick(s, {
        held,
        sonar: s.pending.includes("sonar"),
        ink: s.pending.includes("ink"),
      });
      s.pending = [];
      for (const cue of cues) api.audio.play(cue);
    }
    return reconcile(s);
  },
  render,
};
