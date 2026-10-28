// The Search mark: the real artwork from brand-marketing/brand/design-system/assets/favicon/mark.svg
// (Hard Line 6), filled with currentColor so it follows the theme. Never a typed wordmark beside it.
export function SearchMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <g transform="translate(60.80 72.28) scale(0.86896)">
        <path d="m302.89,262.8l-57.62-57.62c13.45-18.75,21.39-41.71,21.39-66.55,0-63.14-51.18-114.32-114.32-114.32h-.16V5C78.79,6.3,19.45,65.23,17.49,138.48h20.54v.16c0,63.14,51.18,114.32,114.32,114.32,24.95,0,48.01-8.01,66.8-21.58l57.58,57.58,26.16-26.16Zm-150.86-54.14c-38.79,0-70.26-31.41-70.34-70.18h-14.46c-.13-1.86-.2-3.73-.2-5.61,0-44.27,35.89-80.17,80.17-80.17,1.67,0,3.34.05,4.99.15v15.13c38.78.08,70.18,31.55,70.18,70.34,0,38.85-31.49,70.34-70.34,70.34Z" />
      </g>
    </svg>
  );
}
