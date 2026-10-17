import { describe, expect, it } from "vitest";
import { normalizePhone } from "../../src/lib/phone";

describe("normalizePhone", () => {
  it("normalizes a complete, formatted US number", () => {
    expect(normalizePhone("(415) 555-0142")).toBe("+14155550142");
  });

  it("rejects an incomplete or invalid phone number", () => {
    expect(normalizePhone("(123) 456-789")).toBeNull();
  });
});
