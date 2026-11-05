"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { apiFetch, ApiError } from "@/lib/api";
import { Link } from "@/i18n/navigation";

/**
 * Step 1 of "forgot password": ask for the e-mail and POST it. The answer is
 * always the same success copy — the API never says whether the address has
 * an account, so this page must not either.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations("Reset");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email, locale }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reset.genericError"));
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
            {t("forgot.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {t("forgot.subtitle")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, justifyContent: "center" }}>
              {error}
            </Alert>
          )}
          {sent && (
            <Alert severity="success" sx={{ mb: 3, justifyContent: "center" }}>
              {t("forgot.success")}
            </Alert>
          )}

          {!sent && (
            <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: "left" }}>
              <TextField
                fullWidth
                label={t("forgot.title")}
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
                {loading ? t("forgot.sending") : t("forgot.submit")}
              </Button>
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mt: 3 }}>
            <IconButton
              component={Link}
              href="/login"
              size="small"
              aria-label={t("forgot.backToLogin")}
              title={t("forgot.backToLogin")}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" color="text.secondary">
              {t("forgot.backToLogin")}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
