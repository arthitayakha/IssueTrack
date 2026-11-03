"use client";

import { useRef, useState } from "react";
import { Box, Button, IconButton, MenuItem, Popover, Select, Typography } from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/th";
import { useLocale, useTranslations } from "next-intl";

/** A `yyyy-mm-dd` pair; an empty string means "no bound on that side". */
export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangePreset {
  /** Value stored in the Select — also what the caller switches on. */
  key: string;
  label: string;
  /** The dates this preset applies. */
  dates: DateRangeValue;
}

/** The last menu entry of `DateRangeSelect`: pick the bounds yourself. */
const CUSTOM_KEY = "__custom";

/**
 * The two-picker popover shared by every date filter in the app (reports'
 * preset Select and the dashboard's calendar icon): title + hint, "จากวันที่" /
 * "ถึงวันที่", dates applied live with the pair kept ordered, footer clears or
 * dismisses. One component = one place to reword or restyle it.
 */
export function RangePopover({
  anchorEl,
  onClose,
  value,
  onChange,
  onClear,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Defaults to clearing the pair — the Select also drops back to a preset. */
  onClear?: () => void;
}) {
  const t = useTranslations("DateRange");
  const locale = useLocale();
  const from = value.from ?? "";
  const to = value.to ?? "";

  /** Moving one side past the other drags the other side along. */
  const setFrom = (next: Dayjs | null) => {
    const nextFrom = next ? next.format("YYYY-MM-DD") : "";
    onChange({ from: nextFrom, to: nextFrom && to && nextFrom > to ? nextFrom : to });
  };
  const setTo = (next: Dayjs | null) => {
    const nextTo = next ? next.format("YYYY-MM-DD") : "";
    onChange({ from: nextTo && from && nextTo < from ? nextTo : from, to: nextTo });
  };

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            width: 300,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
          },
        },
      }}
    >
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale={locale === "th" ? "th" : undefined}
      >
        <Box sx={{ px: 2, pt: 1.75 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t("title")}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            {t("hint")}
          </Typography>
          <DatePicker
            label={t("from")}
            value={from ? dayjs(from) : null}
            onChange={setFrom}
            format="DD/MM/YYYY"
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
          <Box sx={{ mt: 1.5 }}>
            <DatePicker
              label={t("to")}
              value={to ? dayjs(to) : null}
              onChange={setTo}
              format="DD/MM/YYYY"
              minDate={from ? dayjs(from) : undefined}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            px: 2,
            py: 1.25,
            mt: 1.75,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            size="small"
            onClick={() => (onClear ?? (() => onChange({ from: "", to: "" })))()}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {t("clear")}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onClose}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {t("apply")}
          </Button>
        </Box>
      </LocalizationProvider>
    </Popover>
  );
}

/**
 * Calendar-icon date filter — the compact form used in tight headers (the
 * dashboard's trend card). Tints itself while a range is active so the state
 * is visible without a label.
 */
export function DateRangeIconButton({
  value,
  onChange,
  ariaLabel,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  ariaLabel?: string;
}) {
  const t = useTranslations("DateRange");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = Boolean(value.from || value.to);

  return (
    <>
      <IconButton
        size="small"
        aria-label={ariaLabel ?? t("range")}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          border: "1px solid",
          borderColor: active ? "primary.main" : "divider",
          borderRadius: "10px",
          color: active ? "primary.main" : "text.secondary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <CalendarMonthIcon fontSize="small" />
      </IconButton>
      <RangePopover
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        value={value}
        onChange={onChange}
      />
    </>
  );
}

/**
 * Preset Select date filter — the reports toolbar's control: a preset list
 * that opens `RangePopover` when "กำหนดเอง" is chosen, showing
 * `Custom · 1 ก.ย. – 30 ก.ย.` while a custom span is active.
 */
export function DateRangeSelect({
  value,
  onChange,
  presets,
  minWidth = 165,
  size = "small",
  ariaLabel,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Preset entries in menu order — the custom entry is appended for you. */
  presets: DateRangePreset[];
  minWidth?: number;
  size?: "small" | "medium";
  /** Defaults to the shared "ช่วงเวลา" / "Date range" label. */
  ariaLabel?: string;
}) {
  const t = useTranslations("DateRange");
  const selectRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /** Keeps "custom" selected until an explicit preset replaces it. */
  const [customMode, setCustomMode] = useState(false);

  const from = value.from ?? "";
  const to = value.to ?? "";
  const matched = presets.find((p) => p.dates.from === from && p.dates.to === to);
  const activeKey = !customMode && matched ? matched.key : CUSTOM_KEY;

  const handleSelect = (event: SelectChangeEvent<string>) => {
    const key = event.target.value;
    if (key === CUSTOM_KEY) {
      // keep the current dates and open the popover under the select
      setCustomMode(true);
      setAnchor(selectRef.current);
      return;
    }
    setCustomMode(false);
    setAnchor(null);
    const preset = presets.find((p) => p.key === key);
    if (preset) onChange({ from: preset.dates.from, to: preset.dates.to });
  };

  /** "1 ก.ย." piece inside the custom renderValue. */
  const spanLabel = (iso: string) => (iso ? dayjs(iso).format("D MMM") : "—");

  return (
    <>
      <Select<string>
        size={size}
        ref={selectRef}
        value={activeKey}
        onChange={handleSelect}
        renderValue={(v) => (
          <Typography variant="body2" fontWeight={700}>
            {v === CUSTOM_KEY
              ? from || to
                ? `${t("custom")} · ${spanLabel(from)} – ${spanLabel(to)}`
                : t("custom")
              : (presets.find((p) => p.key === v)?.label ?? "")}
          </Typography>
        )}
        sx={{ minWidth }}
        inputProps={{ "aria-label": ariaLabel ?? t("range") }}
      >
        {presets.map((preset) => (
          <MenuItem key={preset.key} value={preset.key}>
            {preset.label}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM_KEY}>{t("custom")}</MenuItem>
      </Select>

      <RangePopover
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        value={{ from, to }}
        onChange={onChange}
        onClear={() => {
          // clearing returns the Select to whichever preset matches
          setCustomMode(false);
          onChange({ from: "", to: "" });
        }}
      />
    </>
  );
}
