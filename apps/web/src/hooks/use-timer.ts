"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkSession } from "@kanban/shared";
import { getOpenTimer, getWorkSessions } from "@/lib/board-api";

export interface UseTimerResult {
  isOpen: boolean;
  elapsed: number;
  sessions: WorkSession[];
  refresh: () => Promise<void>;
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export { formatElapsed };

export function useTimer(issueId: number | undefined): UseTimerResult {
  const [isOpen, setIsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!issueId) return;
    const [open, all] = await Promise.all([
      getOpenTimer(issueId),
      getWorkSessions(issueId),
    ]);
    setIsOpen(!!open);
    if (open) {
      const start = new Date(open.startedAt).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    } else {
      setElapsed(0);
    }
    setSessions(all);
  }, [issueId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isOpen) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOpen]);

  return { isOpen, elapsed, sessions, refresh };
}
