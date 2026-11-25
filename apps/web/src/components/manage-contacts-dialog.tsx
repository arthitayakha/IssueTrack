"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import { useTranslations } from "next-intl";
import { Pagination } from "@/components/pagination";
import { errorMessage } from "@/lib/api";
import { fetchApps, fetchCompanies } from "@/lib/apps-api";
import type { App } from "@/lib/apps-api";
import {
  fetchHelpCenterContactConfig,
  fetchProgrammerContacts,
  updateHelpCenterContact,
} from "@/lib/help-center-api";
import type { ContractContact } from "@/lib/notifications-api";
import { useNotification } from "@/components/notification";
import { appDialogContentSizing } from "@/components/common/dialog-style";

/** map id → programmer id[] · ไม่มี key = เจ้าของนั้นยังไม่มี config (บริษัท = fallback) */
type ContactMap = Record<string, number[]>;

/** เป้าหมายที่แอดมินกำลังเลือก — บริษัท (fallback) หรือแอป (ทับ) */
type EditTarget =
  | { kind: "company"; id: number }
  | { kind: "app"; id: number; companyId: number };

/** key ของ `contactUsersByApp` ต้องเป็นคู่แอป × บริษัท — แอปเดียวผูกหลายบริษัทได้ */
const appKey = (appId: number, companyId: number) => `${appId}:${companyId}`;

/** การ์ดจัดการผู้ติดต่อล็อก 860×640 เหมือนเดิม (ทั้งหน้ารายการและหน้าย่อย) */
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

const PAGE_SIZE = 10;

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

function hasKey(map: ContactMap, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/** เปรียบเทียบ 2 map แบบไม่สนใจลำดับ key แต่สนใจลำดับ id ใน array */
function sameMap(a: ContactMap, b: ContactMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      hasKey(b, key) &&
      a[key].length === b[key].length &&
      a[key].every((id, i) => id === b[key][i]),
  );
}

/** โปรแกรมเมอร์ที่ตรงกับคำค้น (ชื่อหรืออีเมล) */
function matchesQuery(person: ContractContact, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    person.name.toLowerCase().includes(q) ||
    (person.email ?? "").toLowerCase().includes(q)
  );
}

