"use client";

import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { useTranslations } from "next-intl";
import { errorMessage } from "@/lib/api";
import { fetchCompanies } from "@/lib/apps-api";
import {
  fetchHelpCenterContactConfig,
  fetchProgrammerContacts,
  updateHelpCenterContact,
} from "@/lib/help-center-api";
import type { ContractContact } from "@/lib/notifications-api";
import { useNotification } from "@/components/notification";
import { appDialogContentSizing } from "@/components/common/dialog-style";

/** map company id → programmer id[] · ไม่มี key = บริษัทนั้นไม่มีผู้ติดต่อ */
type CompanyContacts = Record<string, number[]>;

/**
 * ขนาดของ dialog นี้ **ไม่ใช้** `appDialogPaperSx` ที่ล็อก shared 560×480
 * (popup อื่นต้องไม่กระทบ) — ล็อกเฉพาะที่นี่ให้กว้างขึ้นตามที่ต้องการ
 */
const DIALOG_WIDTH = 860;
const DIALOG_HEIGHT = 640;
const dialogSize = {
  width: `${DIALOG_WIDTH}px`,
  height: `${DIALOG_HEIGHT}px`,
  minWidth: `${DIALOG_WIDTH}px`,
  maxWidth: `${DIALOG_WIDTH}px`,
  minHeight: `${DIALOG_HEIGHT}px`,
  maxHeight: `${DIALOG_HEIGHT}px`,
  flexShrink: 0,
  flexGrow: 0,
  overflow: "hidden",
  resize: "none",
  borderRadius: 3,
};
const localPaperSx = dialogSize;
const localDialogSx = {
  "& .MuiDialog-paper": {
    ...dialogSize,
    width: `${DIALOG_WIDTH}px !important`,
    height: `${DIALOG_HEIGHT}px !important`,
    minWidth: `${DIALOG_WIDTH}px !important`,
    maxWidth: `${DIALOG_WIDTH}px !important`,
    minHeight: `${DIALOG_HEIGHT}px !important`,
    maxHeight: `${DIALOG_HEIGHT}px !important`,
  },
};

