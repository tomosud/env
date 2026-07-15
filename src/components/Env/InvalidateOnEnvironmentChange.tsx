import { useThree } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { environmentRenderStateAtom } from "../../store";

const CAPTURE_INTERVAL_MS = 1000 / 30;

/**
 * Wakes a demand-driven Canvas when authored environment data changes.
 * Rapid slider/drag updates are throttled so cubemap capture cannot run more
 * than 30 times per second; the latest change is always rendered.
 */
export function InvalidateOnEnvironmentChange() {
  const environmentState = useAtomValue(environmentRenderStateAtom);
  const invalidate = useThree((state) => state.invalidate);
  const lastInvalidationRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const invalidateNow = () => {
      lastInvalidationRef.current = performance.now();
      timerRef.current = null;
      invalidate();
    };

    const elapsed = performance.now() - lastInvalidationRef.current;
    const remaining = CAPTURE_INTERVAL_MS - elapsed;

    if (remaining <= 0) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      invalidateNow();
    } else if (timerRef.current === null) {
      timerRef.current = window.setTimeout(invalidateNow, remaining);
    }
  }, [environmentState, invalidate]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  return null;
}
