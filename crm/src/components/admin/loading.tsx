import { useTimeout } from "ra-core";
import { MarkLoader } from "@/searchos/Mark";

/**
 * Loading indicator used for slow element or page loads: the Search mark with
 * a quiet pulse. Shown after a short delay, also a Suspense fallback.
 */
export const Loading = (props: LoadingProps) => {
  const {
    delay = 400,
    loadingPrimary: _p,
    loadingSecondary: _s,
    ...rest
  } = props;
  const shown = useTimeout(delay);
  return shown ? <MarkLoader fill {...rest} /> : null;
};

export interface LoadingProps {
  loadingPrimary?: string;
  loadingSecondary?: string;
  delay?: number;
}