/** วงกลมอักษรย่อ — ดึงสีจาก theme เสมอ (ห้าม hardcode hex) */
const AVATAR_COLORS = [
  "primary.main",
  "info.main",
  "success.main",
  "warning.main",
  "secondary.main",
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function namesOf(ids: number[], programmers: ContractContact[]) {
  return ids
    .map((id) => programmers.find((p) => p.userId === id))
    .filter((p): p is ContractContact => Boolean(p));
}

/**
 * "จัดการผู้ติดต่อ" — แอดมินเลือกเองรายบริษัทว่าโปรแกรมเมอร์คนไหนที่ลูกค้าเห็น
 * โหมดอ่าน = การ์ดโปรไฟล์ + ปุ่ม "แก้ไข"; โหมดแก้ไข = chip + "+" ที่เปิด popover
 * เลือก/ลบคนแบบเดียวกับหน้า /boards · **ไม่มีรายชื่อหลัก/ข้อมูลติดต่อกลาง**
 *
 * **ไม่มีปุ่ม "บันทึก" ท้ายป๊อปอัพ** (ผู้ใช้: "จะให้มีปุ่มบันทึกทำไมหล่ะ") —
 * การกด **"เสร็จ"** ของการ์ดนั้นคือการเซฟทันที (PATCH ทั้ง map) · กดปิด ✎
 * ตอนยังแก้ไม่เสร็จ = ทิ้ง draft การ์ดนั้น (ไม่เขียนโดยไม่รู้ตัว)
 */
export default function ManageContactsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useTranslations("SystemReports");
  const tb = useTranslations("Boards.detail");
  const { notify } = useNotification();
  const [programmers, setProgrammers] = useState<ContractContact[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [draft, setDraft] = useState<CompanyContacts>({});
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [memberPicker, setMemberPicker] = useState<{
    companyId: number;
    anchor: HTMLElement;
  } | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** มีการแก้ draft ยังไม่เซฟหรือไม่ — ใช้กันปิดป๊อปอัพแล้วทิ้งของที่แก้ไว้ */
  const [dirty, setDirty] = useState(false);
  /** config ล่าสุดที่เซฟสำเร็จ — ใช้คืนค่าเมื่อกดปิดโดยยังไม่กด "เสร็จ" */
  const savedRef = useRef<CompanyContacts>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setEditingCompanyId(null);
    setMemberPicker(null);
    setMemberSearch("");
    setDirty(false);
    void Promise.all([
      fetchProgrammerContacts(),
      fetchHelpCenterContactConfig(),
      fetchCompanies(),
    ])
      .then(([people, contact, companyPage]) => {
        if (cancelled) return;
        setProgrammers(people);
        setCompanies(companyPage.data.map((c) => ({ id: c.id, name: c.name })));
        setDraft(contact.contactUsersByCompany);
        savedRef.current = contact.contactUsersByCompany;
      })
      .catch(() => {
        if (!cancelled) notify(t("manageContactsLoadError"), "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open; `notify` from context is not a stable dep
  }, [open]);

  /**
   * กด **"เสร็จ"** = เซฟทันที · API แทนที่ทั้ง map จึงส่ง `draft` ทั้งแผนที่
   * (ใช้ค่าที่ตอบกลับเพราะเซิร์ฟเวอร์ normalise รายการที่กรอกไม่ถูกต้องอยู่แล้ว)
   * พัง → แจ้งเตือนและ **ค้างในโหมดแก้ไข** ไม่หลุดกลับไปโชว์ข้อมูลเก่า
   */
  async function commit(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      const saved = await updateHelpCenterContact({ contactUsersByCompany: draft });
      setDraft(saved.contactUsersByCompany);
      savedRef.current = saved.contactUsersByCompany;
      setDirty(false);
      notify(t("manageContactsSaved"), "success");
      onSaved?.();
      return true;
    } catch (e) {
      notify(errorMessage(e, t("manageContactsSaveError")), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** ปิดด้วย ✎ / ESC / backdrop — ยังแก้ไม่เสร็จ = ทิ้ง draft (ไม่เขียนโดยไม่รู้ตัว) */
  function handleClose() {
    if (saving) return;
    if (dirty) {
      setDraft(savedRef.current);
      setDirty(false);
    }
    setEditingCompanyId(null);
    setMemberPicker(null);
    setMemberSearch("");
    onClose();
  }

  async function toggleEdit(companyId: number) {
    if (saving) return;
    if (editingCompanyId === companyId) {
      // "เสร็จ" = เซฟทันที (ไม่มีปุ่มบันทึกแยกท้ายป๊อปอัพ)
      if (dirty && !(await commit())) return;
      setEditingCompanyId(null);
      setMemberPicker(null);
      setMemberSearch("");
      return;
    }
    // ย้ายไปการ์ดอื่นโดยการ์ดเดิมยังแก้ค้างอยู่ → เซฟก่อน ไม่งั้นของที่แก้หาย
    if (editingCompanyId !== null && dirty && !(await commit())) return;
    setEditingCompanyId(companyId);
    setMemberPicker(null);
    setMemberSearch("");
  }

  function addCompanyId(key: string, id: number) {
    if ((draft[key] ?? []).includes(id)) return;
    setDraft((d) => ({ ...d, [key]: [...(d[key] ?? []), id] }));
    setDirty(true);
  }

  function removeCompanyId(key: string, id: number) {
    if (!(draft[key] ?? []).includes(id)) return;
    setDraft((d) => ({ ...d, [key]: (d[key] ?? []).filter((x) => x !== id) }));
    setDirty(true);
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      PaperProps={{ sx: localPaperSx }}
      sx={localDialogSx}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {t("manageContactsTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("manageContactsHint")}
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose} aria-label={t("cancel")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={appDialogContentSizing}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("contactCompanyTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
              {t("contactCompanyHint")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1.5 }}>
              {companies.map((c) => {
                const key = String(c.id);
                const ids = draft[key] ?? [];
                const value = namesOf(ids, programmers);
                const editing = editingCompanyId === c.id;
                const query = memberSearch.trim().toLowerCase();
                const matches = (p: ContractContact) =>
                  !query ||
                  p.name.toLowerCase().includes(query) ||
                  (p.email ?? "").toLowerCase().includes(query);
                const selectedShown = value.filter(matches);
                const availableShown = programmers.filter(
                  (p) => !ids.includes(p.userId) && matches(p),
                );
                return (
                  <Box
                    key={c.id}
                    sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.75 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
                        {c.name}
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={editing ? <CheckIcon /> : <EditIcon />}
                        onClick={() => void toggleEdit(c.id)}
                        disabled={loading || saving}
                      >
                        {editing ? t("contactDone") : t("contactEdit")}
                      </Button>
                    </Box>

                    {editing ? (
                      <>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                          {value.map((p) => (
                            <Chip
                              key={p.userId}
                              size="small"
                              label={p.name}
                              onDelete={() => removeCompanyId(key, p.userId)}
                              disabled={loading || saving}
                            />
                          ))}
                          <IconButton
                            size="small"
                            aria-label={tb("addMembers")}
                            onClick={(e) => {
                              setMemberSearch("");
                              setMemberPicker({ companyId: c.id, anchor: e.currentTarget });
                            }}
                            sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Box>
                        <Popover
                          open={memberPicker?.companyId === c.id}
                          anchorEl={memberPicker?.anchor ?? null}
                          onClose={() => setMemberPicker(null)}
                          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                          transformOrigin={{ vertical: "top", horizontal: "left" }}
                          PaperProps={{
                            sx: {
                              width: 280,
                              p: 1.5,
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                            },
                          }}
                        >
                          <TextField
                            size="small"
                            placeholder={tb("searchMembers")}
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            autoFocus
                          />
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {t("contactMembersInCompany")}
                            </Typography>
                            {selectedShown.length === 0 ? (
                              <Typography variant="caption" color="text.secondary">
                                {tb("noMembers")}
                              </Typography>
                            ) : (
                              selectedShown.map((p) => (
                                <Box
                                  key={p.userId}
                                  sx={{ display: "flex", alignItems: "center", gap: 0.75, p: 0.5 }}
                                >
                                  <Avatar
                                    sx={{
                                      width: 28,
                                      height: 28,
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      bgcolor: AVATAR_COLORS[
                                        programmers.findIndex((x) => x.userId === p.userId) %
                                          AVATAR_COLORS.length
                                      ],
                                      color: "background.paper",
                                    }}
                                  >
                                    {initials(p.name)}
                                  </Avatar>
                                  <Typography variant="body2" sx={{ flex: 1 }}>
                                    {p.name}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    disabled={loading || saving}
                                    onClick={() => removeCompanyId(key, p.userId)}
                                    aria-label={t("cancel")}
                                  >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Box>
                              ))
                            )}
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {tb("addMembers")}
                            </Typography>
                            <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                              {availableShown.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">
                                  {tb("noMembers")}
                                </Typography>
                              ) : (
                                availableShown.map((p) => (
                                  <Box
                                    key={p.userId}
                                    onClick={() => {
                                      if (!loading && !saving) addCompanyId(key, p.userId);
                                    }}
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.75,
                                      p: 0.75,
                                      borderRadius: 1,
                                      cursor: loading || saving ? "default" : "pointer",
                                      "&:hover": { bgcolor: "action.hover" },
                                    }}
                                  >
                                    <Avatar
                                      sx={{
                                        width: 28,
                                        height: 28,
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        bgcolor: AVATAR_COLORS[
                                          programmers.findIndex((x) => x.userId === p.userId) %
                                            AVATAR_COLORS.length
                                        ],
                                        color: "background.paper",
                                      }}
                                    >
                                      {initials(p.name)}
                                    </Avatar>
                                    <Typography variant="body2">{p.name}</Typography>
                                  </Box>
                                ))
                              )}
                            </Box>
                          </Box>
                        </Popover>
                      </>
                    ) : value.length > 0 ? (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {value.map((p, index) => (
                          <Box
                            key={p.userId}
                            sx={{
                              display: "flex",
                              gap: 1.5,
                              p: 1.25,
                              border: 1,
                              borderColor: "divider",
                              borderRadius: 2,
                              bgcolor: "action.hover",
                            }}
                          >
                            <Avatar
                              sx={{
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                                fontSize: 14,
                                fontWeight: 700,
                                bgcolor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                                color: "background.paper",
                              }}
                            >
                              {initials(p.name)}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" fontWeight={700}>
                                {p.name}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ overflowWrap: "anywhere" }}
                              >
                                {p.email || "—"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {p.phone || "—"}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t("contactVisibleEmpty")}
                      </Typography>
                    )}
                  </Box>
                );
              })}
              {companies.length === 0 && !loading && (
                <Typography variant="body2" color="text.secondary">
                  {t("contactNoCompanies")}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      {/** ไม่มีท้ายป๊อปอัพ (ยกเลิก/บันทึก) — "เสร็จ" ของการ์ดคือการเซฟ */}
    </Dialog>
  );
}
