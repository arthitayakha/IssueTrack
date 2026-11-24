"use client";

import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
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
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";

/** map company id → programmer id[] · ไม่มี key = ใช้รายชื่อหลัก (global fallback) */
type CompanyContacts = Record<string, number[]>;

function namesOf(ids: number[], programmers: ContractContact[]) {
  return ids
    .map((id) => programmers.find((p) => p.userId === id))
    .filter((p): p is ContractContact => Boolean(p));
}

/**
 * "จัดการผู้ติดต่อ" — แอดมินกำหนดโปรแกรมเมอร์ที่ลูกค้าเห็นบน `/systems`
 * - รายชื่อหลัก = ทุกบริษัทที่ยังไม่ได้กำหนดเอง (global fallback)
 * - เปิดสวิตซ์บริษัทไหน → กำหนดชุดของบริษัทนั้นต่างหาก (array ว่าง = ใช้ข้อมูลกลาง)
 * บันทึกทั้งหมดครั้งเดียว พร้อมข้อมูลติดต่อกลาง
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
  const [draft, setDraft] = useState({
    supportEmail: "",
    supportPhone: "",
    workingHours: "",
    contactUserIds: [] as number[],
    contactUsersByCompany: {} as CompanyContacts,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchProgrammerContacts(),
      fetchHelpCenterContactConfig(),
      fetchCompanies(),
    ])
      .then(([people, contact, companyPage]) => {
        if (cancelled) return;
        setProgrammers(people);
        setCompanies(companyPage.data.map((c) => ({ id: c.id, name: c.name })));
        setDraft({
          supportEmail: contact.supportEmail,
          supportPhone: contact.supportPhone,
          workingHours: contact.workingHours,
          contactUserIds: contact.contactUserIds,
          contactUsersByCompany: contact.contactUsersByCompany,
        });
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

  const selected = namesOf(draft.contactUserIds, programmers);

  function setCompanyIds(key: string, ids: number[]) {
    setDraft((d) => ({
      ...d,
      contactUsersByCompany: { ...d.contactUsersByCompany, [key]: ids },
    }));
  }

  function toggleCompany(key: string, on: boolean) {
    setDraft((d) => {
      const next = { ...d.contactUsersByCompany };
      if (on) next[key] = [];
      else delete next[key];
      return { ...d, contactUsersByCompany: next };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await updateHelpCenterContact(draft);
      notify(t("manageContactsSaved"), "success");
      onSaved?.();
      onClose();
    } catch (e) {
      notify(errorMessage(e, t("manageContactsSaveError")), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: appDialogPaperSx }}
      sx={appDialogSx}
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
        <IconButton size="small" onClick={onClose} aria-label={t("cancel")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={appDialogContentSizing}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* รายชื่อหลัก — ใช้กับบริษัทที่ยังไม่ได้เปิด "กำหนดเอง" */}
          <Autocomplete
            multiple
            options={programmers}
            value={selected}
            loading={loading}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.userId === b.userId}
            onChange={(_, value) =>
              setDraft((d) => ({ ...d, contactUserIds: value.map((p) => p.userId) }))
            }
            renderOption={(props, option) => {
              const { key, ...rest } = props as typeof props & { key?: string };
              return (
                <Box
                  component="li"
                  key={option.userId}
                  {...rest}
                  sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {option.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.email || "—"}
                  </Typography>
                </Box>
              );
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...rest } = getTagProps({ index });
                return (
                  <Chip
                    key={key ?? option.userId}
                    {...rest}
                    label={option.name}
                    size="small"
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("contactProgrammers")}
                placeholder={t("contactProgrammersPlaceholder")}
                helperText={t("contactProgrammersHint")}
              />
            )}
          />

          {/* กำหนดต่างหากต่อบริษัท — ปิดสวิตซ์ = ใช้รายชื่อหลักด้านบน */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("contactCompanyTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
              {t("contactCompanyHint")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, mt: 1.5 }}>
              {companies.map((c) => {
                const key = String(c.id);
                const scoped = Object.prototype.hasOwnProperty.call(
                  draft.contactUsersByCompany,
                  key,
                );
                const ids = scoped ? draft.contactUsersByCompany[key] : [];
                const value = namesOf(ids, programmers);
                return (
                  <Box
                    key={c.id}
                    sx={{
                      border: 1,
                      borderColor: scoped ? "primary.main" : "divider",
                      borderRadius: 2,
                      p: 1.5,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
                        {c.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {scoped ? t("contactCompanyCustom") : t("contactCompanyUseGlobal")}
                      </Typography>
                      <Switch
                        size="small"
                        checked={scoped}
                        onChange={(e) => toggleCompany(key, e.target.checked)}
                        inputProps={{ "aria-label": c.name }}
                      />
                    </Box>
                    {scoped && (
                      <Autocomplete
                        multiple
                        options={programmers}
                        value={value}
                        loading={loading}
                        getOptionLabel={(p) => p.name}
                        isOptionEqualToValue={(a, b) => a.userId === b.userId}
                        onChange={(_, v) => setCompanyIds(key, v.map((p) => p.userId))}
                        renderTags={(value, getTagProps) =>
                          value.map((option, index) => {
                            const { key, ...rest } = getTagProps({ index });
                            return (
                              <Chip
                                key={key ?? option.userId}
                                {...rest}
                                label={option.name}
                                size="small"
                              />
                            );
                          })
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label={t("contactCompanyProgrammers")}
                            placeholder={t("contactProgrammersPlaceholder")}
                          />
                        )}
                      />
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

          {/* สรุปแบบอ่านอย่างเดียว — อัปเดตทันทีตอนเลือก/ลบ/เปิด-ปิดสวิตซ์ */}
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 1.5,
              bgcolor: "action.hover",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              {t("contactVisibleToAll")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {companies.map((c) => {
                const key = String(c.id);
                const scoped = Object.prototype.hasOwnProperty.call(
                  draft.contactUsersByCompany,
                  key,
                );
                const ids = scoped ? draft.contactUsersByCompany[key] : draft.contactUserIds;
                const value = namesOf(ids, programmers);
                return (
                  <Box
                    key={c.id}
                    sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
                  >
                    <Typography variant="body2" fontWeight={700}>
                      {c.name}:
                    </Typography>
                    {value.length > 0 ? (
                      value.map((p) => (
                        <Chip
                          key={p.userId}
                          size="small"
                          variant="outlined"
                          color="primary"
                          label={p.name}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t("contactVisibleEmpty")}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      ({scoped ? t("contactSummaryOverride") : t("contactSummaryGlobal")})
                    </Typography>
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

          <Typography variant="subtitle2" fontWeight={700}>
            {t("manageContactsFallbackTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
            {t("manageContactsFallbackHint")}
          </Typography>
          <TextField
            label={t("contactEmail")}
            value={draft.supportEmail}
            onChange={(e) => setDraft((d) => ({ ...d, supportEmail: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label={t("contactPhone")}
            value={draft.supportPhone}
            onChange={(e) => setDraft((d) => ({ ...d, supportPhone: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label={t("contactWorkingHours")}
            value={draft.workingHours}
            onChange={(e) => setDraft((d) => ({ ...d, workingHours: e.target.value }))}
            fullWidth
            size="small"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button
          onClick={() => void save()}
          variant="contained"
          disabled={saving || loading}
        >
          {saving ? t("submitting") : t("manageContactsSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
