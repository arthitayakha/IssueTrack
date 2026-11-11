"use client";

import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslations } from "next-intl";
import type { RuleDto } from "@kanban/shared";
import RuleWizard from "./rule-wizard";

interface RuleWizardDialogProps {
  /** `undefined` = สร้างกฎใหม่; มี rule = แก้ไขกฎนั้น (prefill จากค่าเดิม) */
  rule?: RuleDto;
  /** ปิดป๊อปอัพ (กด ✕ / กด "ยกเลิก" / บันทึกสำเร็จ) — host เป็นคนถือ state */
  onClose: () => void;
  /** ยิงหลังบันทึกสำเร็จ — host (RulesPanel) ใช้รีเฟรชรายการกฎ */
  onSaved?: () => void;
}

/**
 * ป๊อปอัพสร้าง/แก้ไขกฎ — **ทางเข้าเดียวของ `RuleWizard` ตอนนี้** ปุ่ม "สร้างกฎ"
 * กับไอคอนดินสอ "แก้ไข" ในแท็บระบบอัตโนมัติของ `/master-data` เปิดตัวนี้แทนการ
 * navigate ไปหน้าใหม่ (หน้า `/automation/new` กับ `/automation/[id]` ถูกถอดเป็น
 * 307 redirect ไปแท็บนั้นแล้ว — พวก bookmark เก่า/ลิงก์ notification จึงไม่ 404)
 * — mount ใหม่ทุกครั้งที่เปิด (host ตั้ง state = null เมื่อปิด) เพื่อให้ wizard
 * โหลด reference data + รายการกฎสำหรับเช็ค duplicate ใหม่ทุกครั้ง
 */
export default function RuleWizardDialog({ rule, onClose, onSaved }: RuleWizardDialogProps) {
  const tWizard = useTranslations("Automation.wizard");

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      /**
       * ความสูง **ฟิกเท่ากันทุก step/ทุกแท็บ** (680px, กันจอล้นด้วย 88vh) — เดิมไม่
       * กำหนด height เลย ความสูงจึงลอยตามเนื้อหา (step สั้นเตี้ย / step การ์ดยาว)
       * และปุ่มล่างจมหายตอนเลื่อน — flex column + overflow hidden เหมือน
       * system-detail-dialog: เนื้อหาส่วนที่เกินให้ "กล่องเนื้อหาใน wizard" เลื่อนเอง
       * — ความสูงต้องฟิกทุกขนาดจอ (ไม่ใช่ auto ที่ xs) ไม่งั้น overflow hidden จะตัดทิ้ง
       */
      PaperProps={{
        sx: {
          height: { xs: "calc(100% - 32px)", sm: 680 },
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle sx={{ px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {rule ? tWizard("editTitle") : tWizard("title")}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label={tWizard("cancel")}
            size="small"
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* ⚠️ อย่าใส่ `pt` เพื่อเว้นจาก DialogTitle — MUI บังคับ padding-top: 0 ให้
          DialogContent ที่อยู่ติด DialogTitle (เฉพาะตอนไม่ได้ใช้ dividers) ด้วย
          selector สองชั้น .MuiDialogTitle-root + .MuiDialogContent-root ซึ่งชนะ sx
          ทุกครั้ง → ช่องว่างใต้หัวป๊อปอัพต้องใส่ที่ <Stepper> (mt: 4 = 32px) ใน
          rule-wizard.tsx แทน (คนละ element ไม่ชน specificity)
          — padding ที่เหลือ: ซ้าย/ขวา/ล่าง 24/20px */}
      <DialogContent
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          p: { xs: 2, sm: 2.5 },
        }}
      >
        <RuleWizard initialRule={rule} onClose={onClose} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
