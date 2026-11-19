"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { useAuthStore, type AuthUser } from "@/lib/auth-store";
import { apiFetch, ApiError } from "@/lib/api";
import { invalidateAvatar, resizeAvatar, useOwnAvatar } from "@/lib/avatar";
import { useNotification } from "@/components/notification";

/** Which sub-dialog sits over the popup (password form / e-mail reset / e-mail confirm). */
type Editor = "password" | "passwordReset" | "emailConfirm" | null;

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Cheap client-side shape check — the API's `@IsEmail` is the real gate. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors `ChangePasswordDto`'s `@MinLength(6)` (same floor as logging in). */
const MIN_PASSWORD = 6;

/**
 * One row of the card: a grey label in a fixed-width column, the value (or
 * the input while editing) beside it and an optional action pinned to the
 * right. The row keeps a fixed height (40 + its own 6px breathing room top
 * and bottom), so swapping a value for an input never moves the rows around
 * it — and no two rows ever sit flush against each other.
 */
function InfoRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", minHeight: 40, py: 0.75, gap: 2 }}>
      <Typography
        variant="body2"
        sx={{ flexShrink: 0, width: { xs: 110, sm: 140 }, color: "text.secondary" }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </Box>
      {action ? (
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: { xs: 0.5, sm: 2 },
          }}
        >
          {action}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * A bare text button in the theme's primary colour — used for the links that
 * hang off the right of a row ("เปลี่ยนรหัสผ่าน" / "จำรหัสผ่านไม่ได้? รีเซ็ต").
 * Rendered as a real `<button>` so keyboard users can reach it.
 */
function LinkButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        p: 0,
        border: "none",
        bgcolor: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "0.875rem",
        lineHeight: 1.25,
        whiteSpace: "nowrap",
        color: "primary.main",
        "&:hover": { textDecoration: "underline" },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Scopes the password fields of a sub-dialog inside a real `<form>` so the
 * browser's password manager has a form owner: it then fills the saved
 * username + password *inside* the dialog instead of treating the whole page
 * as the login form (a `type="password"` input with no form ancestor makes it
 * do that) and dumping the account's saved e-mail into the first text input it
 * finds out there — which was the page's search box. The explicit
 * `autoComplete="username"` field below gives it its target right here, and
 * Enter is swallowed so a submit can never reload the page.
 */
function PasswordScope({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="form"
      autoComplete="off"
      onSubmit={(event) => event.preventDefault()}
      sx={{ display: "contents" }}
    >
      {/* Off-screen but not `display: none` — some browsers skip autofill on
          inputs they cannot see, and the whole point is to be the target. */}
      <Box
        component="input"
        type="text"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        aria-hidden
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          border: 0,
          clip: "rect(0 0 0 0)",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      />
      {children}
    </Box>
  );
}

/**
 * The account popup: an avatar header (picture + camera badge, the user's
 * name and a role chip — the chip IS the role, so the card has no role row)
 * over one bordered "ข้อมูลส่วนตัว" card. The camera badge opens the file
 * picker directly while there is no picture, and once one exists it opens a
 * small menu with the two picture actions (เปลี่ยนรูปภาพ / ลบภาพ) instead of a
 * separate remove button under the avatar. View mode is pure text with a single
 * "แก้ไข ✎" button in the card's top-right corner; pressing it switches the
 * name and e-mail to inputs and adds ยกเลิก / บันทึก to the footer (Escape
 * inside a field = ยกเลิก). The footer itself is always rendered because it
 * carries the reset link (no current password needed) at the bottom-left —
 * never an empty strip, and the buttons live on that same row. A changed
 * e-mail asks for the current password in a confirm popup first; the
 * change-password form is reachable only in edit mode and is nothing but its
 * three fields — the reset link has a single home now, the footer.
 *
 * Rows that only apply to some people are conditional: ตำแหน่ง needs a
 * `positionId` and บริษัท a `companyId` (a customer's company), so a seat
 * without one simply does not show that line. Everything is self-service
 * through `/auth/profile*`, so no `user.update` permission is needed — and a
 * wrong current password comes back as 403, which never logs the user out
 * (only a real 401 does).
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
  // view mode = plain text + "แก้ไข"; edit mode = inputs + the ยกเลิก/บันทึก
  // footer (which is what keeps the idle popup free of any empty strip)
  const [editMode, setEditMode] = useState(false);
  // validation message, shown on the footer's reserved line so the card
  // never has to grow around it
  const [formError, setFormError] = useState<string | null>(null);

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
  // the camera badge's menu (เปลี่ยนรูปภาพ / ลบภาพ) — anchor = the badge itself
  const [photoMenuEl, setPhotoMenuEl] = useState<HTMLElement | null>(null);

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
    setEditMode(false);
    setFormError(null);
    setPhotoMenuEl(null);
    setConfirmPassword("");
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
  }, []);

  useEffect(() => {
    if (!open) resetSubDialogs();
  }, [open, resetSubDialogs]);

  // The card's read-only identity (บทบาท / ตำแหน่ง / บริษัท) is refreshed from
  // `/auth/me` every time the popup opens: an admin can move a seat to another
  // position or company while this session sits in localStorage, and a login
  // that predates those fields would never carry them at all. Only identity
  // fields are merged — name/e-mail belong to the form above and must not be
  // overwritten while the user is typing. A failed call keeps whatever the
  // session already has and simply retries on the next open.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void apiFetch<{
      roleId: number | null;
      roleName: string | null;
      positionId: number | null;
      positionName: string | null;
      companyId: number | null;
      companyName: string | null;
    }>("/auth/me", {}, token)
      .then((me) => {
        if (cancelled) return;
        // read the store at answer time — the effect must not depend on `user`
        const current = useAuthStore.getState().user;
        const patch: Partial<AuthUser> = {};
        if (me.roleId !== current?.roleId) patch.roleId = me.roleId;
        if (me.roleName !== current?.roleName) patch.roleName = me.roleName;
        if (me.positionId !== current?.positionId) patch.positionId = me.positionId;
        if (me.positionName !== current?.positionName) patch.positionName = me.positionName;
        if (me.companyId !== current?.companyId) patch.companyId = me.companyId;
        if (me.companyName !== current?.companyName) patch.companyName = me.companyName;
        if (Object.keys(patch).length > 0) updateUser(patch);
      })
      .catch(() => {
        /* self-service — the rows just show whatever the session already knows */
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, updateUser]);

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

  /** Escape inside a field = ยกเลิก (reverts both fields and leaves edit mode
   *  without closing the popup — that is the Dialog's own handler, so
   *  propagation is stopped); Enter just keeps typing, Save is the button. */
  function handleFieldKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancelEdit();
    } else if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  /** Enters edit mode with a clean slate (the แก้ไข ✎ button). */
  function startEdit() {
    setFormError(null);
    setEmailError(null);
    setEditMode(true);
  }

  /** ยกเลิก: drops whatever was typed, back to view mode, popup stays open. */
  function cancelEdit() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setEmailError(null);
    setFormError(null);
    setEditMode(false);
  }

  /** Save button: validate, then ask for the password only if the e-mail moved. */
  function handleSave() {
    if (!token || saving) return;
    if (!trimmedName) {
      // the message lives on the footer's reserved line, so nothing moves
      setFormError(t("profileNameRequired"));
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(t("emailInvalid"));
      setFormError(t("emailInvalid"));
      return;
    }
    setFormError(null);
    if (!dirty) {
      // nothing actually changed — just go back to reading the card
      setEditMode(false);
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
      // close the confirm popup — success is the only path that never touched
      // `editor`, so without this the "ยืนยันการเปลี่ยนอีเมล" box stayed open
      // forever under the green toast (the form fields are dropped too, the
      // next save re-asks from a clean slate anyway)
      setEditor(null);
      setConfirmPassword("");
      // back to view mode instead of closing — the user sees the result and
      // can still hit ✕ themselves (the footer disappears with it)
      setEditMode(false);
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { maxWidth: 560 } }}>
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

      <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
        {/* --- Header: picture + camera badge, the name, a role chip --- */}
        <Box
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mb: 2.5 }}
        >
          <Box sx={{ position: "relative", display: "inline-flex" }}>
            <Avatar
              src={avatarUrl ?? undefined}
              sx={{
                width: 84,
                height: 84,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontSize: "2rem",
                fontWeight: 600,
              }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
            <Tooltip title={hasAvatar ? t("profileChangePhoto") : t("profileUploadPhoto")}>
              <IconButton
                onClick={(event) =>
                  // no picture yet → straight to the file picker (a menu with
                  // a single row would just be an extra click); with a picture
                  // the badge opens เปลี่ยนรูปภาพ / ลบภาพ instead
                  hasAvatar ? setPhotoMenuEl(event.currentTarget) : handlePickPicture()
                }
                disabled={uploading}
                aria-label={hasAvatar ? t("profileChangePhoto") : t("profileUploadPhoto")}
                aria-haspopup={hasAvatar ? "menu" : "false"}
                aria-expanded={hasAvatar ? Boolean(photoMenuEl) : false}
                sx={{
                  position: "absolute",
                  right: -6,
                  bottom: -6,
                  width: 30,
                  height: 30,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  border: "2px solid",
                  borderColor: "background.paper",
                  "&:hover": { bgcolor: "primary.dark" },
                }}
              >
                <PhotoCameraOutlinedIcon sx={{ fontSize: "1.1rem" }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Only reachable while a picture exists (the badge opens the file
              picker directly when there is none): one menu holding both
              picture actions — เปลี่ยนรูปภาพ / ลบภาพ — instead of a separate
              "ลบภาพ" button sitting under the avatar. */}
          <Menu
            anchorEl={photoMenuEl}
            open={Boolean(photoMenuEl)}
            onClose={() => setPhotoMenuEl(null)}
            // the menu starts at the badge's bottom-right corner and grows
            // rightwards — anchoring its *right* edge to the badge (the
            // default guess) made it slide left over the avatar instead
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            <MenuItem
              onClick={() => {
                setPhotoMenuEl(null);
                handlePickPicture();
              }}
              disabled={uploading}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <ImageOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {t("profileChangePhoto")}
            </MenuItem>
            {hasAvatar && (
              <MenuItem
                onClick={() => {
                  setPhotoMenuEl(null);
                  void handleRemovePicture();
                }}
                disabled={removing}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon sx={{ minWidth: 32, color: "error.main" }}>
                  <DeleteOutlineIcon fontSize="small" />
                </ListItemIcon>
                {t("profileRemovePhoto")}
              </MenuItem>
            )}
          </Menu>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />

          <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mt: 0.5 }}>
            {user?.name || "—"}
          </Typography>
          <Chip size="small" label={user?.roleName || "—"} />
        </Box>

        {/* --- The card: plain text in view mode, inputs + a footer in edit mode --- */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            px: { xs: 2, sm: 3 },
            py: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              minHeight: 44,
              mb: 1,
            }}
          >
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              {t("sectionAccount")}
            </Typography>
            {/* one button for the whole card — it is what raises the footer */}
            {!editMode && (
              <Button
                size="small"
                variant="outlined"
                endIcon={<EditIcon sx={{ fontSize: "1rem" }} />}
                onClick={startEdit}
                sx={{ borderRadius: 999, textTransform: "none", px: 1.75 }}
              >
                {t("edit")}
              </Button>
            )}
          </Box>

          {/* name — only the value becomes an input, so the label column and
              every row under it stay exactly where they were */}
          <InfoRow label={t("profileName")}>
            {editMode ? (
              <TextField
                size="small"
                fullWidth
                autoFocus
                aria-label={t("profileName")}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFormError(null);
                }}
                onKeyDown={handleFieldKeyDown}
                inputProps={{ maxLength: 100, autoComplete: "name" }}
                error={trimmedName === ""}
              />
            ) : (
              <Typography variant="body2" color="text.primary">
                {trimmedName || "—"}
              </Typography>
            )}
          </InfoRow>

          {/* e-mail */}
          <InfoRow label={t("profileEmail")}>
            {editMode ? (
              <TextField
                type="email"
                size="small"
                fullWidth
                aria-label={t("profileEmail")}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                  setFormError(null);
                }}
                onKeyDown={handleFieldKeyDown}
                inputProps={{ autoComplete: "email" }}
                error={Boolean(emailError)}
              />
            ) : (
              <Typography variant="body2" color="text.primary">
                {trimmedEmail || "—"}
              </Typography>
            )}
          </InfoRow>

          {/* password — never editable in place: the change form opens from
              edit mode only. The reset link lives in the footer (bottom-left,
              one row with ยกเลิก / บันทึก) so this row stays uncluttered. */}
          <InfoRow
            label={t("profilePassword")}
            action={
              editMode ? (
                <LinkButton onClick={() => setEditor("password")}>
                  {t("changePassword")}
                </LinkButton>
              ) : undefined
            }
          >
            <Typography variant="body2" color="text.primary">
              {"••••••••"}
            </Typography>
          </InfoRow>

          {/* role is NOT a row — the header's chip already shows it (and a
              row under it just repeated the same word) */}

          {/* position — read-only, keyed off the id (not the name) so the late
              name lookup can never shove the rows below it down */}
          {Boolean(user?.positionId) && (
            <InfoRow label={t("profilePosition")}>
              <Typography variant="body2" color="text.primary">
                {user?.positionName || "—"}
              </Typography>
            </InfoRow>
          )}

          {/* company — a customer's only (every other role stores null), so a
              seat without one simply does not show this line */}
          {Boolean(user?.companyId) && (
            <InfoRow label={t("profileCompany")}>
              <Typography variant="body2" color="text.primary">
                {user?.companyName || "—"}
              </Typography>
            </InfoRow>
          )}
        </Box>
      </DialogContent>

      {/* The footer is always there so the reset link has a home (bottom-left,
          on the same row as ยกเลิก / บันทึก) — it is never an empty strip
          because the link is always in it. The buttons and the caption slot
          only appear while editing; the slot keeps the row at a fixed height
          when a validation message does show up. */}
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Box
          sx={{ flex: 1, minWidth: 0, minHeight: 40, display: "flex", alignItems: "center" }}
        >
          <LinkButton onClick={openPasswordReset}>{t("passwordResetLink")}</LinkButton>
        </Box>
        {formError && (
          <Typography variant="caption" color="error">
            {formError}
          </Typography>
        )}
        {editMode && (
          <>
            <Button color="inherit" onClick={cancelEdit} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {t("save")}
            </Button>
          </>
        )}
      </DialogActions>

      {/* ---------- Confirm the e-mail change (current password) ---------- */}
      <Dialog
        open={editor === "emailConfirm"}
        onClose={() => setEditor(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        <DialogTitle fontWeight={700}>{t("emailConfirmTitle")}</DialogTitle>
        <DialogContent>
          <PasswordScope email={user?.email ?? ""}>
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
              inputProps={{ autoComplete: "current-password" }}
            />
          </PasswordScope>
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
      {/* Never scrolls: MUI's paper defaults to `overflow-y: auto` (CSS then
          forces `overflow-x` to `auto` alongside it) and DialogContent adds
          another `overflow-y: auto`, which drew scrollbar tracks across a
          form that is only three fields and always sits inside
          `max-height: calc(100% - 64px)` — so the box just hugs its
          content. The compact spacing is what keeps it inside that cap on
          short windows. */}
      <Dialog
        open={editor === "password"}
        onClose={() => setEditor(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        <DialogTitle fontWeight={700}>{t("passwordDialogTitle")}</DialogTitle>
        <DialogContent sx={{ px: 3, pt: 1.5, pb: 1.5 }}>
          <PasswordScope email={user?.email ?? ""}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
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
              inputProps={{ autoComplete: "current-password" }}
              sx={{ mb: 1.5 }}
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
              inputProps={{ autoComplete: "new-password" }}
              sx={{ mb: 1.5 }}
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
              inputProps={{ autoComplete: "new-password" }}
              error={Boolean(pwError)}
              helperText={pwError ?? " "}
            />
          </PasswordScope>
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
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        <DialogTitle fontWeight={700}>{t("passwordResetTitle")}</DialogTitle>
        <DialogContent>
          <PasswordScope email={user?.email ?? ""}>
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
              inputProps={{ autoComplete: "new-password" }}
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
              inputProps={{ autoComplete: "new-password" }}
              error={Boolean(pwError)}
              helperText={pwError ?? " "}
            />
          </PasswordScope>
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
