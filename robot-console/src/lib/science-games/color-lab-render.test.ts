import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const assets = new URL("../../../public/assets/science-games/color-lab/", import.meta.url);

function startLab() {
  const frames = new Map<number, (timestamp: number) => void>();
  let notifyResize = () => {};
  let nextFrame = 0, width = 300, height = 150;
  const scene = { draws: 0, resets: 0, painted: false };
  const context = { setTransform() {} };
  const canvas = {
    getContext: () => context,
    get width() { return width; },
    set width(value) { width = value; scene.resets++; scene.painted = false; },
    get height() { return height; },
    set height(value) { height = value; scene.resets++; scene.painted = false; },
  };
  const element = () => ({
    append() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {},
    querySelector: () => ({}), dataset: {},
    style: { setProperty() {} }, classList: { toggle() {} },
  });
  const arena = { clientWidth: 368, clientHeight: 457 };
  const nodes = { arena, scene: canvas };
  const globals = {
    document: {
      ...element(), hidden: false, createElement: element,
      getElementById: (id: keyof typeof nodes) => nodes[id] ?? element(),
    },
    PaintLab: {
      backdrop() { scene.draws++; scene.painted = true; }, cup() {}, stream() {}, sparkle() {},
    },
    ResizeObserver: class {
      constructor(callback: () => void) { notifyResize = callback; }
      observe() {}
    },
    requestAnimationFrame: (callback: (timestamp: number) => void) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    performance: { now: () => 100 },
    devicePixelRatio: 3,
  };
  const model = readFileSync(new URL("model.js", assets), "utf8");
  const lab = readFileSync(new URL("lab.js", assets), "utf8");
  runInNewContext(`${model}\n${lab}`, globals);
  return {
    arena, canvas, frames, globals, scene,
    resize: () => notifyResize(),
    flushFrame() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(116);
      }
    },
  };
}

describe("Color Lab canvas resize", () => {
  it("does not reset or redraw the painted canvas for a same-size notification", () => {
    const lab = startLab();
    lab.flushFrame();
    const before = { ...lab.scene };
    expect(before.painted).toBe(true);
    lab.resize();
    expect(lab.scene).toEqual(before);
    expect(lab.frames.size).toBe(0);
  });

  it("paints the resized backing buffer before returning to the browser", () => {
    const lab = startLab();
    lab.arena.clientWidth = 396;
    lab.resize();
    expect(lab.canvas.width).toBe(990);
    expect(lab.canvas.height).toBe(1143);
    expect(lab.scene.painted).toBe(true);
    expect(lab.frames.size).toBe(0);
  });

  it("handles a pixel-ratio change at the same CSS size without a blank frame", () => {
    const lab = startLab();
    lab.globals.devicePixelRatio = 2;
    lab.resize();
    expect(lab.canvas.width).toBe(736);
    expect(lab.canvas.height).toBe(914);
    expect(lab.scene.painted).toBe(true);
  });
});
