"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import { useNotification } from "@/components/notification";
import { errorMessage } from "@/lib/api";
import { createSystemReport } from "@/lib/system-reports-api";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * ฟอร์มแจ้ง **บั๊กของระบบเอง** จากศูนย์ช่วยเหลือ (คนละอย่างกับ /issues/new)
 * — ใช้ได้แม้หน้าแจ้งปัญหาปกติพัง ผู้ใช้แคปภาพมาแนบได้
 * `onDone` มีค่า = โหมดป๊อปอัพ (ส่งแล้วปิด) · ไม่มี = อยู่หน้าเดิมเหมือนฟอร์มทั่วไป
 */
export default function SystemReportForm({ onDone }: { onDone?: () => void }) {
  const t = useTranslations("SystemReports");
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) break;
        if (file.size > MAX_FILE_SIZE) continue;
        if (!/^(image\/|application\/pdf$)/.test(file.type)) continue;
        next.push(file);
      }
      return next;
    });
  };

  async function submit() {
    if (!title.trim() || !description.trim() || submitting) {
      notify(t("required"), "warning");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSystemReport({ title, description, pageUrl, files });
      notify(t("success"), "success");
      setTitle("");
      setDescription("");
      setPageUrl("");
      setFiles([]);
      onDone?.();
    } catch (e) {
      const message = errorMessage(e, t("error"));
      setError(message);
      notify(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="subtitle1" fontWeight={700}>
        {t("formTitle")}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label={t("fieldTitle")}
        placeholder={t("titlePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 200))}
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />
      <TextField
        label={t("fieldDescription")}
        placeholder={t("descriptionPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
        fullWidth
        required
        multiline
        minRows={4}
        maxRows={10}
        inputProps={{ maxLength: 5000 }}
      />
      <TextField
        label={t("fieldPage")}
        placeholder={t("pagePlaceholder")}
        value={pageUrl}
        onChange={(e) => setPageUrl(e.target.value.slice(0, 500))}
        fullWidth
        inputProps={{ maxLength: 500 }}
      />

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AttachFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
          >
            {t("fieldFiles")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("fileHint")}
        </Typography>
        {files.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
            {files.map((file, index) => (
              <Chip
                key={`${file.name}-${index}`}
                size="small"
                label={file.name}
                onDelete={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                deleteIcon={<CloseIcon />}
              />
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={submitting || !title.trim() || !description.trim()}
          startIcon={<SendIcon />}
        >
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </Box>
    </Box>
  );
}
