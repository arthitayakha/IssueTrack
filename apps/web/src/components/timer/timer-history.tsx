"use client";

import { Box, Divider, Typography, useTheme } from "@mui/material";
import { useTranslations } from "next-intl";
import type { WorkSession } from "@kanban/shared";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}นาที ${s}วิ`;
}

interface TimerHistoryProps {
  sessions: WorkSession[];
}

export default function TimerHistory({ sessions }: TimerHistoryProps) {
  const theme = useTheme();
  const t = useTranslations("timer");

  if (sessions.length === 0) return null;

  const recent = sessions.slice(-3).reverse();

  return (
    <Box sx={{ mt: 1 }}>
      <Divider sx={{ mb: 0.5 }} />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5, fontSize: "0.65rem" }}
      >
        {t("history")}
      </Typography>
      {recent.map((s) => (
        <Box
          key={s.id}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.65rem",
            color: "text.secondary",
            lineHeight: 1.6,
          }}
        >
          <span>
            {formatTime(s.startedAt)} - {s.endedAt ? formatTime(s.endedAt) : "..."}
          </span>
          <span>{s.endedAt ? formatDuration(s.duration) : "-"}</span>
        </Box>
      ))}
    </Box>
  );
}
