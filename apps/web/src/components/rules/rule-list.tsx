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
import { useNotification } from "@/components/notification";
import { deleteRule, toggleRule } from "@/lib/rules-api";
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

interface RuleListProps {
  rules: RuleDto[];
  onToggle: (rule: RuleDto, isActive: boolean) => void;
  onDelete: (id: number) => void;
}

type StatusFilter = "all" | "active" | "inactive";

export default function RuleList({ rules, onToggle, onDelete }: RuleListProps) {
  const t = useTranslations("Automation");
  const theme = useTheme();
  const { notify } = useNotification();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...rules]
      .filter((rule) => {
        if (statusFilter !== "all" && String(rule.isActive) !== statusFilter) return false;
        if (categoryFilter !== "all" && rule.category !== categoryFilter) return false;
        if (actionFilter !== "all" && rule.actionKey !== actionFilter) return false;
        if (keyword) {
          const sentence = buildRuleSentence(rule.triggerKey, rule.templateKey, rule.conditions, resolveValue);
          const haystack = [rule.name, sentence.th, sentence.en, rule.triggerKey, rule.actionKey]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, search, statusFilter, categoryFilter, actionFilter]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    try {
      await deleteRule(targetId);
      onDelete(targetId);
    } catch (err) {
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    } finally {
      setDeleteTarget(null);
    }
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
            const action = getActionByKey(rule.actionKey);
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
                  <Chip
                    label={action?.label.th ?? rule.actionKey}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: 11, flexShrink: 0 }}
                  />
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
