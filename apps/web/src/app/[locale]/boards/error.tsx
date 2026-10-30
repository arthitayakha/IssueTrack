"use client";

import { useEffect } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useTranslations } from "next-intl";

/**
 * Route-level boundary for the board. Dragging fires bursts of state updates
 * (preview moves, column reloads, drop writes), so if anything still throws
 * while rendering, the page falls back to this retry screen instead of a
 * blank white page in production.
 *
 * Note: an exception thrown inside an event handler (a drag callback) is not
 * caught by boundaries — those are the ones to fix at the source; this only
 * covers render/lifecycle errors.
 */
export default function BoardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Boards");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        px: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="h6" fontWeight={700} sx={{ color: "navy.main" }}>
        {t("errorTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t("errorDesc")}
      </Typography>
      {error.digest && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
          {error.digest}
        </Typography>
      )}
      <Button variant="contained" onClick={reset} sx={{ mt: 2.5 }}>
        {t("errorRetry")}
      </Button>
    </Box>
  );
}
