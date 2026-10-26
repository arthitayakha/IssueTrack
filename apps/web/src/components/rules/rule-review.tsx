"use client";

import { useTheme } from "@mui/material";
import {
  Box,
  Button,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useTranslations } from "next-intl";

interface RuleReviewProps {
  summaryWhen: string;
  summaryThen: string;
  conditionRows: Array<{ label: string; operator: string; value: string }>;
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  payload: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriorityChange: (value: number) => void;
  onIsActiveChange: (value: boolean) => void;
}

export default function RuleReview({
  summaryWhen,
  summaryThen,
  conditionRows,
  name,
  description,
  priority,
  isActive,
  payload,
  onNameChange,
  onDescriptionChange,
  onPriorityChange,
  onIsActiveChange,
}: RuleReviewProps) {
  const t = useTranslations("Automation.wizard");
  const theme = useTheme();

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t("step3Intro")}
      </Typography>

      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          mb: 2.5,
        }}
      >
        <Typography variant="body1" sx={{ color: theme.palette.navy.main, fontWeight: 600 }}>
          {t("when")} <strong>{summaryWhen}</strong> → <strong>{summaryThen}</strong>
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          {t("conditions")}
        </Typography>
        {conditionRows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("allCases")}
          </Typography>
        ) : (
          <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.5 }}>
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

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 560 }}>
        <TextField
          label={`${t("name")} *`}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          size="small"
          required
          inputProps={{ maxLength: 150 }}
        />
        <TextField
          label={t("description")}
          placeholder={t("descriptionPlaceholder")}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          size="small"
          multiline
          minRows={2}
        />
        <TextField
          label={t("priority")}
          type="number"
          value={priority}
          onChange={(e) => onPriorityChange(Number(e.target.value))}
          size="small"
          helperText={t("priorityHint")}
          inputProps={{ min: 1, max: 99 }}
          sx={{ maxWidth: 200 }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Switch checked={isActive} onChange={(e) => onIsActiveChange(e.target.checked)} size="small" />
          <Typography variant="body2">{t("active")}</Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 2.5 }}>
        <Typography variant="caption" color="text.secondary">
          {t("payload")}
        </Typography>
        <Box
          component="pre"
          sx={{
            mt: 0.5,
            p: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            fontSize: 12,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {payload}
        </Box>
      </Box>

      <Box sx={{ mt: 2.5, display: "flex", justifyContent: "flex-end" }}>
        <Tooltip title={t("saveTooltip")}>
          <span>
            <Button variant="contained" startIcon={<SaveIcon />} disabled>
              {t("save")}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
