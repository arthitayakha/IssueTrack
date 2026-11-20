"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { apiFetch, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

/**
 * ข้อมูลติดต่อของแอดมิน — โชว์เป็นข้อความก่อน (ชื่อ/อีเมล/เบอร์) กดดินสอถึงจะ
 * เปลี่ยนเป็นช่องกรอก inline เหมือน ProfileDialog · ข้อมูลนี้คือสิ่งที่ลูกค้าเห็น
 * ตอนกด "ติดต่อผู้ดูแลระบบ" (GET /notifications/admin-contacts)
 */
export default function AdminContactForm() {
  const t = useTranslations("SystemReports");
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setPassword("");
    setEditing(false);
    setError(null);
    setSaved(false);
  }, [user?.email, user?.phone]);

  const emailDirty = email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase();
  const phoneDirty = phone.trim() !== (user?.phone ?? "").trim();

  function cancel() {
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setPassword("");
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (emailDirty && !password) {
      setError(t("adminContactPasswordRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (emailDirty) {
        const updated = await apiFetch<{ email: string }>(
          "/auth/profile/email",
          {
            method: "PATCH",
            body: JSON.stringify({ email: email.trim(), currentPassword: password }),
          },
          token,
        );
        updateUser({ email: updated.email });
      }
      if (phoneDirty) {
        const updated = await apiFetch<{ name: string; phone: string | null }>(
          "/auth/profile",
          {
            method: "PATCH",
            body: JSON.stringify({ name: user?.name ?? "", phone: phone.trim() || null }),
          },
          token,
        );
        updateUser({ name: updated.name, phone: updated.phone });
      }
      setPassword("");
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e, t("adminContactError")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {t("adminContactTitle")}
        </Typography>
        {!editing && (
          <Tooltip title={t("adminContactEdit")}>
            <IconButton size="small" onClick={() => setEditing(true)} aria-label={t("adminContactEdit")}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{t("adminContactSaved")}</Alert>}

      {editing ? (
        <>
          <TextField
            label={t("adminContactEmail")}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
            fullWidth
            size="small"
          />
          <TextField
            label={t("adminContactPhone")}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.slice(0, 30));
              setSaved(false);
            }}
            fullWidth
            size="small"
            placeholder="02-123-4567"
          />
          {emailDirty && (
            <TextField
              label={t("adminContactPassword")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              size="small"
            />
          )}
        </>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {[
            [t("adminContactName"), user?.name || "—"],
            [t("adminContactEmail"), user?.email || "—"],
            [t("adminContactPhone"), user?.phone || "—"],
          ].map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {label}
              </Typography>
              <Typography variant="body2">{value}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {editing && (
        <>
          <Divider />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={cancel}>{t("adminContactCancel")}</Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => void save()}
              disabled={saving || (!emailDirty && !phoneDirty)}
            >
              {saving ? t("submitting") : t("adminContactSave")}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
