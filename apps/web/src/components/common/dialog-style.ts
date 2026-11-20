import type { SxProps, Theme } from "@mui/material/styles";

/**
 * ขนาดของป๊อปอัพหลัก — **ล็อกตายตัวห้ามขยับตามเนื้อหา**
 * (ศูนย์ช่วยเหลือ / รายงาน / ติดต่อ / แจ้งข้อความ / โปรไฟล์)
 *
 * กำหนด width/height, min/max ให้เท่ากันทุกค่า + flexShrink/Grow = 0 + resize = none
 * → ไม่ว่า view ไหนหรือเนื้อหายาวแค่ไหน กล่องก็มีขนาดเท่าเดิมเป๊ะ
 */
export const APP_DIALOG_WIDTH = 560;
export const APP_DIALOG_HEIGHT = 480;

/** sizing ใช้ร่วมกันระหว่าง PaperProps กับ sx (ต้องเป็น object ธรรมดาเพื่อ spread ได้) */
const lockedSizing = {
  width: `${APP_DIALOG_WIDTH}px`,
  height: `${APP_DIALOG_HEIGHT}px`,
  minWidth: `${APP_DIALOG_WIDTH}px`,
  maxWidth: `${APP_DIALOG_WIDTH}px`,
  minHeight: `${APP_DIALOG_HEIGHT}px`,
  maxHeight: `${APP_DIALOG_HEIGHT}px`,
  flexShrink: 0,
  flexGrow: 0,
  overflow: "hidden",
  resize: "none",
  borderRadius: 3,
};

export const appDialogPaperSx: SxProps<Theme> = lockedSizing;

/**
 * ใส่คู่กับ `PaperProps={{ sx: appDialogPaperSx }}` เสมอ — selector `.MuiDialog-paper`
 * มี specificity สูงกว่า + `!important` บังคับทับ class/default ของ MUI (เช่น
 * `maxWidth`, `maxHeight: calc(100% - 64px)`) เพื่อให้ล็อกจริงทุกกรณี
 */
export const appDialogSx: SxProps<Theme> = {
  "& .MuiDialog-paper": {
    ...lockedSizing,
    width: `${APP_DIALOG_WIDTH}px !important`,
    height: `${APP_DIALOG_HEIGHT}px !important`,
    minWidth: `${APP_DIALOG_WIDTH}px !important`,
    maxWidth: `${APP_DIALOG_WIDTH}px !important`,
    minHeight: `${APP_DIALOG_HEIGHT}px !important`,
    maxHeight: `${APP_DIALOG_HEIGHT}px !important`,
    flexShrink: 0,
    flexGrow: 0,
    overflow: "hidden",
  },
};

/**
 * ใส่ให้ `DialogContent` ของป๊อปอัพที่ล็อกขนาด — เนื้อหาเลื่อนภายในกรอบที่Fixed
 * (`minHeight: 0` จำเป็นมาก ไม่ดังนั้น flex child จะไม่ย่อตามกำหนด)
 */
export const appDialogContentSizing = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
};
