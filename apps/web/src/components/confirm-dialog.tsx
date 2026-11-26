"use client";

import type { ReactNode } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

/**
 * กล่องยืนยัน/แจ้งเตือนกลางของแอป — การ์ดมน ๆ สีโทนเดียว (primary) ไม่มีไอคอน
 * ใช้แทน `<Dialog>` แบบ inline ทุกหน้า (ลบ / ยกเลิก / ย้อนรายการ / แจ้งเตือน)
 *
 * - ปุ่มยืนยัน = contained สี primary เสมอ, ปุ่มยกเลิก = text สีเดียวกัน
 * - ไม่ส่ง `cancelLabel` → กล่องแจ้งเตือนปุ่มเดียว (ตกลง/ปิด)
 * - ป้ายทั้งหมดส่งมาจากหน้าเรียกใช้ (key i18n อยู่คนละ namespace กัน)
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** ข้อความยาว/มีรายการ → ใช้ "left" */
  align?: "center" | "left";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** เนื้อหาเพิ่มเติมระหว่างข้อความกับปุ่ม (เช่นช่องกรอกรหัสผ่าน) */
  children?: ReactNode;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  align = "center",
  loading = false,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 0.5 } }}
    >
      <DialogTitle
        component="div"
        sx={{ borderBottom: 0, px: 3, pt: 2, pb: 0.5, textAlign: align, fontWeight: 700 }}
      >
        {title}
      </DialogTitle>
      <DialogContent sx={{ px: 3, pt: 0, pb: 1.5 }}>
        <Box
          sx={{
            typography: "body2",
            color: "text.secondary",
            textAlign: align,
            lineHeight: 1.6,
          }}
        >
          {message}
        </Box>
        {children}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 0, gap: 1 }}>
        {cancelLabel != null && (
          <Button
            onClick={onClose}
            disabled={loading}
            sx={{ flex: 1, borderRadius: 2, textTransform: "none" }}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          variant="contained"
          color="primary"
          onClick={onConfirm}
          disabled={loading}
          startIcon={loading ? <CircularProgress color="inherit" size={16} /> : undefined}
          sx={{ flex: 1, borderRadius: 2, textTransform: "none", boxShadow: "none", "&:hover": { boxShadow: "none" } }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
