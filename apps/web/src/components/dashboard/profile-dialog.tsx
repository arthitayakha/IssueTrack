"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch, ApiError } from "@/lib/api";
import { invalidateAvatar, resizeAvatar, useOwnAvatar } from "@/lib/avatar";
import { useNotification } from "@/components/notification";

/** Which tab the popup opens on — chosen by the caller (menu / bell gear). */
export type ProfileDialogTab = "settings" | "profile";

interface ProfileDialogProps {
  open: boolean;
  tab: ProfileDialogTab;
  /** The caller owns the tab state so menu / bell / reopen can pick it. */
  onTabChange: (tab: ProfileDialogTab) => void;
  onClose: () => void;
}

/**
 * The account popup that replaced the old `/settings` page: two tabs —
 * settings (placeholder; the notification toggle is parked) and profile
 * (swap the picture, rename yourself). Password changes stay parked until
 * a real e-mail flow exists. Writes go through the self-service
 * `/auth/profile` endpoints, so no `user.update` permission is needed.
 */
export default function ProfileDialog({
  open,
  tab,
  onTabChange,
  onClose,
}: ProfileDialogProps) {
  const t = useTranslations("Settings");
  const { notify } = useNotification();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const avatarUrl = useOwnAvatar();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  // re-sync when reopened (or after an external rename)
  useEffect(() => {
    if (open) setName(user?.name ?? "");
  }, [open, user?.name]);

  const hasAvatar = Boolean(avatarUrl);
  const nameChanged = name.trim() !== (user?.name ?? "").trim();
  const tabs: ProfileDialogTab[] = ["settings", "profile"];

  function handlePickPicture() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again
    if (!file || !token || !user) return;
    if (!file.type.startsWith("image/")) {
      notify(t("profilePhotoInvalid"), "error");
      return;
    }
    setUploading(true);
    try {
      const resized = await resizeAvatar(file);
      const form = new FormData();
      form.append("file", resized, "avatar.jpg");
      await apiFetch("/auth/profile/avatar", { method: "POST", body: form }, token);
      invalidateAvatar(user.id);
      notify(t("profilePhotoSaved"), "success");
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 413
          ? t("profilePhotoLarge")
          : err instanceof ApiError
            ? err.message
            : t("genericError");
      notify(message, "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePicture() {
    if (!token || !user) return;
    setRemoving(true);
    try {
      await apiFetch("/auth/profile/avatar", { method: "DELETE" }, token);
      invalidateAvatar(user.id);
      notify(t("profilePhotoRemoved"), "success");
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveName() {
    if (!token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      notify(t("profileNameRequired"), "error");
      return;
    }
    if (!nameChanged) return;
    setSavingName(true);
    try {
      const updated = await apiFetch<{ name: string }>(
        "/auth/profile",
        { method: "PATCH", body: JSON.stringify({ name: trimmed }) },
        token,
      );
      updateUser({ name: updated.name });
      notify(t("profileNameSaved"), "success");
      onClose();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    } finally {
      setSavingName(false);
    }
  }

  const tabLabels: Record<ProfileDialogTab, string> = {
    settings: t("tabSettings"),
    profile: t("tabProfile"),
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle fontWeight={700} sx={{ pb: 0 }}>
        {t("title")}
      </DialogTitle>

      <DialogContent dividers sx={{ px: 0, pt: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v: ProfileDialogTab) => onTabChange(v)}
          sx={{ px: 3 }}
        >
          {tabs.map((key) => (
            <Tab key={key} value={key} label={tabLabels[key]} />
          ))}
        </Tabs>

        {tab === "settings" && (
          <Box sx={{ p: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t("tabSettings")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t("comingSoon")}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}

        {tab === "profile" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 3 }}>
            {/* Picture + actions */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Avatar
                src={avatarUrl ?? undefined}
                sx={{
                  width: 64,
                  height: 64,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PhotoCameraIcon fontSize="small" />}
                  onClick={handlePickPicture}
                  disabled={uploading}
                >
                  {uploading ? t("profilePhotoUploading") : t("profileUploadPhoto")}
                </Button>
                {hasAvatar && (
                  <Tooltip title={t("profileRemovePhoto")}>
                    <IconButton
                      size="small"
                      onClick={handleRemovePicture}
                      disabled={removing}
                      aria-label={t("profileRemovePhoto")}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileChange}
              />
            </Box>

            <Divider />

            {/* Rename */}
            <TextField
              label={t("profileName")}
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
              inputProps={{ maxLength: 100 }}
              helperText={name.trim() === "" ? t("profileNameRequired") : " "}
            />

            {/* Read-only facts */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ width: 100, flexShrink: 0 }}
                >
                  {t("profileEmail")}
                </Typography>
                <Typography variant="body2" color="text.primary" fontWeight={600}>
                  {user?.email ?? "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ width: 100, flexShrink: 0 }}
                >
                  {t("profileRole")}
                </Typography>
                <Typography variant="body2" color="text.primary" fontWeight={600}>
                  {user?.roleName ?? "—"}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t("cancel")}
        </Button>
        {tab === "profile" && (
          <Button
            variant="contained"
            onClick={handleSaveName}
            disabled={savingName || !name.trim() || !nameChanged}
          >
            {t("save")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
