/**
 * Helper hook for managing AbortController in effects
 */

import { useEffect, useRef } from 'react';

export function useAbortSignal() {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const createSignal = (): AbortSignal => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller.signal;
  };

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return { createSignal, abort };
}
