"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Box, Button, Checkbox, Popover, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

/**
 * **ตัวกรองแชร์ของทุกหน้า** — popover สองชั้น: ด้านซ้ายรายการหัวข้อตัวกรอง
 * (ชื่อ + จำนวนที่เลือก + ลูกศร) ด้านขวารายการตัวเลือกของหัวข้อที่เปิด
 * (checkbox + จำนวนต่อตัวเลือก) · กด tick คือกรองทันทีผ่าน `onToggle` ของ caller
 * และ panel ยังเปิดอยู่ให้เลือกต่อได้หลายหัวข้อ (ไม่มี draft ไม่มีปุ่มยืนยัน
 * ไม่มีช่องค้นหา และไม่มีไอคอนนำหน้าตามที่ผู้ใช้ต้องการ)
 */

/** 1 ตัวเลือกในหัวข้อ = 1 checkbox */
export type FilterOption = {
  id: number | string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** จำนวนจาก server ภายใต้ตัวกรองที่ใช้อยู่ตอนนี้ */
  count?: number;
  /** เก็บไว้ให้ caller เดิมได้ — component ไม่ได้วาดไอคอนนำหน้าอีกแล้ว */
  start?: ReactNode;
};

/** 1 หัวข้อที่ caller ส่งเข้ามา — `key` ใช้เป็น React key */
export interface FilterSectionData {
  key: string;
  title: string;
  icon: ReactNode;
  /** จำนวนที่ tick ไว้ในหัวข้อนี้ */
  count: number;
  options: FilterOption[];
  initialOpen: boolean;
}

/** แถบตัวเลขสีเทามุม 4 — ใช้ทั้งจำนวนที่เลือกและจำนวนต่อตัวเลือก */
const countBoxSx = {
  minWidth: 22,
  height: 20,
  px: 0.6,
  borderRadius: "4px",
  bgcolor: "action.selected",
  color: "text.secondary",
  fontSize: "0.7rem",
  fontWeight: 700,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

/** ความกว้าง submenu + ระยะห่างจากแถว — ใช้ตัดสินว่าด้านขวามีที่พอไหม */
const SUBMENU_WIDTH = 230;
const SUBMENU_GAP = 18;

export interface FilterPanelProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** เรียงตามที่ caller ต้องการ — component ไม่จัดลำดับให้ */
  sections: FilterSectionData[];
  /** ล้างทุกอย่าง — caller เป็นคน clear state จริง */
  onClearAll: () => void;
  /** เปิดหัวข้อใดหัวข้อหนึ่ง — caller โหลด count ของหัวข้อนั้นแบบ lazy */
  onGroupOpen?: (key: string) => void;
  /** เก็บไว้ให้ caller เดิมได้ — badge กับ header แยกคำนวณอยู่แล้ว */
  selectedCount?: number;
}

export function FilterPanel({
  open,
  anchorEl,
  onClose,
  sections,
  onClearAll,
  onGroupOpen,
}: FilterPanelProps) {
  const t = useTranslations("Filters");
  const theme = useTheme();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [submenuSide, setSubmenuSide] = useState<"left" | "right">("right");
  const paperRef = useRef<HTMLDivElement | null>(null);
  const totalSelected = sections.reduce((sum, section) => sum + section.count, 0);

  // ปิด popover = ปิด submenu ด้วย — เปิดใหม่ต้องเริ่มที่รายการ group เสมอ
  useEffect(() => {
    if (!open) setActiveKey(null);
  }, [open]);

  function openGroup(key: string) {
    if (activeKey === key) {
      setActiveKey(null);
      return;
    }
    // ถ้าฝั่งขวาของ popover ไม่มีที่พอ (ปุ่มตัวกรองอยู่ชิดขอบจอ) ให้ submenu
    // เปิดทางซ้ายของแถวแทน — วัดตอนกดเพราะตำแหน่ง popover เปลี่ยนตาม anchor
    const rect = paperRef.current?.getBoundingClientRect();
    const spaceRight = rect ? window.innerWidth - rect.right : window.innerWidth;
    setSubmenuSide(spaceRight >= SUBMENU_GAP + SUBMENU_WIDTH + 8 ? "right" : "left");
    setActiveKey(key);
    onGroupOpen?.(key);
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          ref: paperRef,
          sx: {
            width: { xs: "calc(100vw - 24px)", sm: 300 },
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "80vh",
            // submenu ลอยออกไปด้านนอกแถวได้ — ห้ามตัด overflow
            overflow: "visible",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadow,
            bgcolor: "background.paper",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1.4,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          {t("title")}
        </Typography>
        <Button
          size="small"
          onClick={onClearAll}
          disabled={totalSelected === 0}
          sx={{ textTransform: "none", fontWeight: 600, minWidth: 0, px: 0.75 }}
        >
          {t("clearAll")}
        </Button>
      </Box>

      <Box sx={{ p: 1 }}>
        {sections.map((section) => (
          <Box key={section.key} sx={{ position: "relative" }}>
            <Box
              component="button"
              type="button"
              onClick={() => openGroup(section.key)}
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.25,
                py: 1.15,
                mb: 0.25,
                border: 0,
                borderRadius: 1.5,
                bgcolor: activeKey === section.key ? "action.selected" : "transparent",
                color: "text.primary",
                fontFamily: "inherit",
                textAlign: "left",
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "0.875rem" }}>
                {section.title}
              </Box>
              {section.count > 0 && <Box sx={countBoxSx}>{section.count}</Box>}
              <ChevronRightIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            </Box>

            {/* submenu ลอยชิดแถวที่กด — แบบ context menu ของภาพอ้างอิง */}
            {activeKey === section.key && (
              <Box
                onClick={(event) => event.stopPropagation()}
                sx={{
                  position: "absolute",
                  left: {
                    xs: 0,
                    sm: submenuSide === "right" ? `calc(100% + ${SUBMENU_GAP}px)` : "auto",
                  },
                  right: {
                    xs: "auto",
                    sm: submenuSide === "left" ? `calc(100% + ${SUBMENU_GAP}px)` : "auto",
                  },
                  top: { xs: "100%", sm: -4 },
                  width: { xs: "100%", sm: SUBMENU_WIDTH },
                  maxHeight: 340,
                  overflowY: "auto",
                  p: 0.75,
                  zIndex: 1400,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: theme.custom.cardShadow,
                  bgcolor: "background.paper",
                }}
              >
                {section.options.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
                    {t("noResults")}
                  </Typography>
                ) : (
                  section.options.map((option) => (
                    <Box
                      key={option.id}
                      component="label"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        px: 1,
                        py: 0.55,
                        borderRadius: 1,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Checkbox
                        size="small"
                        color="primary"
                        checked={option.checked}
                        onChange={option.onToggle}
                      />
                      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                        {option.label}
                      </Typography>
                      {option.count != null && <Box sx={countBoxSx}>{option.count}</Box>}
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Popover>
  );
}
