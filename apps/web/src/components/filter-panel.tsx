"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

/**
 * **ตัวกรองแชร์ของทุกหน้า** — popover "ตัวกรอง": header พร้อม chip นับจำนวนที่
 * เลือก, section พับได้ (หัวข้อ + ไอคอน + checkbox + ค้นหาใน section เมื่อมี
 * รายการเกิน 6 ข้อ) และปุ่ม "ล้างทั้งหมด" ติดท้าย
 *
 * เดิมมี **3สำเนา** ในโค้ด — `boards/page.tsx`, `reports/components/reports-filter-panel.tsx`
 * และแบบ inline ใน `/systems` — เปลี่ยนทีเดียวไม่เคยถึงกัน ตอนนึงรวมไว้ที่นี่ที่เดียว
 * ให้ทุกหน้าหน้าตาและพฤติกรรมตรงกันเป๊ะ
 *
 * หน้าที่ของ caller มี 2 อย่าง:
 * 1. **สร้าง `sections`** — เรียงลำดับเอง + คำนวณ `initialOpen` เอง (ให้เปิดอัตโนมัติ
 *    เฉพาะ section ที่มีการเลือกไว้ หรือ section แรกเมื่อยังไม่เลือกอะไรเลย)
 * 2. **นับ `filterCount`** ให้ปุ่ม trigger (badge ที่มุมปุ่ม)
 *
 * ส่วน chrome ทั้งหมด (หัว panel / ปุ่มล้าง / ข้อความค้นหาใน section) เป็นของ
 * component นี้และอ่านจาก namespace `Filters` — แก้ที่นี่ที่เดียว เปลี่ยนทุกหน้า
 */

/** 1 ตัวเลือกใน section = 1 checkbox */
export type FilterOption = {
  id: number | string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** องค์ประกอบนำหน้า label (จุดสีสถานะ / ไอคอน / avatar) */
  start?: ReactNode;
};

/** 1 section ที่ caller ส่งเข้ามา — `key` ใช้เป็น React key */
export interface FilterSectionData {
  key: string;
  title: string;
  icon: ReactNode;
  /** จำนวนที่ tick ไว้ใน section นี้ — โชว์เป็น chip และใช้ตัดสิน `initialOpen` */
  count: number;
  options: FilterOption[];
  initialOpen: boolean;
}

/** จำนวนรายการสูงสุดที่โชว์ก่อนกด "ดูทั้งหมด…" */
const FILTER_VISIBLE_ITEMS = 6;

/** section พับได้ — มีค้นหาในตัวเมื่อรายการเกิน `FILTER_VISIBLE_ITEMS` */
function FilterSection({ title, icon, count, options, initialOpen }: FilterSectionData) {
  const t = useTranslations("Filters");
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? options.filter((option) => option.label.toLowerCase().includes(trimmed))
    : options;
  const canExpand = options.length > FILTER_VISIBLE_ITEMS;
  const expanded = showAll || Boolean(trimmed);
  const visible = canExpand && !expanded ? filtered.slice(0, FILTER_VISIBLE_ITEMS) : filtered;
  const isEmpty = options.length === 0;

  return (
    <Box
      sx={{ borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", pr: 1.25 }}>
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.25,
            border: 0,
            bgcolor: "transparent",
            color: "text.primary",
            textAlign: "left",
            fontFamily: "inherit",
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <ExpandMoreIcon
            sx={{
              fontSize: 20,
              color: "text.secondary",
              transition: "transform 0.15s ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: "8px",
              bgcolor: "action.selected",
              color: "primary.main",
            }}
          >
            {icon}
          </Box>
          <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
            {title}
          </Typography>
          {count > 0 && (
            <Chip
              size="small"
              color="primary"
              label={count}
              sx={{ height: 20, minWidth: 20, fontSize: 11, fontWeight: 700 }}
            />
          )}
        </Box>
      </Box>

      {open && (
        <Box sx={{ px: 2, pb: 1.75 }}>
          {canExpand && (
            <TextField
              fullWidth
              size="small"
              placeholder={t("search")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowAll(false);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery("")} aria-label="clear">
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ mb: 1.25, "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
              // กัน password manager เทอีเมลลงช่องค้นหา (เหมือนหน้าบอร์ด)
              inputProps={{ autoComplete: "off", name: "filter-search" }}
            />
          )}

          {isEmpty || filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              {t("noResults")}
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {visible.map((option) => (
                <li key={option.id}>
                  <FormControlLabel
                    sx={{
                      m: 0,
                      width: "100%",
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 1,
                      alignItems: "center",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        checked={option.checked}
                        onChange={option.onToggle}
                      />
                    }
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        {option.start}
                        <Typography variant="body2" noWrap>
                          {option.label}
                        </Typography>
                      </Box>
                    }
                  />
                </li>
              ))}
            </Box>
          )}

          {canExpand && !trimmed && (
            <Button
              size="small"
              onClick={() => setShowAll((value) => !value)}
              sx={{ mt: 0.5, px: 1, textTransform: "none", fontWeight: 600 }}
            >
              {showAll ? t("showLess") : t("viewAll")}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export interface FilterPanelProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** เรียงตามที่ต้องการให้โชว์ — component ไม่ได้จัดลำดับให้ */
  sections: FilterSectionData[];
  /** ล้างทุกอย่าง — caller เป็นคน clear state จริง */
  onClearAll: () => void;
  /**
   * ตัวเลขที่โชว์ที่หัว panel — **ไม่ส่ง = ผลรวมของ `sections`** (ตรงกับที่
   * badge ของปุ่ม trigger นับ)
   *
   * ส่งเฉพาะหน้าที่นับ**ไม่เท่ากับ**ผลรวม เช่น `/reports` ที่ `activeFilterCount()`
   * นับ "ช่วงวันที่" กับ "ค้นหา" เป็นคนละหน่วยกับจำนวน tick ใน section
   * (กันไม่ให้ chip ที่หัว panel เพี้ยนจาก badge ภายนอก)
   */
  selectedCount?: number;
}

/**
 * popover ตัวกรอง — chrome ทั้งหมด (หัว + ปุ่มล้าง + section) อยู่ที่นี่ที่เดียว
 * เรียกด้วย `<FilterPanel sections={...} onClearAll={...} />`
 */
export function FilterPanel({
  open,
  anchorEl,
  onClose,
  sections,
  onClearAll,
  selectedCount,
}: FilterPanelProps) {
  const t = useTranslations("Filters");
  const theme = useTheme();
  const totalSelected =
    selectedCount ?? sections.reduce((sum, section) => sum + section.count, 0);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "72vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadow,
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "8px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <FilterListIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          {t("title")}
        </Typography>
        {totalSelected > 0 && (
          <Chip
            size="small"
            color="primary"
            label={t("selectedCount", { count: totalSelected })}
            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {sections.map((section) => (
          <FilterSection
            key={section.key}
            title={section.title}
            icon={section.icon}
            count={section.count}
            options={section.options}
            initialOpen={section.initialOpen}
          />
        ))}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 2,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Button
          size="small"
          onClick={onClearAll}
          disabled={totalSelected === 0}
          startIcon={<DeleteOutlineIcon fontSize="small" />}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {t("clearAll")}
        </Button>
      </Box>
    </Popover>
  );
}
