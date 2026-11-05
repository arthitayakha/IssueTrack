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
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch, ApiError } from "@/lib/api";
import { invalidateAvatar, resizeAvatar, useOwnAvatar } from "@/lib/avatar";
import { useNotification } from "@/components/notification";

/** Which sub-dialog sits over the popup (password form / e-mail reset / e-mail confirm). */
type Editor = "password" | "passwordReset" | "emailConfirm" | null;
/** Which field is currently being typed into (values show as text otherwise). */
type EditableField = "name" | "email" | null;

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Cheap client-side shape check — the API's `@IsEmail` is the real gate. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors `ChangePasswordDto`'s `@MinLength(6)` (same floor as logging in). */
const MIN_PASSWORD = 6;

/** The caption line of a field, with its edit pencil hanging off the right. */
function FieldLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 26,
        mb: 0.25,
      }}
    >
      <Typography variant="body2" fontWeight={700} color="text.primary">
        {children}
      </Typography>
      {action}
    </Box>
  );
}

/**
 * The account popup: values are plain text until the pencil (✎) turns that
 * one field into an input in place — Escape reverts it, Enter / leaving the
 * field keeps what was typed, and a single Save button writes everything. A
 * changed e-mail asks for the current password in a confirm popup first; the
 * password form sits in its own box under the role. Everything is
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
  const [editing, setEditing] = useState<EditableField>(null);

  // the form itself
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // e-mail confirm popup (only shown when the e-mail actually changed)
  const [confirmPassword, setConfirmPassword] = useState("");
  // password form
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  // avatar
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  // re-sync when reopened (or after an external rename / e-mail change)
  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
    }
  }, [open, user?.name, user?.email]);

  /** Wipes every sub-form and edit mode — used when the popup shuts. */
  const resetSubDialogs = useCallback(() => {
    setEditor(null);
    setEditing(null);
    setConfirmPassword("");
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
  }, []);

  useEffect(() => {
    if (!open) resetSubDialogs();
  }, [open, resetSubDialogs]);

  const hasAvatar = Boolean(avatarUrl);
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameDirty = trimmedName !== (user?.name ?? "").trim();
  const emailDirty = trimmedEmail.toLowerCase() !== (user?.email ?? "").toLowerCase();
  const dirty = nameDirty || emailDirty;

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

  /** Esc reverts the field to the stored value; Enter / blur just leaves edit
   *  mode keeping what was typed (the popup must not close on Escape — that
   *  is the Dialog's own handler, so propagation is stopped). */
  function handleFieldKeyDown(event: React.KeyboardEvent, field: EditableField) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (field === "name") setName(user?.name ?? "");
      else {
        setEmail(user?.email ?? "");
        setEmailError(null);
      }
      setEditing(null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      setEditing(null);
    }
  }

  /** Save button: validate, then ask for the password only if the e-mail moved. */
  function handleSave() {
    if (!token || saving) return;
    if (!trimmedName) return; // the field's own helper text already says why
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(t("emailInvalid"));
      setEditing("email"); // show the field that needs fixing
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    if (emailDirty) {
      setConfirmPassword("");
      setEditor("emailConfirm");
      return;
    }
    void doSave(null);
  }

  /**
   * Writes the changes: e-mail first (it is the step that can be rejected by
   * the password), then the name — so a wrong password leaves everything
   * untouched. Each successful patch updates the store straight away, so a
   * later failure never hides a change that already landed.
   */
  async function doSave(currentPassword: string | null) {
    if (!token) return;
    let step: "email" | "name" | null = null;
    setSaving(true);
    try {
      if (emailDirty) {
        step = "email";
        const updated = await apiFetch<{ email: string }>(
          "/auth/profile/email",
          {
            method: "PATCH",
            body: JSON.stringify({ email: trimmedEmail, currentPassword }),
          },
          token,
        );
        updateUser({ email: updated.email });
      }
      if (nameDirty) {
        step = "name";
        const updated = await apiFetch<{ name: string }>(
          "/auth/profile",
          { method: "PATCH", body: JSON.stringify({ name: trimmedName }) },
          token,
        );
        updateUser({ name: updated.name });
      }
      notify(t("profileSaved"), "success");
      onClose();
    } catch (err) {
      // 403 = wrong current password, 409 = taken, 400 = bad format — all of
      // which are worth another try inside the confirm popup
      const status = err instanceof ApiError ? err.status : 0;
      const retryable = status === 403 || status === 409 || status === 400;
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
      if (step === "email" && retryable) {
        setConfirmPassword(""); // let the user type it again
      } else {
        setEditor(null); // the form stays open with the fields still dirty
      }
    } finally {
      setSaving(false);
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
      setEditor(null); // only the password form closes — the profile stays open
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

  /**
   * Reset (for people who cannot remember the current password): the session
   * is the proof, so only the new value and its confirmation are validated
   * here. "Repeats the old one" can only come back from the API — it is the
   * only side holding the hash — hence the 400 mapping below (length is
   * already ruled out client-side by `MIN_PASSWORD`).
   */
  async function handleResetPassword() {
    if (!token) return;
    if (!pwNew || !pwConfirm) {
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
    setPwError(null);
    setSavingPassword(true);
    try {
      await apiFetch(
        "/auth/profile/reset-password",
        { method: "POST", body: JSON.stringify({ newPassword: pwNew }) },
        token,
      );
      notify(t("passwordResetDone"), "success");
      setPwNew("");
      setPwConfirm("");
      setEditor(null); // only the reset form closes — the profile stays open
    } catch (err) {
      notify(
        err instanceof ApiError && err.status === 400
          ? t("passwordSame")
          : err instanceof ApiError
            ? err.message
            : t("genericError"),
        "error",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  /** Opens the reset form with clean fields (both entry points go through it). */
  function openPasswordReset() {
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
    setEditor("passwordReset");
  }

  const pencil = (field: Exclude<EditableField, null>) => (
    <IconButton
      size="small"
      onClick={() => setEditing(field)}
      aria-label={t("edit")}
      title={t("edit")}
      sx={{ mr: -0.75 }}
    >
      <EditIcon fontSize="small" />
    </IconButton>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontWeight: 700,
        }}
      >
        {t("tabProfile")}
        <IconButton edge="end" size="small" onClick={onClose} aria-label={t("close")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 3, py: 2 }}>
        {/* --- Avatar: picture + pencil badge, the upload trigger --- */}
        <Box
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mb: 2.5 }}
        >
          <Box sx={{ position: "relative", display: "inline-flex" }}>
            <Avatar
              src={avatarUrl ?? undefined}
              sx={{
                width: 72,
                height: 72,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontSize: "1.75rem",
                fontWeight: 600,
              }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
            <Tooltip title={t("profileUploadPhoto")}>
              <IconButton
                onClick={handlePickPicture}
                disabled={uploading}
                aria-label={t("profileUploadPhoto")}
                sx={{
                  position: "absolute",
                  right: -6,
                  bottom: -6,
                  width: 28,
                  height: 28,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  border: "2px solid",
                  borderColor: "background.paper",
                  "&:hover": { bgcolor: "primary.dark" },
                }}
              >
                <EditIcon sx={{ fontSize: "1rem" }} />
              </IconButton>
            </Tooltip>
          </Box>

          {hasAvatar && (
            <Button
              size="small"
              startIcon={<DeleteOutlineIcon fontSize="small" />}
              onClick={handleRemovePicture}
              disabled={removing}
            >
              {t("profileRemovePhoto")}
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />
        </Box>

        {/* --- Account data: plain text until the pencil is clicked --- */}
        <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 1 }}>
          {t("sectionAccount")}
        </Typography>

        {/* name */}
        <Box sx={{ mb: 1.5 }}>
          <FieldLabel action={editing === "name" ? undefined : pencil("name")}>
            {t("profileName")}
          </FieldLabel>
          {editing === "name" ? (
            <TextField
              size="small"
              fullWidth
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => handleFieldKeyDown(event, "name")}
              onBlur={() => setEditing(null)}
              inputProps={{ maxLength: 100 }}
              error={trimmedName === ""}
              helperText={trimmedName === "" ? t("profileNameRequired") : " "}
            />
          ) : (
            <Typography variant="body2" color="text.primary">
              {trimmedName || "—"}
            </Typography>
          )}
        </Box>

        {/* e-mail */}
        <Box sx={{ mb: 1.5 }}>
          <FieldLabel action={editing === "email" ? undefined : pencil("email")}>
            {t("profileEmail")}
          </FieldLabel>
          {editing === "email" ? (
            <TextField
              type="email"
              size="small"
              fullWidth
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              onKeyDown={(event) => handleFieldKeyDown(event, "email")}
              onBlur={() => setEditing(null)}
              error={Boolean(emailError)}
              helperText={emailError ?? " "}
            />
          ) : (
            <Typography variant="body2" color="text.primary">
              {trimmedEmail || "—"}
            </Typography>
          )}
        </Box>

        {/* password — a row like the others; its pencil opens the password
            form instead of an inline editor (the value is never real) */}
        <Box sx={{ mb: 1.5 }}>
          <FieldLabel
            action={
              <IconButton
                size="small"
                onClick={() => setEditor("password")}
                aria-label={t("changePassword")}
                title={t("changePassword")}
                sx={{ mr: -0.75 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            }
          >
            {t("profilePassword")}
          </FieldLabel>
          <Typography variant="body2" color="text.primary">
            {"••••••••"}
          </Typography>
          {/* for people who cannot remember it — a reset that needs neither
              the current password nor the e-mail flow */}
          <Box
            component="button"
            type="button"
            onClick={openPasswordReset}
            aria-label={t("passwordResetLink")}
            sx={{
              p: 0,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.875rem",
              color: "primary.main",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {t("passwordResetLink")}
          </Box>
        </Box>

        {/* role — read-only: no pencil, because there is nothing to edit */}
        <Box>
          <FieldLabel>{t("profileRole")}</FieldLabel>
          <Typography variant="body2" color="text.primary">
            {user?.roleName || "—"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={!dirty || saving}>
          {t("save")}
        </Button>
      </DialogActions>

      {/* ---------- Confirm the e-mail change (current password) ---------- */}
      <Dialog
        open={editor === "emailConfirm"}
        onClose={() => setEditor(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight={700}>{t("emailConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("emailConfirmHint", { email: trimmedEmail })}
          </Typography>
          <TextField
            label={t("passwordCurrent")}
            type="password"
            size="small"
            fullWidth
            required
            autoFocus
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setEditor(null)}>
            {t("cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void doSave(confirmPassword)}
            disabled={saving || !confirmPassword}
          >
            {t("confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Change password form ---------- */}
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
          {/* the current password is exactly what a forgetful user lacks —
              offer the reset that skips it (and the e-mail flow) */}
          <Box
            component="button"
            type="button"
            onClick={openPasswordReset}
            aria-label={t("passwordResetLink")}
            sx={{
              p: 0,
              mb: 2,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.875rem",
              color: "primary.main",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {t("passwordResetLink")}
          </Box>
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
          <Button color="inherit" onClick={() => setEditor(null)}>
            {t("cancel")}
          </Button>
          <Button variant="contained" onClick={handleSavePassword} disabled={savingPassword}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------- Reset password (the session is the proof — no current
          password, no e-mail; for people who cannot remember theirs) ---------- */}
      <Dialog
        open={editor === "passwordReset"}
        onClose={() => setEditor(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight={700}>{t("passwordResetTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("passwordResetSubtitle")}
          </Typography>
          <TextField
            label={t("passwordNew")}
            type="password"
            size="small"
            fullWidth
            required
            autoFocus
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
          <Button color="inherit" onClick={() => setEditor(null)}>
            {t("cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleResetPassword()}
            disabled={savingPassword}
          >
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
