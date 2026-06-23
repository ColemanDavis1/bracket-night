import { describe, expect, it } from "vitest";
import { parsePlayerNames, previewImport } from "./import-players";

describe("parsePlayerNames", () => {
  it("splits lines, trims, and skips blanks", () => {
    expect(parsePlayerNames("Ann\n  Bob \n\nCarol\n")).toEqual([
      "Ann",
      "Bob",
      "Carol",
    ]);
  });

  it("takes the first CSV column and strips a header row", () => {
    const csv = 'name,email\n"Ann",a@x.com\nBob,b@x.com';
    expect(parsePlayerNames(csv)).toEqual(["Ann", "Bob"]);
  });
});

describe("previewImport", () => {
  it("dedupes against existing and within the batch, and respects capacity", () => {
    const r = previewImport(
      ["Ann", "ann", "Bob", "Carol", "Dee"],
      ["Bob"],
      2,
    );
    expect(r.toAdd).toEqual(["Ann", "Carol"]);
    expect(r.duplicates).toBe(2); // "ann" repeat + existing "Bob"
    expect(r.overflow).toBe(1); // "Dee" exceeds capacity 2
  });
});
