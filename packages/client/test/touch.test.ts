// covers: ACC-1 (touch is extra, for playtesters; REQUIREMENTS lists mobile as out of scope for v1)
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, DEFAULT_PAD, type Action } from "../src/input/actions.ts";
import { InputController } from "../src/input/controller.ts";
import { STICK_DEADZONE, stickActions, wantsTouchControls } from "../src/input/touch.ts";

const none = { up: false, down: false, left: false, right: false };

describe("stickActions", () => {
  it("holds nothing at rest and inside the dead zone", () => {
    expect(stickActions(0, 0, 75)).toEqual(none);
    expect(stickActions(75 * (STICK_DEADZONE - 0.02), 0, 75)).toEqual(none);
  });

  it("maps the four directions", () => {
    expect(stickActions(60, 0, 75)).toEqual({ ...none, right: true });
    expect(stickActions(-60, 0, 75)).toEqual({ ...none, left: true });
    expect(stickActions(0, -60, 75)).toEqual({ ...none, up: true });
    expect(stickActions(0, 60, 75)).toEqual({ ...none, down: true });
  });

  it("gives diagonals when both axes are pushed, and not for a slight off-axis drift", () => {
    expect(stickActions(50, -50, 75)).toEqual({ ...none, right: true, up: true });
    expect(stickActions(60, 10, 75)).toEqual({ ...none, right: true });
  });

  it("treats a drag far outside the ring like the edge, and tolerates a zero radius", () => {
    expect(stickActions(900, 0, 75)).toEqual({ ...none, right: true });
    expect(stickActions(900, 900, 75)).toEqual({ ...none, right: true, down: true });
    expect(stickActions(10, 10, 0)).toEqual(none);
  });
});

describe("wantsTouchControls", () => {
  it("shows on touch devices, and the URL can force it on or off", () => {
    expect(wantsTouchControls({ coarsePointer: true, touchPoints: 0, search: "" })).toBe(true);
    expect(wantsTouchControls({ coarsePointer: false, touchPoints: 5, search: "" })).toBe(true);
    expect(wantsTouchControls({ coarsePointer: false, touchPoints: 0, search: "" })).toBe(false);
    expect(wantsTouchControls({ coarsePointer: false, touchPoints: 0, search: "?touch=1" })).toBe(true);
    expect(wantsTouchControls({ coarsePointer: true, touchPoints: 5, search: "?touch=0" })).toBe(false);
    expect(wantsTouchControls({ coarsePointer: false, touchPoints: 0, search: "?x=1&touch=1" })).toBe(true);
  });
});

describe("InputController with touch", () => {
  const setup = () => {
    const win = new EventTarget();
    const c = new InputController(win, DEFAULT_KEYS, DEFAULT_PAD, () => null);
    const presses: [Action, string][] = [];
    c.onPress((a, s) => presses.push([a, s]));
    return { win, c, presses };
  };
  const key = (type: "keydown" | "keyup", code: string) => Object.assign(new Event(type), { code, repeat: false });

  it("merges touch movement into held, alongside the keyboard", () => {
    const { win, c } = setup();
    c.setTouchHeld({ right: true });
    expect(c.held.right).toBe(true);
    win.dispatchEvent(key("keydown", "KeyW"));
    expect(c.held).toMatchObject({ right: true, up: true });
    c.setTouchHeld({ right: false });
    expect(c.held).toMatchObject({ right: false, up: true });
  });

  it("run and sneak toggles are held until turned off", () => {
    const { c } = setup();
    c.setTouchHeld({ sneak: true });
    expect(c.held.sneak).toBe(true);
    c.setTouchHeld({ sneak: false });
    expect(c.held.sneak).toBe(false);
  });

  it("button taps arrive as presses from the touch source, and update lastSource", () => {
    const { win, c, presses } = setup();
    expect(c.lastSource).toBe("keyboard");
    c.pressTouch("interact");
    expect(presses).toEqual([["interact", "touch"]]);
    expect(c.lastSource).toBe("touch");
    win.dispatchEvent(key("keydown", "KeyN"));
    expect(c.lastSource).toBe("keyboard");
  });
});
