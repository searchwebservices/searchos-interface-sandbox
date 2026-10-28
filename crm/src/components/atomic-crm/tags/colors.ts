// Tag palette: CSS variables defined in searchos-theme.css, so a tag follows the
// theme (light or dark) instead of carrying a fixed hex.
export const colors = Array.from(
  { length: 10 },
  (_, i) => `var(--tag-${i + 1})`,
);
