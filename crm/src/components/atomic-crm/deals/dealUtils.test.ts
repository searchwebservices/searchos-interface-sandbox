import { commands } from "vitest/browser";

import {
  formatISODateString,
  getRelativeTimeString,
  isUsableDate,
} from "./dealUtils";

describe("formatISODateString", () => {
  let originalTimezone: string;

  beforeEach(() => {
    originalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  afterEach(async () => {
    await commands.setTimezone(originalTimezone);
  });

  it("formats a valid ISO date string correctly", () => {
    const isoDate = "2024-06-15";
    const formattedDate = formatISODateString(isoDate);
    expect(formattedDate).toBe("Jun 15, 2024");
  });

  it("should not shift the date regardless of timezone", async () => {
    // Uses CDP (Emulation.setTimezoneOverride) to actually change the browser's
    // timezone at runtime so we can catch regressions where someone replaces the
    // manual date-component parse with new Date(isoString), which would shift
    // dates in negative-offset timezones like America/New_York.
    const isoDate = "2024-06-15";
    await commands.setTimezone("America/New_York");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Asia/Tokyo");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("UTC");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Pacific/Auckland");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");
  });

  it("returns a dash for null, undefined and empty input", () => {
    expect(formatISODateString(null)).toBe("-");
    expect(formatISODateString(undefined)).toBe("-");
    expect(formatISODateString("")).toBe("-");
  });

  it("returns a dash for garbage and impossible dates", () => {
    expect(formatISODateString("invalid-date")).toBe("-");
    expect(formatISODateString("15-06-2024")).toBe("-");
    expect(formatISODateString("2024-02-31")).toBe("-");
  });

  it("uses the date part of full ISO timestamps, whatever the offset", () => {
    expect(formatISODateString("2024-06-15T23:30:00+00:00")).toBe(
      "Jun 15, 2024",
    );
    expect(formatISODateString("2024-06-15T00:10:00-07:00")).toBe(
      "Jun 15, 2024",
    );
    expect(formatISODateString("2024-06-15 08:00:00+00")).toBe("Jun 15, 2024");
  });
});

describe("isUsableDate", () => {
  it("is false for empty values and true for dates and timestamps", () => {
    expect(isUsableDate(null)).toBe(false);
    expect(isUsableDate("")).toBe(false);
    expect(isUsableDate("2024-06-15")).toBe(true);
    expect(isUsableDate("2024-06-15T10:00:00Z")).toBe(true);
  });
});

describe("getRelativeTimeString", () => {
  it("does not throw on empty or bad input", () => {
    expect(getRelativeTimeString(null)).toBe("-");
    expect(getRelativeTimeString("")).toBe("-");
    expect(getRelativeTimeString("nope")).toBe("-");
  });
});
