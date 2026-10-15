"use client";

import { Box, Chip, keyframes, useTheme } from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { useTranslations } from "next-intl";
import { formatElapsed } from "@/hooks/use-timer";

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

interface TimerDisplayProps {
  elapsed: number;
  isRunning: boolean;
}

export default function TimerDisplay({ elapsed, isRunning }: TimerDisplayProps) {
  const theme = useTheme();
  const t = useTranslations("timer");

  return (
    <Chip
      size="small"
      variant="outlined"
      icon={
        <TimerOutlinedIcon
          sx={{
            fontSize: 14,
            color: isRunning ? "success.main" : "text.secondary",
            animation: isRunning ? `${pulse} 1.5s ease-in-out infinite` : "none",
          }}
        />
      }
      label={
        <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
          {formatElapsed(elapsed)}
        </Box>
      }
      aria-label={t("elapsed")}
      sx={{
        height: 24,
        borderColor: isRunning ? "success.main" : "divider",
        color: isRunning ? "success.main" : "text.secondary",
        bgcolor: isRunning ? "success.lighter" : "transparent",
      }}
    />
  );
}
