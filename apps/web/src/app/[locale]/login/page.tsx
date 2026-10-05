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
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthUser, useAuthStore } from "@/lib/auth-store";
import { useRouter } from "@/i18n/navigation";

function LoginPageInner() {
  const t = useTranslations("Login");
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ accessToken: string; user: AuthUser }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setSession(res.accessToken, res.user, rememberMe);
      router.push(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
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
          left: "-8%",
          width: 520,
          height: 260,
          borderRadius: "50%",
          bgcolor: "common.white",
          opacity: 0.85,
          filter: "blur(60px)",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "-18%",
          right: "-6%",
          width: 620,
          height: 300,
          borderRadius: "50%",
          bgcolor: "common.white",
          opacity: 0.75,
          filter: "blur(70px)",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "4%",
          left: "22%",
          width: 380,
          height: 180,
          borderRadius: "50%",
          bgcolor: "common.white",
          opacity: 0.6,
          filter: "blur(55px)",
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
          <Box
            sx={{
              width: 44,
              height: 44,
              mx: "auto",
              mb: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "grey.50",
              color: "primary.main",
            }}
          >
            <NoteAltOutlinedIcon fontSize="small" />
          </Box>

          <Typography variant="h5" fontWeight={700} color="text.primary">
            {t("title")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, justifyContent: "center" }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: "left" }}>
            <TextField
              fullWidth
              label={t("email")}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{ mb: 3 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <MailOutlineIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              fullWidth
              label={t("password")}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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

            <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 3, mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    {t("rememberMe")}
                  </Typography>
                }
              />
            </Box>

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
              {loading ? t("submitting") : t("submit")}
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            {t("footerHelp")}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
