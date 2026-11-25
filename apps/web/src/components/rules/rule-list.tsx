"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useTranslations } from "next-intl";
import type { RuleDto } from "@kanban/shared";
import { RULE_ACTIONS, RULE_TRIGGER_CATEGORIES, buildRuleSentence, getActionByKey } from "@kanban/shared";
import {
  fetchCategories,
  fetchPositions,
  fetchPriorities,
  fetchStatuses,
  fetchUsers,
  type Category,
  type IssuePriority,
  type IssueStatus,
  type PositionSummary,
  type UserSummary,
} from "@/lib/board-api";
import { fetchLabels, type Label } from "@/lib/labels-api";
import { Pagination } from "@/components/pagination";
import { getParamLabel } from "./param-labels";

interface RuleListProps {
  rules: RuleDto[];
  onToggle: (rule: RuleDto, isActive: boolean) => void;
  onDelete: (id: number) => void;
  /** เปิดป๊อปอัพแก้ไขกฎ (RuleWizardDialog ที่ RulesPanel ถืออยู่) แทนการไปหน้า /automation/[id] */
  onEdit: (rule: RuleDto) => void;
  /**
   * `false` = view-only seat (`automation.view` without `automation.update`):
   * rows still render, but the enable/disable switch, edit and delete controls
   * stay hidden — viewing rules must not imply changing them.
   */
  canUpdate?: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

/**
 * สไตล์ pill ของตัวกรอง 2 ช่อง — mirrors the `run-history-dialog.tsx` +
 * `reports-toolbar.tsx` copies (แก้ที่ไหนต้องแก้ทั้งชุด): **พื้นขาว** +
 * ขอบ `divider` เห็นตลอด (พื้นขาวบนการ์ดขาวต้องมีขอบกันกลืน) → hover
 * `grey.50` + ขอบเข้มขึ้น → focus น้ำเงิน, เมนูมุมมน + ✓ หน้ารายการที่เลือก
 *
 * ⚠️ **2 ช่องบนแดชบอร์ด** (`[locale]/page.tsx` + `workload-card.tsx`) ขาว
 * เหมือนกันแล้ว — ต่าง**แค่ไซส์**: เล็ก (13 / py 0.75) ตามคำสั่ง
 *
 * **เวอร์ชันใหญ่** (fontSize 14 / py 1) ตามคำสั่ง — ทุกหน้ายกเว้นแดชบอร์ด
 * ใช้ไซส์นี้; สองช่องบนแดชบอร์ดยังเป็นไซส์เล็ก (13 / py 0.75) เหมือนเดิม
 */
const PILL_SELECT_SX = {
  minWidth: 160,
  fontSize: 14,
  bgcolor: "common.white",
  borderRadius: "10px",
  transition: "background-color 150ms ease",
  "&:hover": { bgcolor: "grey.50" },
  // divider line at rest (white-on-white would otherwise vanish) →
  // grey.400 on hover → primary on focus (keyboard ring stays visible)
  "& .MuiOutlinedInput-notchedOutline": { border: "1px solid", borderColor: "divider" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "grey.400" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
  "& .MuiSelect-select": { py: 1, pr: "30px !important" },
} as const;

/** แถวในเมนู — mirror of `COMPANY_ITEM_SX` / `POSITION_ITEM_SX`. */
const PILL_ITEM_SX = {
  borderRadius: "8px",
  fontSize: 13,
  py: 0.75,
  px: 1.25,
  gap: 1,
  "&.Mui-selected": { bgcolor: "action.selected", fontWeight: 600 },
  "&.Mui-selected:hover": { bgcolor: "action.selected" },
} as const;

const PILL_ROW_TEXT_SX = {
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/** ข้อความในกล่องปิด — ตัวหนา + ตัดด้วย … เหมือนฝั่งแดชบอร์ด (ไซส์ใหญ่ 14). */
const PILL_VALUE_SX = { ...PILL_ROW_TEXT_SX, fontSize: 14, fontWeight: 600 } as const;

/**
 * จำนวนแถวต่อหน้า — **client-side เท่านั้น** (`GET /rules` ดึงชุดเต็ม ไม่มี page/limit;
 * filter/ค้นหา/นับแท็บยังทำงานบน `rules` ชุดเต็มเหมือนเดิม แล้วค่อย slice หลัง filter)
 *
 * 10 = ครึ่งจอของ list แบบ 2 บรรทัด (แถวละ ~50px) → กฎ 15 ตัวแบ่งเป็น 2 หน้า
 * และแถบ `<Pagination>` โผล่ขึ้นมา (component ซ่อนตัวเองเมื่อไม่เกิน 1 หน้า)
 */
const PAGE_SIZE = 10;

export default function RuleList({ rules, onToggle, onDelete, onEdit, canUpdate = true }: RuleListProps) {
  const t = useTranslations("Automation");
  // param labels (ย้ายไปสถานะ / มอบหมายตำแหน่ง / ป้ายกำกับ …) live under the
  // wizard namespace — same source the action picker & step ③ review use
  const tWizard = useTranslations("Automation.wizard");
  const theme = useTheme();

  /** sx ของ paper ใช้ร่วมกันทั้ง 2 dropdown — ค่าเดิมทุกประการ. */
  const pillMenuPaperSx = {
    borderRadius: "14px",
    mt: 1,
    p: 0.75,
    border: "1px solid",
    borderColor: "divider",
    boxShadow: theme.custom.cardShadow,
    maxWidth: 320,
  };

  /** เมนูของ pill ทั้งสองช่อง — มุมมน + เงา เหมือนฝั่งแดชบอร์ดเป๊ะ. */
  const pillMenuProps = {
    slotProps: {
      paper: { sx: pillMenuPaperSx },
    },
  };

  /**
   * เฉพาะ dropdown "ทุกการกระทำ" — มี ~25 รายการ ยาวเกินจอ (MUI ตั้ง
   * `maxHeight: calc(100% - 96px)` ให้ paper) → จำกัดความสูงแล้วซ่อนแถบเลื่อน
   * ตาม pattern ของ `master-data/page.tsx` · ล้อเมาส์/สัมผัสเลื่อนได้ตามเดิม
   */
  const actionMenuProps = {
    slotProps: {
      paper: {
        sx: {
          ...pillMenuPaperSx,
          maxHeight: "min(440px, 60vh)",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
      },
    },
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  /** หน้าที่เปิดอยู่ (1-based) — แบ่งหน้าหลัง filter เท่านั้น ดู `PAGE_SIZE` */
  const [page, setPage] = useState(1);

  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<RuleDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchStatuses(),
      fetchUsers(),
      fetchPriorities(),
      fetchCategories(),
    ])
      .then(([statusesRes, usersRes, prioritiesRes, categoriesRes]) => {
        if (cancelled) return;
        setStatuses(statusesRes.data);
        setUsers(usersRes.data);
        setPriorities(prioritiesRes.data);
        setCategories(categoriesRes.data);
      })
      .catch(() => {
        // Reference data is optional for rendering — fall back to raw values.
      });
    // fetched separately: `position.view` may be missing, which must not
    // take down the rest of the reference lists above.
    fetchPositions()
      .then((res) => {
        if (!cancelled) setPositions(res.data);
      })
      .catch(() => {
        // no permission / endpoint down — position columns fall back to raw ids
      });
    // same fail-open deal as positions: `label.view` may be missing, and an
    // add/remove-label rule must still render (raw id) without the list
    fetchLabels()
      .then((res) => {
        if (!cancelled) setLabels(res.data);
      })
      .catch(() => {
        // no permission / endpoint down — label params fall back to raw ids
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...rules]
      .filter((rule) => {
        // statusFilter is "active"/"inactive" — compare against the boolean,
        // not String(rule.isActive) which would never equal either value
        if (statusFilter !== "all" && rule.isActive !== (statusFilter === "active")) return false;
        if (categoryFilter !== "all" && rule.category !== categoryFilter) return false;
        if (actionFilter !== "all" && rule.actionKey !== actionFilter) return false;
        if (keyword) {
          const sentence = buildRuleSentence(rule.triggerKey, rule.templateKey, rule.conditions, resolveValue);
          // param values join the haystack so "เสร็จสิ้น" / "Frontend" finds
          // the rule that moves/assigns *to* that value
          const paramText = actionParams(rule).map((p) => `${p.label} ${p.value}`).join(" ");
          const haystack = [rule.name, sentence.th, sentence.en, rule.triggerKey, rule.actionKey, paramText]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // reference lists are deps on purpose: search matches RESOLVED names, so a
    // haystack built before they arrive would only ever see raw ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, search, statusFilter, categoryFilter, actionFilter, statuses, positions, priorities, categories, labels, users]);

  async function handleDelete() {
    if (!deleteTarget) return;
    // the parent owns the API call + state update + toast — calling the API
    // here too made every delete run twice (the 2nd call 404s and the row
    // stays on screen as a ghost)
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

  function resolveValue(field: string, value: unknown): string {
    if (value == null) return "";
    const strValue = String(value);
    if (field === "to_status" || field === "from_status" || field === "status") {
      const status = statuses.find((s) => s.id === Number(value));
      return status?.name ?? strValue;
    }
    if (field === "to_assignee") {
      const position = positions.find((p) => p.id === Number(value));
      return position?.name ?? strValue;
    }
    if (
      field === "from_assignee" ||
      field === "reporter" ||
      field === "comment_author" ||
      field === "attachment_author"
    ) {
      const user = users.find((u) => u.id === String(value));
      return user?.name ?? strValue;
    }
    if (field === "priority") {
      const priority = priorities.find((p) => p.id === Number(value));
      return priority?.name ?? strValue;
    }
    if (field === "category") {
      const category = categories.find((c) => c.id === Number(value));
      return category?.name ?? strValue;
    }
    return strValue;
  }

  /**
   * Action **config** values as human text — the mirror of the wizard's
   * `resolveConfigValue`. The keys here are actionConfig keys (`targetStatus`),
   * NOT condition-field names (`to_status`), which is why `resolveValue` above
   * cannot be reused for them. Unknown key / missing ref → raw value.
   */
  function resolveConfigValue(key: string, value: unknown): string {
    if (value == null) return "";
    const raw = String(value);
    if (key === "targetStatus" || key === "status") {
      return statuses.find((s) => s.id === Number(value))?.name ?? raw;
    }
    if (key === "position") {
      return positions.find((p) => p.id === Number(value))?.name ?? raw;
    }
    if (key === "priority") {
      return priorities.find((p) => p.id === Number(value))?.name ?? raw;
    }
    if (key === "category") {
      return categories.find((c) => c.id === Number(value))?.name ?? raw;
    }
    if (key === "label") {
      return labels.find((l) => String(l.id) === raw)?.name ?? raw;
    }
    return raw;
  }

  /**
   * The rule's action params, resolved and ready to display — this is what
   * tells the reader *which* status / position / label the action actually
   * uses; the action label alone ("ย้ายการ์ดไปสถานะอื่น") never says.
   * Returns `[]` for actions without a configSchema (move_step_only,
   * notify_stale, hide_from_board …) so their chip stays exactly as before.
   */
  function actionParams(rule: RuleDto): Array<{ label: string; value: string }> {
    const action = getActionByKey(rule.actionKey);
    if (!action?.configSchema) return [];
    return Object.keys(action.configSchema)
      .map((key) => {
        const value = resolveConfigValue(key, rule.actionConfig?.[key]);
        return { label: getParamLabel(tWizard, key), value };
      })
      .filter((param) => param.value.trim() !== "");
  }

  /**
   * Chip text = action label, then the params: one param reads as
   * "ย้ายการ์ดไปสถานะอื่น · เสร็จสิ้น"; several as "action · label: value, …".
   * The full text stays on the row's tooltip — the chip itself ellipsizes.
   */
  function chipLabel(rule: RuleDto): string {
    const action = getActionByKey(rule.actionKey);
    const base = action?.label.th ?? rule.actionKey;
    const params = actionParams(rule);
    if (params.length === 0) return base;
    if (params.length === 1) return `${base} · ${params[0].value}`;
    return `${base} · ${params.map((p) => `${p.label}: ${p.value}`).join(", ")}`;
  }

  const filteredRules = filtered;
  const allCount = rules.length;
  const activeCount = rules.filter((r) => r.isActive).length;
  const inactiveCount = rules.filter((r) => !r.isActive).length;

  /** หน้าทั้งหมดของ "ผลลัพธ์หลัง filter" — นับจาก `filteredRules` ไม่ใช่ `rules` ชุดเต็ม */
  const totalPages = Math.max(1, Math.ceil(filteredRules.length / PAGE_SIZE));
  /**
   * หน้าที่ใช้ render จริง — บีบไม่ให้เกิน `totalPages` ณ เวลานั้น ๆ ด้วย เพราะ
   * effect ที่ดัน `page` กลับเข้าช่วงทำงาน *หลัง* render หนึ่งรอบ → ถ้าใช้ `page`
   * ดิบจะมี frame ที่ slice ได้แถวว่าง (List โล่ง) ระหว่างรอ effect
   */
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRules.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /**
   * เปลี่ยน search / ตัวกรอง / สลับแท็บ = ต้อง `setPage(1)` **ใน handler เดียวกัน**ด้วย
   * (ไม่ใช่ `useEffect` — effect รันหลัง paint → หนึ่ง frame จะโชว์ "หน้าเดิมของ
   * ผลลัพธ์ใหม่" ก่อนกระเด้งกลับหน้า 1) — ทั้ง 4 จุดด้านล่างยึด contract นี้
   */

  /**
   * ผลลัพธ์หด (ลบแถวสุดท้ายของหน้าท้าย / refetch หลังลบกฎ) → ดัน `page` กลับเข้าช่วง
   * ให้ถาวร กัน state ค้างหน้าเกินจน "สร้างกฎใหม่ทีหลัง" แล้วเด้งกลับหน้าเก่าแบบงง ๆ
   */
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  function renderActionIcon(actionKey: string) {
    const color = theme.palette.primary.main;
    switch (actionKey) {
      case "issue.lock":
        return <LockIcon fontSize="small" sx={{ color }} />;
      case "issue.unlock":
        return <LockOpenIcon fontSize="small" sx={{ color }} />;
      default:
        return <BoltIcon fontSize="small" sx={{ color }} />;
    }
  }

  return (
    <Box>
      {/* แถบค้นหา/กรอง = sticky ในกล่อง scroll ของแท็บ (inner scroll ของ /master-data)
          — ค้างอยู่ใต้แถบแท็บขณะที่รายการเลื่อนใต้ · `pb` แทน `mb` เพราะพื้นหลังต้อง
          คลุมถึงขอบล่าง (margin โปร่ง → แถวที่เลื่อนจะลอดเห็นใต้ sticky 8px) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          pb: 2,
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 2,
          bgcolor: "background.default",
        }}
      >
        <Tabs
          value={statusFilter}
          onChange={(_e, value) => {
            setStatusFilter(value as StatusFilter);
            setPage(1);
          }}
          sx={{ minWidth: 300 }}
        >
          <Tab value="all" label={`${t("tabAll")} (${allCount})`} />
          <Tab value="active" label={`${t("tabActive")} (${activeCount})`} />
          <Tab value="inactive" label={`${t("tabInactive")} (${inactiveCount})`} />
        </Tabs>
        <TextField
          size="small"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ flex: 1, minWidth: 180 }}
          // กัน password manager เทอีเมลลงช่องค้นหา (เหมือนหน้าบอร์ด)
          inputProps={{ autoComplete: "off", name: "rules-search" }}
        />
        <Select
          size="small"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          displayEmpty
          renderValue={(raw) => {
            const value = typeof raw === "string" ? raw : "";
            const label =
              value === "all"
                ? t("allCategories")
                : (RULE_TRIGGER_CATEGORIES.find((c) => c.key === value)?.label.th ??
                  t("allCategories"));
            return <Typography sx={PILL_VALUE_SX}>{label}</Typography>;
          }}
          MenuProps={pillMenuProps}
          sx={PILL_SELECT_SX}
        >
          {[
            { key: "all", label: t("allCategories") },
            ...RULE_TRIGGER_CATEGORIES.map((c) => ({ key: c.key, label: c.label.th })),
          ].map((o) => (
            <MenuItem key={o.key} value={o.key} sx={PILL_ITEM_SX}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                <Typography sx={PILL_ROW_TEXT_SX}>{o.label}</Typography>
                {categoryFilter === o.key && (
                  <CheckIcon
                    sx={{ fontSize: 16, ml: "auto", flexShrink: 0, color: "primary.main" }}
                  />
                )}
              </Box>
            </MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          displayEmpty
          renderValue={(raw) => {
            const value = typeof raw === "string" ? raw : "";
            const label =
              value === "all"
                ? t("allActions")
                : (RULE_ACTIONS.find((a) => a.key === value)?.label.th ?? t("allActions"));
            return <Typography sx={PILL_VALUE_SX}>{label}</Typography>;
          }}
          MenuProps={actionMenuProps}
          sx={PILL_SELECT_SX}
        >
          {[
            { key: "all", label: t("allActions") },
            ...RULE_ACTIONS.map((a) => ({ key: a.key, label: a.label.th })),
          ].map((o) => (
            <MenuItem key={o.key} value={o.key} sx={PILL_ITEM_SX}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                <Typography sx={PILL_ROW_TEXT_SX}>{o.label}</Typography>
                {actionFilter === o.key && (
                  <CheckIcon
                    sx={{ fontSize: 16, ml: "auto", flexShrink: 0, color: "primary.main" }}
                  />
                )}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </Box>

      {filteredRules.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {t("emptyTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("emptyDescription")}
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {pageRows.map((rule) => {
            const sentence = buildRuleSentence(rule.triggerKey, rule.templateKey, rule.conditions, resolveValue);
            const sentenceText = sentence.th || sentence.en;
            // action label + resolved params (target status, position, label …)
            const chipText = chipLabel(rule);
            return (
              <ListItem key={rule.id} disableGutters sx={{ py: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
                  <ListItemIcon sx={{ minWidth: 0, pl: 1 }}>{renderActionIcon(rule.actionKey)}</ListItemIcon>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ color: theme.palette.navy.main }}>
                      {rule.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.25 }}>
                      {sentenceText}
                    </Typography>
                  </Box>
                  <Tooltip title={actionParams(rule).length > 0 ? chipText : ""}>
                    <Chip
                      label={chipText}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 22,
                        fontSize: 11,
                        flexShrink: 0,
                        // params (comment 1000 chars) must never
                        // push the switch & icons off the row
                        maxWidth: 320,
                        "& .MuiChip-label": {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      }}
                    />
                  </Tooltip>
                  {canUpdate && (
                    <>
                      <Tooltip title={rule.isActive ? t("enabled") : t("disabled")}>
                        <Switch checked={rule.isActive} onChange={(e) => onToggle(rule, e.target.checked)} size="small" />
                      </Tooltip>
                      <IconButton
                        size="small"
                        aria-label={t("edit")}
                        onClick={() => onEdit(rule)}
                        sx={{ color: theme.palette.primary.main, flexShrink: 0 }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t("delete")}
                        onClick={() => setDeleteTarget(rule)}
                        sx={{ color: theme.palette.error.main, flexShrink: 0 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
              </ListItem>
            );
          })}
        </List>
      )}

      {/*
        แถบหน้าใต้รายการ — `Pagination` คืน null เองเมื่อไม่เกิน 1 หน้า (กฎ ≤ 15 ตัว
        จึงไม่มีแถบใหม่โผล่) และ `total` ใช้ "จำนวนแถวหลัง filter" เพื่อให้ข้อความ
        "แสดง x–y จากทั้งหมด n" ตรงกับแท็บ/คำค้นที่เลือกอยู่
      */}
      {filteredRules.length > 0 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filteredRules.length}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <Dialog open={deleteTarget != null} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget ? t("deleteMessage", { name: deleteTarget.name }) : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t("cancel")}</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            {t("deleteConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