/** ปุ่ม `+` วงกลมเล็ก — ใช้ต่อท้ายรายชื่อในทุกเป้าหมาย (บริษัท/แอป) */
function AddContactButton({
  onClick,
  disabled,
  label,
}: {
  onClick: (anchor: HTMLElement) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <IconButton
      size="small"
      onClick={(e) => onClick(e.currentTarget)}
      disabled={disabled}
      aria-label={label}
      sx={{ border: 1, borderColor: "divider", borderRadius: 1, alignSelf: "flex-start" }}
    >
      <AddIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * ป้ายผู้ติดต่อแบบกระชับ ใช้ทั้งหน้ารายการและหน้าย่อย —
 * `Chip` สีอ่อนจาก theme แสดงชื่อ (อีเมล/เบอร์อยู่ใน title) พร้อม × ตอนแก้ไข
 */
function ContactChips({
  ids,
  programmers,
  onRemove,
  removeLabel,
  disabled,
}: {
  ids: number[];
  programmers: ContractContact[];
  onRemove?: (userId: number) => void;
  removeLabel?: string;
  disabled?: boolean;
}) {
  const people = namesOf(ids, programmers);
  if (people.length === 0) return null;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {people.map((person) => (
        <Chip
          key={person.userId}
          size="small"
          label={person.name}
          title={[person.name, person.email, person.phone].filter(Boolean).join(" · ")}
          onDelete={onRemove ? () => onRemove(person.userId) : undefined}
          deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
          disabled={disabled}
          sx={{
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            color: "text.primary",
            fontWeight: 600,
            "& .MuiChip-deleteIcon": { color: "text.secondary", opacity: 0.6 },
            "&:hover .MuiChip-deleteIcon": { opacity: 1 },
          }}
        />
      ))}
    </Box>
  );
}

/** popover เลือก/ลบโปรแกรมเมอร์ — ใช้ร่วมกันทุกเป้าหมาย (บริษัทและแอป) */
function MemberPickerPopover({
  open,
  anchorEl,
  onClose,
  programmers,
  selectedIds,
  query,
  onQuery,
  onAdd,
  onRemove,
  disabled,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  programmers: ContractContact[];
  selectedIds: number[];
  query: string;
  onQuery: (value: string) => void;
  onAdd: (userId: number) => void;
  onRemove: (userId: number) => void;
  disabled: boolean;
}) {
  const t = useTranslations("SystemReports");
  const tb = useTranslations("Boards.detail");
  const selectedShown = namesOf(selectedIds, programmers).filter((p) => matchesQuery(p, query));
  const availableShown = programmers.filter(
    (p) => !selectedIds.includes(p.userId) && matchesQuery(p, query),
  );
  const avatarColor = (userId: number) =>
    AVATAR_COLORS[
      Math.max(0, programmers.findIndex((x) => x.userId === userId)) % AVATAR_COLORS.length
    ];

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{
        sx: { width: 280, p: 1.5, display: "flex", flexDirection: "column", gap: 1 },
      }}
    >
      <TextField
        size="small"
        placeholder={tb("searchMembers")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
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
            <Box key={p.userId} sx={{ display: "flex", alignItems: "center", gap: 0.75, p: 0.5 }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  bgcolor: avatarColor(p.userId),
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
                disabled={disabled}
                onClick={() => onRemove(p.userId)}
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
                  if (!disabled) onAdd(p.userId);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  p: 0.75,
                  borderRadius: 1,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    bgcolor: avatarColor(p.userId),
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
  );
}

/**
 * "จัดการผู้ติดต่อ" — หน้าหลักเป็นการ์ดบริษัทละใบ · กด "แก้ไข" → หน้าย่อยของบริษัท
 * มี 2 ส่วน: **ค่าบริษัท** (fallback) + **แอปของบริษัทนี้** (ทับ) · กด "แก้ไข" ของแอป
 * → **กางแถวนั้นแก้-inline ในหน้าเดิม** (ไม่ไปหน้าที่ 3) · ปุ่ม `+` ตัวเล็กเปิด popover
 * เลือกคน · "บันทึก" ส่ง 2 map ใน PATCH เดียวแล้วกลับมาหน้ารายการ ·
 * กลับ/ยกเลิก/ปิด popup = สละการแก้ทั้งหมดในหน้านี้ (ไม่เขียนโดยไม่รู้ตัว)
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
  const { notify } = useNotification();
  const [programmers, setProgrammers] = useState<ContractContact[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [draftCompany, setDraftCompany] = useState<ContactMap>({});
  const [draftApp, setDraftApp] = useState<ContactMap>({});
  /** บริษัทที่กำลังแก้ (null = หน้ารายการ) */
  const [editing, setEditing] = useState<EditTarget | null>(null);
  /** เป้าหมายของ popover เลือกคน (บริษัทหรือแอปที่กางอยู่) */
  const [pickerTarget, setPickerTarget] = useState<EditTarget | null>(null);
  const [memberPicker, setMemberPicker] = useState<{ anchor: HTMLElement } | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [page, setPage] = useState(1);
  const [appPage, setAppPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** config ล่าสุดที่เซฟสำเร็จ — ใช้คืนค่าตอนกลับ/ยกเลิก/ปิด */
  const savedRef = useRef<{ company: ContactMap; app: ContactMap }>({
    company: {},
    app: {},
  });

  /** derived — ไม่เก็บเป็น state เพื่อไม่ให้ stale */
  const dirty =
    !sameMap(draftCompany, savedRef.current.company) ||
    !sameMap(draftApp, savedRef.current.app);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setEditing(null);
    setPickerTarget(null);
    setMemberPicker(null);
    setMemberSearch("");
    setListSearch("");
    setPage(1);
    setAppPage(1);
    void Promise.all([
      fetchProgrammerContacts(),
      fetchHelpCenterContactConfig(),
      fetchCompanies(),
      fetchApps(1, 100),
    ])
      .then(([people, contact, companyPage, appPageData]) => {
        if (cancelled) return;
        setProgrammers(people);
        setCompanies(companyPage.data.map((c) => ({ id: c.id, name: c.name })));
        setApps(appPageData.data);
        setDraftCompany(contact.contactUsersByCompany);
        setDraftApp(contact.contactUsersByApp);
        savedRef.current = {
          company: contact.contactUsersByCompany,
          app: contact.contactUsersByApp,
        };
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

  /** แอปที่ผูกกับบริษัทนั้น (ตัดราวต่ออายุซ้ำด้วย Set) */
  const appsByCompany = useMemo(() => {
    const map = new Map<number, { id: number; name: string }[]>();
    for (const app of apps) {
      const seen = new Set<number>();
      for (const link of app.companies) {
        if (seen.has(link.id)) continue;
        seen.add(link.id);
        const list = map.get(link.id) ?? [];
        list.push({ id: app.id, name: app.name });
        map.set(link.id, list);
      }
    }
    return map;
  }, [apps]);

  /** 1 การ์ดต่อบริษัท — รวมคนจากค่าบริษัท + ทุกแอป (ไม่ซ้ำ) สำหรับแสดง/ค้นหา */
  const companyItems = useMemo(
    () =>
      companies.map((company) => {
        const ids = draftCompany[String(company.id)] ?? [];
        const apps = appsByCompany.get(company.id) ?? [];
        const seen = new Set<number>(ids);
        for (const app of apps) {
          for (const id of draftApp[appKey(app.id, company.id)] ?? []) seen.add(id);
        }
        return { company, ids, allIds: [...seen], apps };
      }),
    [companies, appsByCompany, draftCompany, draftApp],
  );

  const contactMatches = (ids: number[], query: string) =>
    namesOf(ids, programmers).some((p) => matchesQuery(p, query));

  const filteredCompanies = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    if (!query) return companyItems;
    return companyItems.filter(
      ({ company, ids, apps: linked }) =>
        company.name.toLowerCase().includes(query) ||
        linked.some((app) => app.name.toLowerCase().includes(query)) ||
        contactMatches(ids, query) ||
        linked.some((app) => contactMatches(draftApp[appKey(app.id, company.id)] ?? [], query)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `contactMatches` is a pure helper over `programmers`
  }, [companyItems, listSearch, programmers, draftApp]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleCompanies = filteredCompanies.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /** แอปในหน้าย่อยของบริษัท — แบ่งหน้า 10 แอป/หน้า (แถบซ่อนเองถ้าไม่เกิน 1 หน้า) */
  const companyApps = editing ? appsByCompany.get(editing.id) ?? [] : [];
  const hasAppContacts = companyApps.some(
    (app) => (draftApp[appKey(app.id, editing!.id)] ?? []).length > 0,
  );
  const appTotalPages = Math.max(1, Math.ceil(companyApps.length / PAGE_SIZE));
  const safeAppPage = Math.min(appPage, appTotalPages);
  const visibleApps = companyApps.slice((safeAppPage - 1) * PAGE_SIZE, safeAppPage * PAGE_SIZE);

  const pickerKey = pickerTarget
    ? pickerTarget.kind === "company"
      ? String(pickerTarget.id)
      : appKey(pickerTarget.id, pickerTarget.companyId)
    : "";
  const pickerIds = pickerTarget
    ? (pickerTarget.kind === "company" ? draftCompany : draftApp)[pickerKey] ?? []
    : [];

  function openPicker(anchor: HTMLElement, target: EditTarget) {
    if (saving) return;
    setMemberSearch("");
    setPickerTarget(target);
    setMemberPicker({ anchor });
  }

  function startEdit(companyId: number) {
    if (saving) return;
    setEditing({ kind: "company", id: companyId });
    setPickerTarget(null);
    setMemberPicker(null);
    setMemberSearch("");
    setAppPage(1);
  }

  /** กลับ/ยกเลิก/ปิด — คืนทั้ง 2 map (ยังไม่เซฟ = ไม่เขียน) */
  function discardDraft() {
    if (saving) return;
    setDraftCompany(savedRef.current.company);
    setDraftApp(savedRef.current.app);
    setEditing(null);
    setPickerTarget(null);
    setMemberPicker(null);
    setMemberSearch("");
  }

  function handleClose() {
    discardDraft();
    onClose();
  }

  /**
   * บันทึก 2 map ใน PATCH เดียว · พัง → แจ้งเตือนและค้างในหน้าย่อย
   * (ใช้ค่าที่ตอบกลับเพราะเซิร์ฟเวอร์ normalise รายการที่กรอกไม่ถูกต้องอยู่แล้ว)
   */
  async function commit(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      const saved = await updateHelpCenterContact({
        contactUsersByCompany: draftCompany,
        contactUsersByApp: draftApp,
      });
      setDraftCompany(saved.contactUsersByCompany);
      setDraftApp(saved.contactUsersByApp);
      savedRef.current = {
        company: saved.contactUsersByCompany,
        app: saved.contactUsersByApp,
      };
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

  async function handleSave() {
    if (saving) return;
    if (dirty && !(await commit())) return;
    setEditing(null);
    setPickerTarget(null);
    setMemberPicker(null);
    setMemberSearch("");
  }

  function addId(key: string, id: number, map: "company" | "app") {
    const setDraft = map === "company" ? setDraftCompany : setDraftApp;
    setDraft((d) => {
      if ((d[key] ?? []).includes(id)) return d;
      return { ...d, [key]: [...(d[key] ?? []), id] };
    });
  }

  function removeId(key: string, id: number, map: "company" | "app") {
    const setDraft = map === "company" ? setDraftCompany : setDraftApp;
    setDraft((d) => {
      if (!(d[key] ?? []).includes(id)) return d;
      return { ...d, [key]: (d[key] ?? []).filter((x) => x !== id) };
    });
  }

  const picker = pickerTarget ? (
    <MemberPickerPopover
      open={Boolean(memberPicker)}
      anchorEl={memberPicker?.anchor ?? null}
      onClose={() => {
        setMemberPicker(null);
        setPickerTarget(null);
      }}
      programmers={programmers}
      selectedIds={pickerIds}
      query={memberSearch}
      onQuery={setMemberSearch}
      onAdd={(id) => addId(pickerKey, id, pickerTarget.kind)}
      onRemove={(id) => removeId(pickerKey, id, pickerTarget.kind)}
      disabled={loading || saving}
    />
  ) : null;

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
        {editing ? (
          <>
            <Button
              size="small"
              variant="text"
              startIcon={<ArrowBackIcon fontSize="small" />}
              onClick={discardDraft}
              disabled={saving}
              sx={{ mr: 0.5, textTransform: "none" }}
            >
              {t("manageContactsBack")}
            </Button>
            <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>
              {t("contactEdit")}
            </Typography>
          </>
        ) : (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t("manageContactsTitle")}
            </Typography>
          </Box>
        )}
        <IconButton size="small" onClick={handleClose} aria-label={t("cancel")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers
        sx={editing ? { ...appDialogContentSizing, overflowY: "hidden" } : appDialogContentSizing}
      >
        {editing ? (
          /* หน้าย่อยของบริษัท — 2 ส่วน: ค่าบริษัท (fallback) + แอปของบริษัทนี้ */
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%", minHeight: 0 }}>
            {/* ส่วนที่ 1 — ค่าบริษัท: เลื่อนเฉพาะส่วนนี้ หัวข้ออยู่กับที่ */}
            <Box
              sx={{
                flex: "0 0 auto",
                maxHeight: "40%",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                pr: 0.5,
              }}
            >
              <Typography
                variant="subtitle2"
                fontWeight={700}
                sx={{
                  color: "navy.main",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  bgcolor: "background.paper",
                  py: 0.5,
                }}
              >
                {t("manageContactsCompanyDefault")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
                {(draftCompany[String(editing.id)] ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t(hasAppContacts ? "manageContactsNoCompanyDefault" : "contactVisibleEmpty")}
                  </Typography>
                ) : (
                  <ContactChips
                    ids={draftCompany[String(editing.id)] ?? []}
                    programmers={programmers}
                    onRemove={(userId) => removeId(String(editing.id), userId, "company")}
                    removeLabel={t("cancel")}
                    disabled={loading || saving}
                  />
                )}
                <AddContactButton
                  key="add-company-contact"
                  onClick={(anchor) => openPicker(anchor, { kind: "company", id: editing.id })}
                  disabled={loading || saving}
                  label={t("manageContactsAdd")}
                />
              </Box>
            </Box>

            {/* ส่วนที่ 2 — แอปของบริษัท: เลื่อนเฉพาะรายการแอป แถบหน้าอยู่กับที่ */}
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflowY: "auto",
                  pr: 0.5,
                }}
              >
              <Typography
                variant="subtitle2"
                fontWeight={700}
                sx={{
                  color: "navy.main",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  bgcolor: "background.paper",
                  py: 0.5,
                }}
              >
                {t("manageContactsApps")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
                {companyApps.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("manageContactsNoApps")}
                  </Typography>
                ) : (
                  visibleApps.map((app) => {
                    const key = appKey(app.id, editing.id);
                    const configured = hasKey(draftApp, key);
                    const people = configured ? namesOf(draftApp[key] ?? [], programmers) : [];
                    const target: EditTarget = { kind: "app", id: app.id, companyId: editing.id };
                    return (
                      <Box
                        key={app.id}
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1.5,
                          overflow: "hidden",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: 0.75 }}>
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            sx={{ flex: 1, minWidth: 0 }}
                          >
                            {app.name}
                          </Typography>
                        </Box>
                        <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                              px: 1.25,
                              py: 1,
                              borderTop: 1,
                              borderColor: "divider",
                            }}
                          >
                            {people.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                {configured ? t("contactVisibleEmpty") : t("manageContactsAppUsingDefault")}
                              </Typography>
                            ) : (
                              <ContactChips
                                ids={draftApp[key] ?? []}
                                programmers={programmers}
                                onRemove={(userId) => removeId(key, userId, "app")}
                                removeLabel={t("cancel")}
                                disabled={loading || saving}
                              />
                            )}
                            <AddContactButton
                              key="add-app-contact"
                              onClick={(anchor) => openPicker(anchor, target)}
                              disabled={loading || saving}
                              label={t("manageContactsAdd")}
                            />
                          </Box>
                      </Box>
                    );
                  })
                )}
              </Box>
              </Box>
              <Pagination
                page={safeAppPage}
                totalPages={appTotalPages}
                total={companyApps.length}
                limit={PAGE_SIZE}
                onPageChange={(p) => {
                  setAppPage(p);
                              }}
              />
            </Box>
          </Box>
        ) : (
          /* หน้ารายการ — การ์ดบริษัทละใบแบบเดิม + ค้นหา/แบ่งหน้า */
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              value={listSearch}
              placeholder={t("manageContactsSearch")}
              onChange={(e) => {
                setListSearch(e.target.value);
                setPage(1);
              }}
              disabled={loading || saving}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} /> }}
            />
            {filteredCompanies.length === 0 && !loading ? (
              <Typography variant="body2" color="text.secondary">
                {companies.length === 0 ? t("contactNoCompanies") : t("manageContactsNoMatch")}
              </Typography>
            ) : (
              visibleCompanies.map(({ company, allIds }) => (
                <Box
                  key={company.id}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
                      {company.name}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<EditIcon />}
                      onClick={() => startEdit(company.id)}
                      disabled={loading || saving}
                    >
                      {t("contactEdit")}
                    </Button>
                  </Box>
                  {allIds.length > 0 ? (
                    <ContactChips ids={allIds} programmers={programmers} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t("contactVisibleEmpty")}
                    </Typography>
                  )}
                </Box>
              ))
            )}
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filteredCompanies.length}
              limit={PAGE_SIZE}
              onPageChange={setPage}
            />
          </Box>
        )}
      </DialogContent>
      {/* ปุ่มท้ายมีเฉพาะหน้าย่อย — หน้ารายการไม่มีปุ่มท้าย */}
      {editing && (
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={discardDraft} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || loading || !dirty}
          >
            {t("manageContactsSave")}
          </Button>
        </DialogActions>
      )}
      {picker}
    </Dialog>
  );
}
