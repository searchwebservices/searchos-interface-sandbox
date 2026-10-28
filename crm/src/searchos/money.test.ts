import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("groups thousands and appends the currency", () => {
    expect(formatMoney(1234)).toBe("$1,234 MXN");
    expect(formatMoney(140000)).toBe("$140,000 MXN");
    expect(formatMoney(0)).toBe("$0 MXN");
    expect(formatMoney(undefined)).toBe("$0 MXN");
    expect(formatMoney(-2500.4)).toBe("-$2,500 MXN");
  });
});
