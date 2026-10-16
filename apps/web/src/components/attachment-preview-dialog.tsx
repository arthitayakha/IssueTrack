"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Button,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import { openAttachment, getToken, type Attachment } from "@/lib/board-api";

export default function AttachmentPreviewDialog({
  attachment,
  open,
  onClose,
}: {
  attachment: Attachment | null;
  open: boolean;
  onClose: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !attachment) {
      setObjectUrl(null);
      setError(null);
      return;
    }

    let revoked: string | null = null;
    setLoading(true);
    setError(null);

    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/attachments/${attachment.id}/download`,
      { headers },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoked = url;
        setObjectUrl(url);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });

    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, attachment]);

  const isImage = attachment?.fileType?.startsWith("image/") ?? false;
  const isPdf = attachment?.fileType === "application/pdf";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          borderRadius: 4,
          width: "90vw",
          maxWidth: "1200px",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, pt: 2, pb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }} noWrap>
          {attachment?.fileName ?? ""}
        </Typography>
        {attachment && (
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => openAttachment(attachment.id)}
          >
            ดาวน์โหลด
          </Button>
        )}
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
        {loading && <CircularProgress />}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && objectUrl && isImage && (
          <img
            src={objectUrl}
            alt={attachment?.fileName ?? ""}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        )}
        {!loading && !error && objectUrl && isPdf && (
          <iframe
            src={objectUrl}
            title={attachment?.fileName ?? ""}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        )}
        {!loading && !error && objectUrl && !isImage && !isPdf && (
          <Typography color="text.secondary">ไม่รองรับ preview สำหรับไฟล์ประเภทนี้</Typography>
        )}
      </Box>
    </Dialog>
  );
}
