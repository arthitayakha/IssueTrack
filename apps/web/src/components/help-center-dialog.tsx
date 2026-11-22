"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Box, Button, Dialog, DialogContent, IconButton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { usePermissions } from "@/lib/permissions";
import { useTranslations as useSystemTranslations } from "next-intl";
import SystemReportForm from "@/components/help-center/system-report-form";

type Menu = "guide1" | "faq" | "report" | "contact";

/** ศูนย์ช่วยเหลือ — 4 เมนูดาวน์โหลด: คู่มือ / ข้อถามบ่อย / แจ้งระบบ / ติดต่อแอดมิน */
export default function HelpCenterDialog({
  open,
  onClose,
  onOpenContact,
}: {
  open: boolean;
  onClose: () => void;
  onOpenContact: () => void;
}) {
  const tNav = useTranslations("Nav");
  const tSys = useSystemTranslations("SystemReports");
  const theme = useTheme();
  const { can } = usePermissions();
  const isAdmin = can("system_report.view");

  const [selectedMenu, setSelectedMenu] = useState<Menu>("guide1");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setSelectedMenu("guide1");
  }, [open]);

  // ── ข้อความ Translation pre-fetch ที่หัวคอมโพเนนต์ (ไม่ได้เรียกในฟังก์ชัน conft) ─────────────────────
  const navHelpCenter = tNav("helpCenter");
  const navHelpCenterReportLabel = tNav("helpCenterReportLabel");
  const navHelpCenterContactLabel = tNav("helpCenterContactLabel");
  const navHelpCenterGuide1 = tNav("helpCenterGuide1");
  const navHelpCenterGuide1Content = tNav("helpCenterGuide1Content");
  const faqQuestionsTitle = tNav("helpCenterFaqQuestionsTitle");
  const faqQ1 = tNav("faq.q1");
  const faqA1 = tNav("faq.a1");

  // ── 4 เมนูพร้อม icon emoji + sx + translation ────────────────────────
  const menus: Array<{
    key: Menu;
    label: string;
    desc: string;
    icon: ReactNode;
    color: "warning" | "success" | "primary";
  }> = [
    {
      key: "guide1",
      label: navHelpCenterGuide1,
      desc: navHelpCenterGuide1Content,
      icon: "📚",
      color: "primary",
    },
    {
      key: "faq",
      label: faqQuestionsTitle,
      desc: faqQ1, // ใช้ข้อความแรกเป็นตัวอย่าง
      icon: "❓",
      color: "success",
    },
    {
      key: "report",
      label: navHelpCenterReportLabel,
      desc: tNav("helpCenterReportDesc"),
      icon: "🐛",
      color: "warning",
    },
    {
      key: "contact",
      label: navHelpCenterContactLabel,
      desc: tNav("helpCenterContactDesc"),
      icon: "📞",
      color: "primary",
    },
  ];

  const filtered = menus.filter((m) =>
    `${m.label} ${m.desc}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // ── หาเมนูที่เลือก ──────────────────────────────────────────────────
  function selectMenu(key: Menu) {
    setSelectedMenu(key);
  }

  // ── เนื้อหาแต่ละเมนู (เรียกใช้ tSys กับ tNav ที่หัวคอมโพเนนต์แล้วรับคืนมา) ───────────────────────
  function renderGuide1() {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {navHelpCenterGuide1Content}
        </Typography>
      </Box>
    );
  }

  function renderFaq() {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {faqQ1}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={2}>
          {faqA1}
        </Typography>
      </Box>
    );
  }

  function renderReport() {
    if (isAdmin) {
      // แอดมิน = รายงานทั้งหมด (พร้อมชื่อผู้แจ้ง)
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {tSys("adminReportsEmpty")}
          </Typography>
        </Box>
      );
    }
    // ลูกค้า = ฟอร์มแจ้งปัญหา
    return (
      <Box sx={{ p: 2 }}>
        <SystemReportForm onDone={() => setSelectedMenu("contact")} />
      </Box>
    );
  }

  function renderContact() {
    if (isAdmin) {
      // แอดมิน = ติดต่อแอดมินด้วยตัวเอง
      onOpenContact();
      return null;
    }
    // ลูกค้า = ป๊อปอัพติดต่อแอดมิน
    onOpenContact();
    return null;
  }

  // ── หัวเรื่องขึ้นกับเมนูที่เลือก ───────────────────────────────────────
  const menuHeaderMap = {
    guide1: navHelpCenterGuide1,
    faq: navHelpCenterGuide1,
    report: navHelpCenterReportLabel,
    contact: navHelpCenterContactLabel,
  };

  if (!open) return null;

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: { p: 1, overflow: "auto" } }}
      sx={{ p: 0 }}
    >
      <DialogContent sx={{ p: 0, ...{ maxHeight: "calc(100vh - 160px)" } }}>
        {/* หัวกรอบ */}{" "}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 2.5,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.info.main, 0.04)})`,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              bgcolor: alpha(theme.palette.primary.main, 0.16),
              color: "primary.main",
              boxShadow: theme.custom.cardShadow,
              flexShrink: 0,
            }}
          >
            &rdquo;🎧&ldquo;
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {tNav("helpCenter")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              IssueTrack Help Center
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label={tNav("close")}>
            <span aria-hidden="true">×</span>
          </IconButton>
        </Box>

        {/* รายการเมนูดาวน์โหลด */}{" "}
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          {/* หัวข้อขึ้นกับเมนูที่เลือก */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            {menuHeaderMap[selectedMenu]}
          </Typography>

          {/* ปุ่มเมนู 4 อัน */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {menus.map((m) => (
              <Button
                key={m.key}
                variant="text"
                sx={{
                  my: 1,
                  borderRadius: 2,
                  textTransform: "none",
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: "primary.main",
                  px: 1.5,
                  "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                }}
                onClick={() => selectMenu(m.key)}
                startIcon={<span style={{ fontSize: 18, marginRight: 0.5 }}>{m.icon}</span>}
              >
                {m.label}
              </Button>
            ))}
          </Box>

          {/* ค้นหา */}
          {filtered.length > 0 ? (
            <Box sx={{ p: 1, bgcolor: "action.hover", borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {tNav("helpCenterSearch")}: {query}
              </Typography>
            </Box>
          ) : null}

          {/* เนื้อหาขึ้นกับเมนูที่เลือก */}
          {selectedMenu === "guide1" && renderGuide1()}
          {selectedMenu === "faq" && renderFaq()}
          {selectedMenu === "report" && renderReport()}
          {selectedMenu === "contact" && renderContact()}
        </Box>
      </DialogContent>
    </Dialog>
    </>
  );
}