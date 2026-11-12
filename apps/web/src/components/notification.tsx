"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Snackbar, Alert, AlertColor, Button } from "@mui/material";

/**
 * ปุ่มใน toast — ใช้กับ **"ยกเลิกรายการ" หลังต่ออายุ/ซื้อชั่วโมง** (กดได้ 1 ครั้ง
 * แล้ว toast ปิดตัวเอง) · `onClick` ถูกเรียกก่อนที่ toast จะถูกปิด
 */
export interface NotifyAction {
  label: string;
  onClick: () => void;
}

interface NotificationContextType {
  /**
   * `severity` = สี (default `"success"`) · `action` = ปุ่มขวาสุดของ toast —
   * **ส่ง `undefined` = ไม่มีปุ่ม** (ทุกจุดที่เรียก `notify` เดิมจึงไม่กระทบ)
   * และการเรียกครั้งใหม่จะ **แทนที่** ปุ่มของครั้งก่อนเสมอ (ไม่ค้างปุ่มเก่า)
   */
  notify: (message: string, severity?: AlertColor, action?: NotifyAction) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notify: () => {},
});

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AlertColor>("success");
  const [action, setAction] = useState<NotifyAction | null>(null);

  const notify = useCallback((msg: string, sev: AlertColor = "success", act?: NotifyAction) => {
    setMessage(msg);
    setSeverity(sev);
    // เคลียร์ปุ่มของครั้งก่อนด้วย — ไม่งั้น toast ใหม่ไร้ปุ่มจะยังโชว์ปุ่มเก่าค้าง
    setAction(act ?? null);
    setOpen(true);
  }, []);

  const handleClose = () => {
    setOpen(false);
    // เคลียร์ตอนปิดด้วย — กันปุ่มรั่วไปใส่ toast หน้าถัดไปที่ไม่มี action
    setAction(null);
  };

  /**
   * toast ที่มีปุ่มอยู่ **8 วินาที** (ของเดิม 4) — ปุ่ม "ยกเลิกรายการ" ต้องมีเวลา
   * ให้อ่านและกดทัน ส่วน toast ธรรมดาคงเวลาเดิมทุกประการ
   */
  const hideDuration = action ? 8000 : 4000;

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={hideDuration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          variant="filled"
          sx={{ width: "100%" }}
          action={
            action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const run = action.onClick;
                  handleClose();
                  run();
                }}
              >
                {action.label}
              </Button>
            ) : undefined
          }
        >
          {message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}
