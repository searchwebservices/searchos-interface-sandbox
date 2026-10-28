/* eslint-disable react-refresh/only-export-components */
import { differenceInDays, formatRelative } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { useLocaleState } from "ra-core";

/**
 * We use date-fns rather than Intl because Intl isn't yet capable of formatting relative dates as we want.
 *
 * The best we could do is this:
 *
 * const relativeDay = new Intl.RelativeTimeFormat(locale, {
 *   numeric: "auto",
 * }).format(diffInDays, "day");
 *
 * const time = new Intl.DateTimeFormat(locale, {
 *   hour: "numeric",
 *   minute: "numeric",
 * }).format(dateObj);
 *
 * return `${relativeDay} ${time}`;
 *
 * This would return relatives dates as "3 days ago 3:00 PM" which isn't ideal. We want "3 days ago at 3:00 PM".
 */

const getDateFnsLocale = (locale: string) =>
  locale.startsWith("fr") ? fr : enUS;

const parseDate = (date: string | null | undefined): Date | null => {
  if (!date) return null;
  const dateObj = new Date(date);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
};

export const formatLocalizedDate = (
  date: string | null | undefined,
  locale = "en",
) => {
  const dateObj = parseDate(date);
  if (!dateObj) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateObj);
};

export const formatRelativeDate = (
  date: string | null | undefined,
  locale = "en",
) => {
  const dateObj = parseDate(date);
  if (!dateObj) return "-";
  const now = new Date();
  const dateFnsLocale = getDateFnsLocale(locale);

  if (differenceInDays(now, dateObj) > 6) {
    return new Intl.DateTimeFormat(locale).format(dateObj);
  }

  return formatRelative(dateObj, now, { locale: dateFnsLocale });
};

export const useRelativeDate = (date: string | null | undefined) => {
  const [locale = "en"] = useLocaleState();

  return formatRelativeDate(date, locale);
};

export function RelativeDate({ date }: { date: string | null | undefined }) {
  return useRelativeDate(date);
}
