"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { apiFetch, ApiError } from "@/lib/api";
import { Link } from "@/i18n/navigation";

/** Mirrors `ResetPasswordDto`'s `@MinLength(6)` — the same floor as signing in. */
const MIN_PASSWORD = 6;

function ResetPasswordInner() {
  const t = useTranslations("Reset");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // A link without a token can never work — say so and offer a fresh one.
  const brokenLink = !token;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(t("reset.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (err) {
      // 400 = unknown / expired / already-used token (or a too-short password)
      setError(
        err instanceof ApiError && err.status === 400
          ? t("reset.invalidToken")
          : t("reset.genericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: (theme) => theme.custom.loginGradient,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "-12%",
          right: "-6%",
          width: 620,
          height: 300,
          borderRadius: "50%",
          bgcolor: "common.white",
          opacity: 0.75,
          filter: "blur(70px)",
        }}
      />

      <Card
        elevation={6}
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          mx: 2,
          borderRadius: 4,
          boxShadow: (theme) => theme.custom.cardShadow,
        }}
      >
        <CardContent sx={{ px: 4, py: 5, textAlign: "center" }}>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            {t("reset.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {t("reset.subtitle")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, justifyContent: "center" }}>
              {error}
            </Alert>
          )}
          {done && (
            <Alert severity="success" sx={{ mb: 3, justifyContent: "center" }}>
              {t("reset.success")}
            </Alert>
          )}
          {brokenLink && !error && (
            <Alert severity="warning" sx={{ mb: 3, justifyContent: "center" }}>
              {t("reset.invalidToken")}
            </Alert>
          )}

          {!done && !brokenLink && (
            <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: "left" }}>
              <TextField
                fullWidth
                label={t("reset.password")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                sx={{ mb: 2.5 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? t("reset.hidePassword") : t("reset.showPassword")}
                          onClick={() => setShowPassword((v) => !v)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                fullWidth
                label={t("reset.confirm")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                sx={{ mb: 3 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  bgcolor: "navy.main",
                  color: "common.white",
                  borderRadius: 2,
                  py: 1.5,
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  "&:hover": { bgcolor: "navy.dark" },
                  "&.Mui-disabled": {
                    bgcolor: "navy.main",
                    color: "common.white",
                    opacity: 0.7,
                  },
                }}
              >
                {loading ? t("reset.saving") : t("reset.submit")}
              </Button>
            </Box>
          )}

          {(done || brokenLink) && (
            <Button
              component={Link}
              href={brokenLink ? "/forgot-password" : "/login"}
              variant="contained"
              fullWidth
              size="large"
              sx={{
                bgcolor: "navy.main",
                color: "common.white",
                borderRadius: 2,
                py: 1.5,
                fontSize: "1rem",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { bgcolor: "navy.dark" },
              }}
            >
              {brokenLink ? t("reset.requestNew") : t("reset.goToLogin")}
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
