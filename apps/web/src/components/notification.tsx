"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Box, Snackbar, Alert, AlertColor, Button } from "@mui/material";
import { useRouter } from "@/i18n/navigation";
import IncomingToast from "@/components/notifications/incoming-toast";
import { useAuthStore } from "@/lib/auth-store";
import { resolveLink } from "@/lib/notification-link";
import { markNotificationRead, type AppNotification } from "@/lib/notifications-api";
import {
  broadcastNotificationRead,
  startNotificationStream,
  stopNotificationStream,
  subscribeToNotifications,
} from "@/lib/notification-stream";

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
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AlertColor>("success");
  const [action, setAction] = useState<NotifyAction | null>(null);

  // Real-time inbox toast — a separate queue, at the opposite corner, so the
  // 25 existing notify() call sites keep their bottom-right Snackbar untouched.
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const seenRef = useRef<Set<number>>(new Set());

  const notify = useCallback((msg: string, sev: AlertColor = "success", act?: NotifyAction) => {
    setMessage(msg);
    setSeverity(sev);
    // เคลียร์ปุ่มของครั้งก่อนด้วย — ไม่งั้น toast ใหม่ไร้ปุ่มจะยังโชว์ปุ่มเก่าค้าง
    setAction(act ?? null);
    setOpen(true);
  }, []);

  /** × / timer → dismiss only that card. The row is still unread in the bell. */
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /** Click the card → mark read (UPDATE, row stays in DB) + navigate. */
  const openToast = useCallback(
    (item: AppNotification) => {
      setToasts((prev) => prev.filter((n) => n.id !== item.id));
      broadcastNotificationRead(item.id);
      void markNotificationRead(item.id).catch(() => {
        /* the 10s poll resyncs the badge/list if this write ever fails */
      });
      router.push(resolveLink(item));
    },
    [router],
  );

  useEffect(
    () =>
      subscribeToNotifications((item) => {
        if (seenRef.current.has(item.id)) return;
        seenRef.current.add(item.id);
        // keep at most 3 on screen — a 4th pushes the oldest card out
        setToasts((prev) => (prev.some((n) => n.id === item.id) ? prev : [...prev.slice(-2), item]));
      }),
    [],
  );

  // The provider lives in the root layout, so the stream survives navigation
  // (the Navbar itself remounts between pages). Token changes = login/logout.
  useEffect(() => {
    if (token) {
      startNotificationStream();
    } else {
      stopNotificationStream();
      setToasts([]);
      seenRef.current.clear();
    }
  }, [token]);

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
      {toasts.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            top: { xs: 68, sm: 76 },
            right: { xs: 12, sm: 24 },
            zIndex: 1400,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {toasts.map((item) => (
            <IncomingToast key={item.id} item={item} onOpen={openToast} onDismiss={dismissToast} />
          ))}
        </Box>
      )}
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
