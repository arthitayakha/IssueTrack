"use client";

import { useTheme } from "@mui/material";
import { Box, Typography } from "@mui/material";
import { useTranslations } from "next-intl";

interface RuleReviewProps {
  summaryWhen: string;
  summaryThen: string;
  conditionRows: Array<{ label: string; operator: string; value: string }>;
  actionParams: Array<{ label: string; value: string }>;
}

const cardSx = {
  p: 2,
  borderRadius: 2,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.paper",
} as const;

/**
 * Step ③ — two plain blocks, trigger on top, action below (mirrors the
 * reference layout). Saving lives in the page footer, not in the blocks.
 */
export default function RuleReview({
  summaryWhen,
  summaryThen,
  conditionRows,
  actionParams,
}: RuleReviewProps) {
  const t = useTranslations("Automation.wizard");
  const theme = useTheme();

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("step3Intro")}
      </Typography>

      <Box sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("sectionTrigger")}
        </Typography>
        <Box sx={cardSx}>
          <Typography variant="body1" sx={{ color: theme.palette.navy.main, fontWeight: 600 }}>
            {summaryWhen}
          </Typography>

          {conditionRows.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              {conditionRows.map((row, index) => (
                <li key={`${row.label}-${index}`}>
                  <Typography variant="body2" component="span">
                    {row.label} <strong>{row.operator}</strong> {row.value}
                  </Typography>
                </li>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("sectionAction")}
        </Typography>
        <Box sx={cardSx}>
          <Typography variant="body1" sx={{ color: theme.palette.navy.main, fontWeight: 600 }}>
            {summaryThen}
          </Typography>

          {actionParams.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              {actionParams.map((row) => (
                <li key={row.label}>
                  <Typography variant="body2" component="span">
                    {row.label}: <strong>{row.value}</strong>
                  </Typography>
                </li>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
