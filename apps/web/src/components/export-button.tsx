"use client";

import { useRef, useState, type MouseEvent } from "react";
import { Button, Menu, MenuItem } from "@mui/material";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

/** 1 ตัวเลือกในเมนู export = 1 รายการ */
export interface ExportAction {
  /** React key */
  key: string;
  /** ป้ายในปุ่ม (เมื่อมีอันเดียว) หรือในเมนู (เมื่อมีหลายอัน) */
  label: string;
  onClick: () => void;
}

export interface ExportButtonProps {
  /**
   * ป้ายบนปุ่ม — ใช้ตอนมีหลาย action (ปุ่มเดียวไม่พอสำหรับบอกว่า export อะไร)
   * ตอนมี action เดียวจะโชว์ `actions[0].label` แทน เพื่อไม่ให้ปุ่มกว้างเปล่า ๆ
   */
  label: string;
  /**
   * action ที่ปุ่มนี้ทำได้:
   * - **1 อัน** → ปุ่มกดตรง ๆ ไม่มีลูกศร (คลิกครั้งเดียวจบ)
   * - **หลายอัน** → ปุ่ม + ลูกศร เปิด `Menu` เลือกรูปแบบไฟล์
   */
  actions: ExportAction[];
  /** ระหว่าง export → ปุ่มถูก disable */
  loading?: boolean;
  /** ป้ายระหว่างโหลด (ไม่ส่ง = คงป้ายเดิม) */
  loadingLabel?: string;
  disabled?: boolean;
  /** aria-label ของปุ่ม — ไม่ส่ง = ใช้ `label` */
  ariaLabel?: string;
}

/**
 * **ปุ่ม export แชร์ของทุกหน้า** — หน้า `/reports` (PDF + CSV) กับหน้า
 * `/logs` (CSV) เดิมเขียน inline คนละที่ คนละสไตล์ (outlined vs contained,
 * ไอคอนคนละข้าง, ป้ายอังกฤษ vs ไทย) เลยดูเป็นคนละแอป ตอนนี้รวมไว้ที่นี่
 * ที่เดียวให้หน้าตาและพฤติกรรมตรงกันเป๊ะ
 *
 * สไตล์มาตรฐาน: `size="small"` + `variant="outlined"` + ไอคอน download หน้าปุ่ม
 * (ลูกศรท้ายปุ่มมีเฉพาะตอนมีเมนู) — ไม่ hardcode สี ใช้ token จากธีม
 *
 * Caller ยังเป็นคนกำหนดว่าใคร export ได้บ้าง (`canExport` / permission)
 * และถือสถานะ `loading` เอง เพื่อให้ logic export จริงอยู่ในหน้านั้น ๆ
 */
export function ExportButton({
  label,
  actions,
  loading = false,
  loadingLabel,
  disabled = false,
  ariaLabel,
}: ExportButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  /** ความกว้างของปุ่มตอนกด — ใช้เป็น minWidth ของเมนูให้กว้างเท่ากันเป๊ะ */
  const [menuWidth, setMenuWidth] = useState(0);

  /** มีอันเดียว = กดตรง ๆ ไม่ต้องผ่านเมนู */
  const single = actions.length === 1;
  const isDisabled = disabled || loading || actions.length === 0;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (single) {
      actions[0].onClick();
      return;
    }
    setMenuWidth(Math.round(e.currentTarget.getBoundingClientRect().width));
    setAnchorEl(e.currentTarget);
  };

  /** ปิดเมนู แล้วค่อยรัน action ที่เลือก */
  const pick = (run: () => void) => () => {
    setAnchorEl(null);
    run();
  };

  /** รายการเมนูต้องแคบกว่าปุ่ม (ฟอนต์ 13px + padding 12px) ไม่งั้นเมนูกว้างกว่าปุ่ม */
  const itemSx = { fontSize: "0.8125rem", px: 1.5 } as const;

  const shownLabel = loading && loadingLabel ? loadingLabel : single ? actions[0]?.label ?? label : label;

  return (
    <>
      <Button
        ref={buttonRef}
        size="small"
        variant="outlined"
        startIcon={<FileDownloadIcon fontSize="small" />}
        endIcon={single ? undefined : <ArrowDropDownIcon fontSize="small" />}
        onClick={handleClick}
        disabled={isDisabled}
        aria-haspopup={single ? undefined : "menu"}
        aria-expanded={single ? undefined : Boolean(anchorEl)}
        aria-label={ariaLabel ?? label}
        sx={{ textTransform: "none", whiteSpace: "nowrap" }}
      >
        {shownLabel}
      </Button>

      {!single && (
        <Menu
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          // เปิดชิดขอบซ้ายของปุ่ม + กว้างเท่าปุ่ม (minWidth = ความกว้างปุ่มที่วัดไว้)
          // → ทั้งขอบซ้ายและขอบขวาของเมนูตรงกับปุ่มเป๊ะ
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          slotProps={{
            paper: { sx: { minWidth: menuWidth || undefined } },
          }}
        >
          {actions.map((action) => (
            <MenuItem
              key={action.key}
              onClick={pick(action.onClick)}
              disabled={loading}
              sx={itemSx}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}
