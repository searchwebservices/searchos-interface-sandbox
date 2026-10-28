import { format } from "date-fns";

import type { DealStage, LabeledValue } from "../types";

export const findDealLabel = (dealStages: DealStage[], dealValue: string) => {
  const dealStage = dealStages.find((stage) => stage.value === dealValue);
  return dealStage?.label;
};

export const formatDealCategories = (
  dealCategories: LabeledValue[],
  categories: string[] | null | undefined,
): string =>
  (categories ?? [])
    .map(
      (value) => dealCategories.find((c) => c.value === value)?.label ?? value,
    )
    .join(", ");

export function getRelativeTimeString(
  dateString: string | null | undefined,
  locale = "en",
): string {
  if (!dateString) return EMPTY_DATE;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return EMPTY_DATE;
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const isoDatePrefixRegex = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

export const EMPTY_DATE = "-";

/**
 * Tolerant date formatter. Accepts YYYY-MM-DD or a full ISO timestamp (with
 * any offset), uses the date part as written, and returns a dash for null,
 * undefined, empty or unparseable input. It never throws.
 */
export function formatISODateString(
  dateString: string | null | undefined,
): string {
  if (typeof dateString !== "string") return EMPTY_DATE;
  const match = isoDatePrefixRegex.exec(dateString.trim());
  if (!match) return EMPTY_DATE;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  // Parse the components manually: new Date("YYYY-MM-DD") is UTC and shifts
  // the day in negative-offset timezones.
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return EMPTY_DATE;
  }
  return format(date, "PP");
}

/** True when the value is a usable date (date part present and real). */
export function isUsableDate(value: string | null | undefined): boolean {
  return formatISODateString(value) !== EMPTY_DATE;
}
