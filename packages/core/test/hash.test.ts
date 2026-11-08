// covers: NFR-3
import { describe, expect, it } from "vitest";
import { canonicalize, stateHash } from "../src/index.ts";

describe("stateHash", () => {
  it("ignores key order", () => {
    expect(stateHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stateHash({ b: { d: 3, c: 2 }, a: 1 }));
  });
  it("detects value changes", () => {
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: 2 }));
    expect(stateHash([1, 2])).not.toBe(stateHash([2, 1]));
  });
  it("canonicalize drops undefined fields", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
