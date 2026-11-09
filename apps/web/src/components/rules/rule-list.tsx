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
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
import { getParamLabel } from "./param-labels";

interface RuleListProps {
  rules: RuleDto[];
  onToggle: (rule: RuleDto, isActive: boolean) => void;
  onDelete: (id: number) => void;
  /**
   * `false` = view-only seat (`automation.view` without `automation.update`):
   * rows still render, but the enable/disable switch, edit and delete controls
   * stay hidden — viewing rules must not imply changing them.
   */
  canUpdate?: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

export default function RuleList({ rules, onToggle, onDelete, canUpdate = true }: RuleListProps) {
  const t = useTranslations("Automation");
  // param labels (ย้ายไปสถานะ / มอบหมายตำแหน่ง / ป้ายกำกับ …) live under the
  // wizard namespace — same source the action picker & step ③ review use
  const tWizard = useTranslations("Automation.wizard");
  const theme = useTheme();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

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
    if (key === "targetStatus") {
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Tabs
          value={statusFilter}
          onChange={(_e, value) => setStatusFilter(value as StatusFilter)}
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
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Select
          size="small"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          displayEmpty
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">{t("allCategories")}</MenuItem>
          {RULE_TRIGGER_CATEGORIES.map((cat) => (
            <MenuItem key={cat.key} value={cat.key}>
              {cat.label.th}
            </MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          displayEmpty
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">{t("allActions")}</MenuItem>
          {RULE_ACTIONS.map((action) => (
            <MenuItem key={action.key} value={action.key}>
              {action.label.th}
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
          {filteredRules.map((rule) => {
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
                        // params (reason 500 / comment 1000 chars) must never
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
                        component={Link}
                        href={`/automation/${rule.id}`}
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

      <Dialog open={deleteTarget != null} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{deleteTarget ? t("deleteMessage") : ""}</DialogContentText>
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
