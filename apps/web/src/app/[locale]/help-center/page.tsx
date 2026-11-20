"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from "@mui/material";

/** หน้าช่วยเหลือศูนย์ช่วยเหลือ — แสดงผล 4 หัวขอบนหน้าเดียว */
export default function HelpCenterPage() {
  const t = useTranslations("Nav");
  const [activeTab, setActiveTab] = useState(1);

  const guides = [
    {
      key: "helpCenterGuide1",
      label: t("helpCenterGuide1"),
      title: t("helpCenterGuide1Title"),
      content: t("helpCenterGuide1Content"),
    },
    {
      key: "helpCenterGuide2",
      label: t("helpCenterGuide2"),
      title: t("helpCenterGuide2Title"),
      content: t("helpCenterGuide2Content"),
    },
    {
      key: "helpCenterGuide3",
      label: t("helpCenterGuide3"),
      title: t("helpCenterGuide3Title"),
      content: t("helpCenterGuide3Content"),
    },
    {
      key: "helpCenterGuide4",
      label: t("helpCenterGuide4"),
      title: t("helpCenterGuide4Title"),
      content: t("helpCenterGuide4Content"),
    },
  ];

  useEffect(() => {
    // เริ่มที่หัวที่ 1 เมื่อโหลดหน้า
    setActiveTab(1);
  }, []);

  if (activeTab < 1 || activeTab > 4) {
    setActiveTab(1);
    return null;
  }

  const guide = guides[activeTab - 1];

  // handler เปลี่ยนแท็บ
  const handleTabClick = (tabNum: number) => {
    setActiveTab(tabNum);
  };

  // สร้าง sx object โดยไม่มี onClick
  const tabSx = (tabNum: number, isActive: boolean) => ({
    borderBottom: "1px solid",
    borderColor: "divider",
    mb: 2,
    p: 1,
    cursor: "pointer",
    fontWeight: isActive ? 600 : 400,
    _hover: { color: "primary" },
  });

  return (
    <Box
      sx={{
        py: 4,
        px: 2,
        maxWidth: 600,
        mx: "auto",
      }}
    >
      <Box sx={{ mb: 3, borderBottom: "1px solid", borderColor: "divider", pb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {t("helpCenterTitle")}
        </Typography>
      </Box>

      <Box sx={{ pt: 2 }}>
        {/* การ์ดที่ 1 */}
        <Box
          sx={tabSx(1, activeTab === 1)}
          onClick={() => handleTabClick(1)}
        >
          {guide.label}
        </Box>
        {activeTab === 1 && (
          <Box sx={{ p: 1, fontStyle: "italic" }}>
            {guide.title}
          </Box>
        )}
        {activeTab === 1 && (
          <Box sx={{ p: 1 }}>
            {guide.content}
          </Box>
        )}

        {/* การ์ดที่ 2 */}
        <Box
          sx={tabSx(2, activeTab === 2)}
          onClick={() => handleTabClick(2)}
        >
          {guides[1].label}
        </Box>
        {activeTab === 2 && (
          <Box sx={{ p: 1, fontStyle: "italic" }}>
            {guides[1].title}
          </Box>
        )}
        {activeTab === 2 && (
          <Box sx={{ p: 1 }}>
            {guides[1].content}
          </Box>
        )}

        {/* การ์ดที่ 3 */}
        <Box
          sx={tabSx(3, activeTab === 3)}
          onClick={() => handleTabClick(3)}
        >
          {guides[2].label}
        </Box>
        {activeTab === 3 && (
          <Box sx={{ p: 1, fontStyle: "italic" }}>
            {guides[2].title}
          </Box>
        )}
        {activeTab === 3 && (
          <Box sx={{ p: 1 }}>
            {guides[2].content}
          </Box>
        )}

        {/* การ์ดที่ 4 */}
        <Box
          sx={tabSx(4, activeTab === 4)}
          onClick={() => handleTabClick(4)}
        >
          {guides[3].label}
        </Box>
        {activeTab === 4 && (
          <Box sx={{ p: 1, fontStyle: "italic" }}>
            {guides[3].title}
          </Box>
        )}
        {activeTab === 4 && (
          <Box sx={{ p: 1 }}>
            {guides[3].content}
          </Box>
        )}
      </Box>

      <Box sx={{ mt: 4, textAlign: "right" }}>
        <Button
          variant="contained"
          sx={{ mx: 1 }}
          onClick={() => window.history.back()}
        >
          {t("close")}
        </Button>
      </Box>
    </Box>
  );
}