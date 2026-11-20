"use client";

import { useTranslations } from "next-intl";
import { Box, TextField, Typography, Popover, Grid } from "@mui/material";
import { useState, useRef } from "react";

const PRESET_COLORS = [
  { name: "green", value: "green" },
  { name: "red", value: "red" },
  { name: "yellow", value: "yellow" },
  { name: "blue", value: "blue" },
  { name: "purple", value: "purple" },
  { name: "orange", value: "orange" },
  { name: "pink", value: "pink" },
  { name: "gray", value: "gray" },
];

const COLOR_MAP: Record<string, string> = {
  green: "#4caf50",
  red: "#f44336",
  yellow: "#ffeb3b",
  blue: "#2196f3",
  purple: "#9c27b0",
  orange: "#ff9800",
  pink: "#e91e63",
  gray: "#9e9e9e",
  default: "#9e9e9e",
};

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const t = useTranslations("Settings");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPreset = PRESET_COLORS.some((c) => c.value === value);
  const displayColor = COLOR_MAP[value] ?? value;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t("color")}
      </Typography>
      <Box
        ref={containerRef}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          cursor: "pointer",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            bgcolor: displayColor,
            border: "1px solid",
            borderColor: "divider",
          }}
        />
        <Typography variant="body2">
          {isPreset ? t(`colorNames.${value}`) : value}
        </Typography>
      </Box>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("chooseColor")}
          </Typography>
          <Grid container spacing={1}>
            {PRESET_COLORS.map((color) => (
              <Grid item key={color.value}>
                <Box
                  onClick={() => {
                    onChange(color.value);
                    setAnchorEl(null);
                  }}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    bgcolor: COLOR_MAP[color.value],
                    cursor: "pointer",
                    border: value === color.value ? "3px solid" : "1px solid",
                    borderColor: value === color.value ? "primary.main" : "divider",
                    "&:hover": { opacity: 0.8 },
                  }}
                  title={t(`colorNames.${color.name}`)}
                />
              </Grid>
            ))}
          </Grid>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            {t("customColor")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <input
              type="color"
              value={displayColor}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: 40,
                height: 40,
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
            <TextField
              size="small"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#4caf50"
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
