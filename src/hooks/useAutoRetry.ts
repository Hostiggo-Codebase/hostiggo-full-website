import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Retries `run` on its own after a failure, with a growing delay, up to `maxAttempts`.
 * `retrying` is true while more automatic attempts are coming; once they are used up it turns false so the
 * page can offer a manual "Check again". Call `succeeded()` / `failed()` from the load function.
 */
export function useAutoRetry(run: () => void | Promise<void>, { maxAttempts = 5, baseDelayMs = 4000 } = {}) {
  const [attempts, setAttempts] = useState(0);
  const [failing, setFailing] = useState(false);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const succeeded = useCallback(() => {
    clearTimeout(timer.current);
    setFailing(false);
    setAttempts(0);
  }, []);

  const failed = useCallback(() => {
    setFailing(true);
    setAttempts((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!failing || attempts === 0 || attempts > maxAttempts) return;
    timer.current = setTimeout(() => void runRef.current(), Math.min(baseDelayMs * attempts, 20_000));
    return () => clearTimeout(timer.current);
  }, [failing, attempts, maxAttempts, baseDelayMs]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const manualRetry = useCallback(() => {
    setAttempts(0);
    void runRef.current();
  }, []);

  return { failing, retrying: failing && attempts <= maxAttempts, succeeded, failed, manualRetry };
}
