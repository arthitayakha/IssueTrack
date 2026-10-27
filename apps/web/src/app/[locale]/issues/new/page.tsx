"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Divider,
  IconButton,
  ListItemButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PostAddIcon from "@mui/icons-material/PostAdd";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { useAuthStore } from "@/lib/auth-store";
import { isApiError } from "@/lib/api";
import { useNotification } from "@/components/notification";
import {
  createIssue,
  fetchApps,
  fetchCategories,
  fetchStatuses,
  uploadAttachment,
  type App,
  type IssueStatus,
} from "@/lib/board-api";
import { useRouter } from "@/i18n/navigation";

function getErrorMessage(e: unknown, fallback: string): string | null {
  if (isApiError(e, 403)) return null;
  return e instanceof Error ? e.message : fallback;
}

const OTHER_CATEGORY = "อื่น ๆ";

export default function ReportIssuePage() {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();

  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [appId, setAppId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusId, setStatusId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const catDropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchStatuses(), fetchCategories(), fetchApps()])
      .then(([sts, cats, appsRes]) => {
        if (cancelled) return;
        const stsData = sts.status === "fulfilled" ? sts.value.data : [];
        const catsData = cats.status === "fulfilled" ? cats.value.data : [];
        const appsData = appsRes.status === "fulfilled" ? appsRes.value.data : [];
        setStatuses(stsData);
        setCategories(catsData);
        setApps(appsData);
        setStatusId(stsData[0]?.id ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allCategories = useMemo(() => {
    const hasOther = categories.some((c) => c.name === OTHER_CATEGORY);
    if (hasOther) return categories;
    return [...categories, { id: -1, name: OTHER_CATEGORY }];
  }, [categories]);

  const filteredCategories = allCategories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedCategory = allCategories.find((c) => c.id === categoryId) ?? null;
  const isOtherSelected = selectedCategory?.name === OTHER_CATEGORY;
  const visibleApps = useMemo(() => apps.filter((a) => a.isVisible), [apps]);
  const canSubmit =
    statuses.length > 0 &&
    title.trim().length > 0 &&
    appId !== null &&
    (selectedCategory !== null || customCategory.trim().length > 0);

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length > 0) {
      setFiles((prev) => [...prev, ...incoming]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const issue = await createIssue({
        title: title.trim(),
        description: description.trim(),
        statusId: statusId as number,
        appId: appId ?? undefined,
        categoryId: selectedCategory && !isOtherSelected ? selectedCategory.id : undefined,
        customCategory: isOtherSelected ? customCategory.trim() : undefined,
      });
      if (files.length > 0) {
        await Promise.all(files.map((file) => uploadAttachment(issue.id, file)));
      }
      // Stay on the form and confirm — the new issue shows up first on the
      // board and in the issue list (both are ordered newest first).
      notify(t("reportSuccess"), "success");
      setTitle("");
      setDescription("");
      setFiles([]);
      setCategoryId(null);
      setCustomCategory("");
      setSearchQuery("");
    } catch (e) {
      setError(getErrorMessage(e, t("errorSubmit")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequirePermission permission="issue.create">
      <DashboardLayout>
        <Box sx={{ py: 3, maxWidth: 760, mx: "auto" }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Paper
            sx={{
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: theme.custom.cardShadow,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2.5, pb: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: "sky.light",
                  flexShrink: 0,
                }}
              >
                <PostAddIcon sx={{ fontSize: 26, color: "primary.main" }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {t("reportIssueTitle")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("reportIssueSubtitle")}
                </Typography>
              </Box>
            </Box>
            <Divider />

            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box sx={{ p: 2.5 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ mb: 0.75, display: "flex", alignItems: "center" }}
                  >
                    {t("title")}
                    <Box component="span" sx={{ color: "error.main" }}>
                      {" *"}
                    </Box>
                  </Typography>
                  <TextField
                    autoFocus
                    size="small"
                    fullWidth
                    placeholder={t("titlePlaceholder")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ mb: 0.75, display: "flex", alignItems: "center" }}
                  >
                    {t("app")}
                    <Box component="span" sx={{ color: "error.main" }}>
                      {" *"}
                    </Box>
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    select
                    SelectProps={{ displayEmpty: true }}
                    value={appId ?? ""}
                    onChange={(e) =>
                      setAppId(e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <MenuItem value="" disabled>
                      <em>{t("appPlaceholder")}</em>
                    </MenuItem>
                    {visibleApps.map((app) => (
                      <MenuItem key={app.id} value={app.id}>
                        {app.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <ClickAwayListener onClickAway={() => setCatDropOpen(false)}>
                  <Box ref={catDropRef} sx={{ position: "relative", mb: 2 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ mb: 0.75, display: "flex", alignItems: "center" }}
                    >
                      {t("category")}
                      <Box component="span" sx={{ color: "error.main" }}>
                        {" *"}
                      </Box>
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder={t("categoryPlaceholder")}
                      value={selectedCategory?.name ?? ""}
                      onClick={() => setCatDropOpen(!catDropOpen)}
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <ArrowDropDownIcon
                            sx={{
                              fontSize: 20,
                              color: "text.secondary",
                              transform: catDropOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.2s",
                            }}
                          />
                        ),
                      }}
                      sx={{
                        cursor: "pointer",
                        "& .MuiOutlinedInput-root": {
                          cursor: "pointer",
                        },
                        "& input": {
                          cursor: "pointer",
                        },
                      }}
                    />

                    {catDropOpen && (
                      <Paper
                        sx={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          mt: 0.5,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1.5,
                          boxShadow: theme.custom.cardShadow,
                          overflow: "hidden",
                        }}
                      >
                        <TextField
                          size="small"
                          fullWidth
                          autoFocus
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("searchPlaceholder")}
                          InputProps={{
                            startAdornment: (
                              <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />
                            ),
                          }}
                          sx={{
                            p: 1,
                            "& .MuiOutlinedInput-root": {
                              "& fieldset": { border: "none" },
                            },
                          }}
                        />

                        <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                          {filteredCategories.length > 0 ? (
                            filteredCategories.map((cat) => (
                              <ListItemButton
                                key={cat.id}
                                onClick={() => {
                                  setCategoryId(cat.id);
                                  setCatDropOpen(false);
                                  setSearchQuery("");
                                }}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                  px: 2,
                                  py: 1.25,
                                  bgcolor: categoryId === cat.id ? "sky.dark" : "transparent",
                                  "&:hover": { bgcolor: categoryId === cat.id ? "sky.dark" : "action.hover" },
                                }}
                              >
                                <Typography variant="body2" sx={{ flex: 1 }}>
                                  {cat.name}
                                </Typography>
                                {categoryId === cat.id && (
                                  <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />
                                )}
                              </ListItemButton>
                            ))
                          ) : (
                            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
                              <Typography variant="body2" color="text.disabled">
                                {t("noCategory")}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Paper>
                    )}
                  </Box>
                </ClickAwayListener>

                {isOtherSelected && (
                  <TextField
                    size="small"
                    label={t("otherPlaceholder")}
                    fullWidth
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder={t("otherPlaceholder")}
                    sx={{ mb: 2 }}
                  />
                )}

                {statuses.length === 0 && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    {t("noColumnsWarning")}
                  </Alert>
                )}

                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ mb: 0.75, display: "flex", alignItems: "center" }}
                  >
                    {t("description")}
                    <Box component="span" sx={{ color: "error.main" }}>
                      {" *"}
                    </Box>
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={5}
                    placeholder={t("descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    inputProps={{ maxLength: 1000 }}
                  />
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {description.length} / 1000
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ mb: 0.75, display: "flex", alignItems: "center" }}
                  >
                    {t("attachFiles")}
                  </Typography>
                  <Box
                    role="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    sx={{
                      border: "2px dashed",
                      borderColor: isDragOver ? "primary.main" : "divider",
                      bgcolor: isDragOver ? "sky.dark" : "background.default",
                      borderRadius: 2,
                      p: 3,
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "background-color 0.2s, border-color 0.2s",
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        bgcolor: "primary.light",
                        color: "primary.contrastText",
                        mx: "auto",
                        mb: 1.5,
                      }}
                    >
                      <CloudUploadIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography variant="body2">
                      {t("dropFiles")}{" "}
                      <Box
                        component="span"
                        sx={{
                          color: "primary.main",
                          fontWeight: 600,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        {t("selectFiles")}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {t("fileHint")}
                    </Typography>
                  </Box>
                  {files.length > 0 && (
                    <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
                      {files.map((file, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            p: 0.75,
                            px: 1.5,
                            bgcolor: "sky.dark",
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "sky.main",
                          }}
                        >
                          <AttachFileIcon sx={{ fontSize: 16, color: "navy.main" }} />
                          <Typography
                            variant="caption"
                            sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: "navy.main" }}
                          >
                            {file.name}
                          </Typography>
                          <IconButton size="small" onClick={() => removeFile(index)} sx={{ p: 0.2 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                  <Button
                    onClick={() => router.push("/boards")}
                    color="inherit"
                    size="small"
                    disabled={submitting}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={!canSubmit || submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : <SendIcon />}
                    size="small"
                  >
                    {t("submitReport")}
                  </Button>
                </Box>
              </Box>
            )}
          </Paper>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
