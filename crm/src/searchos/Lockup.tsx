import { LOCKUP_INNER, LOCKUP_VIEWBOX } from "./lockupPaths";

/**
 * The real Search lockup artwork (icon plus outlined wordmark), inlined from
 * the design system so currentColor follows the theme. Never retype it.
 */
export const Lockup = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={LOCKUP_VIEWBOX}
    fill="currentColor"
    role="img"
    aria-label="Search Visionary Tech"
    className={className}
    dangerouslySetInnerHTML={{ __html: LOCKUP_INNER }}
  />
);
