"use client";

import { useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
const MAX_DESCRIPTION = 1000;

/**
 * ฟอร์มแจ้ง **บั๊กของระบบเอง** จากศูนย์ช่วยเหลือ (คนละอย่างกับ /issues/new)
 * — ใช้ได้แม้หน้าแจ้งปัญหาปกติพัง ผู้ใช้แคปภาพมาแนบได้
 * `onDone` มีค่า = โหมดป๊อปอัพ (ส่งแล้วปิด) · `onCancel` = ปุ่มยกเลิก
 */
export default function SystemReportForm({
  onDone,
  onCancel,
}: {
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("SystemReports");
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // หน้าศูนย์ช่วยเหลือไม่โชว์ช่องประเภทปัญหา — API ยังบังคับอยู่จึงส่ง "อื่น ๆ" ให้เสมอ
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  async function submit() {
    if (!title.trim() || !description.trim() || submitting) {
      notify(t("required"), "warning");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSystemReport({
        title,
        description,
        problemType: "other",
        pageUrl: "",
        files,
      });
      notify(t("success"), "success");
      setTitle("");
      setDescription("");
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography variant="subtitle1" fontWeight={700}>
        {t("formTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
        {t("formIntro")}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {/* ฟอร์มฝั่งผู้ใช้เหลือแค่ หัวข้อ / รายละเอียด / ไฟล์แนบ */}
      <TextField
        label={t("fieldTitle")}
        placeholder={t("titlePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 200))}
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />

      <Divider />

      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.75 }}>
          <Typography variant="body2" fontWeight={600}>
            {t("fieldDescription")} <Box component="span" color="error.main">*</Box>
          </Typography>
          <Typography variant="caption" color={description.length >= MAX_DESCRIPTION ? "warning.main" : "text.secondary"}>
            {description.length}/{MAX_DESCRIPTION}
          </Typography>
        </Box>
        <TextField
          placeholder={t("descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
          fullWidth
          required
          multiline
          minRows={4}
          maxRows={8}
          inputProps={{ maxLength: MAX_DESCRIPTION }}
        />
      </Box>

      <Divider />

      <Box>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
          {t("fieldFiles")}
        </Typography>
        <Box
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          sx={{
            border: "1px dashed",
            borderColor: dragging ? "primary.main" : "divider",
            bgcolor: dragging ? "action.hover" : "background.default",
            borderRadius: 2,
            p: 2.5,
            textAlign: "center",
            cursor: files.length >= MAX_FILES ? "not-allowed" : "pointer",
            transition: "border-color .15s, background-color .15s",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              mx: "auto",
              mb: 1,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: "action.hover",
              color: "primary.main",
            }}
          >
            <AttachFileIcon />
          </Box>
          <Typography variant="body2" sx={{ mt: 0.25 }}>
            {t("fileDropTitle")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("fileDropHint")}
          </Typography>
        </Box>
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
        {files.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
            {files.map((file, index) => (
              <Chip
                key={`${file.name}-${index}`}
                size="small"
                variant="outlined"
                label={file.name}
                onDelete={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                deleteIcon={<CloseIcon />}
              />
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.25, pt: 0.5 }}>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel} disabled={submitting}>
            {t("cancel")}
          </Button>
        )}
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
