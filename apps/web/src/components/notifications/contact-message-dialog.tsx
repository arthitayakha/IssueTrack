"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import { useNotification } from "@/components/notification";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";
import { sendContactMessage } from "@/lib/notifications-api";

/** คู่สัญญาที่กำลังจะส่งแจ้งเตือนหา (เปิดจากป๊อปอัพสัญญา `/systems`) */
export interface ContactMessageTarget {
  appId: number;
  companyId: number;
  appName: string;
  companyName: string;
}

const MAX_LEN = 200;

/**
 * **ป๊อปอัพ "แจ้งเตือน..."** — กดส่งแล้วสร้างแถวในกล่องเข้าของอีกฝ่าย + ส่งอีเมล
 * (ฝั่งเซิร์ฟเวอร์เป็นคนกำหนดผู้รับ) · มีปุ่มข้อความสำเร็จรูปที่กดแล้วเติมลงช่อง
 * และแก้ไขได้อีกครั้งก่อนส่ง
 */
export default function ContactMessageDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: ContactMessageTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations("Notifications");
  const { notify } = useNotification();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // เปิดใหม่ทุกครั้ง → เริ่มช่องว่างเสมอ (ไม่ทิ้งข้อความของสัญญาก่อนหน้า)
  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  const vars = {
    app: target?.appName ?? "",
    company: target?.companyName ?? "",
  };
  const presets = [
    { label: t("notifyPresetMa"), text: t("notifyPresetMaText", vars) },
    { label: t("notifyPresetExpiring"), text: t("notifyPresetExpiringText", vars) },
    { label: t("notifyPresetGeneral"), text: t("notifyPresetGeneralText", vars) },
  ];

  async function submit() {
    const text = message.trim();
    if (!target || !text || sending) return;
    setSending(true);
    try {
      const res = await sendContactMessage({
        message: text,
        appId: target.appId,
        companyId: target.companyId,
        appName: target.appName,
        companyName: target.companyName,
      });
      notify(t("notifySuccess", { n: res.sent }), "success");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("notifyError"), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={sending ? undefined : onClose}
      maxWidth={false}
      PaperProps={{ sx: appDialogPaperSx }}
      sx={appDialogSx}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
      >
        <SendIcon sx={{ color: "primary.main", flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {t("notifyTitle")}
          </Typography>
          {target && (
            <Typography variant="body2" color="text.secondary">
              {target.appName} · {target.companyName}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} disabled={sending} aria-label={t("notifyCancel")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={appDialogContentSizing}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("notifyPresets")}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
              {presets.map((preset) => (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  size="small"
                  variant="outlined"
                  onClick={() => setMessage(preset.text.slice(0, MAX_LEN))}
                />
              ))}
            </Box>
          </Box>
          <TextField
            label={t("notifyMessage")}
            placeholder={t("notifyPlaceholder")}
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, MAX_LEN))}
            multiline
            minRows={3}
            maxRows={6}
            fullWidth
            autoFocus
            inputProps={{ maxLength: MAX_LEN }}
            helperText={`${message.length}/${MAX_LEN}`}
          />
          <Typography variant="caption" color="text.secondary">
            {t("notifyHint")}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          {t("notifyCancel")}
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={sending || !message.trim()}
          startIcon={<SendIcon />}
        >
          {sending ? t("notifySending") : t("notifySend")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
