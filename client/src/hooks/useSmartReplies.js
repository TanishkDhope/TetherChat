import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

const DEBOUNCE_MS = 400;
const EMPTY = { replies: [], source: null, loading: false };

// Fetches reply suggestions for the given turns (see lib/smartReplies.js).
// Re-fetches only when the turns actually change, debounced, and aborts any
// in-flight request when they change again or the component unmounts.
export function useSmartReplies(turns, { enabled = true, n = 3 } = {}) {
  const [state, setState] = useState(EMPTY);
  const key = enabled && turns.length ? JSON.stringify(turns) : "";
  const latestTurns = useRef(turns);
  latestTurns.current = turns;

  useEffect(() => {
    if (!key) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));

    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch("/suggest-replies", {
          method: "POST",
          body: { turns: latestTurns.current, n },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setState({ replies: data.replies ?? [], source: data.source ?? null, loading: false });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn("[smart-replies]", err.message);
          setState(EMPTY);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, n]);

  return state;
}
