"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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

/** Which inline editor is open over the popup (name / e-mail / password). */
type Editor = "name" | "email" | "password" | null;

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

/** One label → value → action line, the layout of the account popup. */
function ProfileRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ width: { xs: 92, sm: 110 }, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        color="text.primary"
        fontWeight={600}
        sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {children}
      </Typography>
      {action}
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  );
}

/** Cheap client-side shape check — the API's `@IsEmail` is the real gate. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors `ChangePasswordDto`'s `@MinLength(6)` (same floor as logging in). */
const MIN_PASSWORD = 6;

/**
 * The account popup: a list of read-only rows (name / e-mail / password /
 * role) each with its own edit dialog, plus the avatar row. Everything is
 * self-service through `/auth/profile*`, so no `user.update` permission is
 * needed — and a wrong current password comes back as 403, which never logs
 * the user out (only a real 401 does).
 */
export default function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const t = useTranslations("Settings");
  const { notify } = useNotification();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const avatarUrl = useOwnAvatar();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editor, setEditor] = useState<Editor>(null);

  // name editor
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  // e-mail editor
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPwError, setEmailPwError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  // password editor
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  // avatar
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  // re-sync when reopened (or after an external rename)
  useEffect(() => {
    if (open) setName(user?.name ?? "");
  }, [open, user?.name]);

  /** Wipes every sub-form — used when the popup shuts or an editor closes. */
  const resetEditors = useCallback(() => {
    setEditor(null);
    setEmail("");
    setEmailPassword("");
    setEmailError(null);
    setEmailPwError(null);
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
  }, []);

  useEffect(() => {
    if (!open) resetEditors();
  }, [open, resetEditors]);

  const hasAvatar = Boolean(avatarUrl);
  const nameChanged = name.trim() !== (user?.name ?? "").trim();

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
    if (!nameChanged) {
      setEditor(null);
      return;
    }
    setSavingName(true);
    try {
      const updated = await apiFetch<{ name: string }>(
        "/auth/profile",
        { method: "PATCH", body: JSON.stringify({ name: trimmed }) },
        token,
      );
      updateUser({ name: updated.name });
      notify(t("profileNameSaved"), "success");
      setEditor(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveEmail() {
    if (!token) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(t("emailInvalid"));
      setEmailPwError(null);
      return;
    }
    if (!emailPassword) {
      setEmailPwError(t("passwordCurrentRequired"));
      setEmailError(null);
      return;
    }
    setEmailError(null);
    setEmailPwError(null);
    setSavingEmail(true);
    try {
      const updated = await apiFetch<{ email: string }>(
        "/auth/profile/email",
        {
          method: "PATCH",
          body: JSON.stringify({ email: trimmed, currentPassword: emailPassword }),
        },
        token,
      );
      updateUser({ email: updated.email });
      notify(t("emailSaved"), "success");
      setEditor(null);
    } catch (err) {
      // 403 = wrong current password, 409 = already taken, 400 = bad format
      const status = err instanceof ApiError ? err.status : 0;
      const message =
        status === 403
          ? t("passwordWrongCurrent")
          : status === 409
            ? t("emailTaken")
            : status === 400
              ? t("emailInvalid")
              : err instanceof ApiError
                ? err.message
                : t("genericError");
      notify(message, "error");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSavePassword() {
    if (!token) return;
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwError(t("passwordRequired"));
      return;
    }
    if (pwNew.length < MIN_PASSWORD) {
      setPwError(t("passwordTooShort"));
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError(t("passwordMismatch"));
      return;
    }
    if (pwNew === pwCurrent) {
      setPwError(t("passwordSame"));
      return;
    }
    setPwError(null);
    setSavingPassword(true);
    try {
      await apiFetch(
        "/auth/profile/password",
        {
          method: "PATCH",
          body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
        },
        token,
      );
      notify(t("passwordChanged"), "success");
      setEditor(null);
    } catch (err) {
      // 403 = wrong current password; 400 only survives client checks when
      // the DTO rejects the length, so map it to the length message
      const status = err instanceof ApiError ? err.status : 0;
      const message =
        status === 403
          ? t("passwordWrongCurrent")
          : status === 400
            ? t("passwordTooShort")
            : err instanceof ApiError
              ? err.message
              : t("genericError");
      notify(message, "error");
    } finally {
      setSavingPassword(false);
    }
  }

  const editButton = (target: Editor) => (
    <Button size="small" variant="contained" onClick={() => setEditor(target)}>
      {t("edit")}
    </Button>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle fontWeight={700} sx={{ pb: 0 }}>
        {user?.name}
      </DialogTitle>

      <DialogContent dividers sx={{ px: 3, py: 2 }}>
        {/* --- Account data --- */}
        <SectionTitle>{t("sectionAccount")}</SectionTitle>

        <ProfileRow label={t("profileName")} action={editButton("name")}>
          {user?.name || "—"}
        </ProfileRow>

        <ProfileRow label={t("profileEmail")} action={editButton("email")}>
          {user?.email || "—"}
        </ProfileRow>

        <ProfileRow label={t("profilePassword")} action={editButton("password")}>
          {"••••••••"}
        </ProfileRow>

        <ProfileRow label={t("profileRole")}>{user?.roleName || "—"}</ProfileRow>

        <Divider sx={{ my: 2 }} />

        {/* --- Avatar --- */}
        <SectionTitle>{t("sectionAvatar")}</SectionTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1 }}>
          <Avatar
            src={avatarUrl ?? undefined}
            sx={{
              width: 48,
              height: 48,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              fontSize: "1.25rem",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", flex: 1 }}>
            <Button
              size="small"
              variant="contained"
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
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t("close")}
        </Button>
      </DialogActions>

      {/* ---------- Rename ---------- */}
      <Dialog open={editor === "name"} onClose={() => setEditor(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>{t("nameEditTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("profileName")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            inputProps={{ maxLength: 100 }}
            sx={{ mt: 1 }}
            helperText={name.trim() === "" ? t("profileNameRequired") : " "}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditor(null)} color="inherit">
            {t("cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveName}
            disabled={savingName || !name.trim() || !nameChanged}
          >
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Change e-mail ---------- */}
      <Dialog open={editor === "email"} onClose={() => setEditor(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>{t("emailEdit")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("emailNew")}
            type="email"
            size="small"
            fullWidth
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            error={Boolean(emailError)}
            helperText={emailError ?? " "}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t("passwordCurrent")}
            type="password"
            size="small"
            fullWidth
            value={emailPassword}
            onChange={(event) => {
              setEmailPassword(event.target.value);
              setEmailPwError(null);
            }}
            error={Boolean(emailPwError)}
            helperText={emailPwError ?? " "}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditor(null)} color="inherit">
            {t("cancel")}
          </Button>
          <Button variant="contained" onClick={handleSaveEmail} disabled={savingEmail}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Change password (image-2 layout) ---------- */}
      <Dialog open={editor === "password"} onClose={() => setEditor(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>{t("passwordDialogTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("passwordDialogSubtitle")}
          </Typography>
          <TextField
            label={t("passwordCurrent")}
            type="password"
            size="small"
            fullWidth
            required
            autoFocus
            value={pwCurrent}
            onChange={(event) => {
              setPwCurrent(event.target.value);
              setPwError(null);
            }}
            sx={{ mb: 2 }}
          />
          <TextField
            label={t("passwordNew")}
            type="password"
            size="small"
            fullWidth
            required
            value={pwNew}
            onChange={(event) => {
              setPwNew(event.target.value);
              setPwError(null);
            }}
            sx={{ mb: 2 }}
          />
          <TextField
            label={t("passwordConfirm")}
            type="password"
            size="small"
            fullWidth
            required
            value={pwConfirm}
            onChange={(event) => {
              setPwConfirm(event.target.value);
              setPwError(null);
            }}
            error={Boolean(pwError)}
            helperText={pwError ?? " "}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditor(null)} color="inherit">
            {t("cancel")}
          </Button>
          <Button variant="contained" onClick={handleSavePassword} disabled={savingPassword}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
