"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { resolveStatusColor } from "@/lib/status-color";
import { fetchDimensionIssues, fetchTrendIssues } from "@/lib/dashboard-api";
import type {
  DashboardPeriod,
  DashboardScope,
  DashboardTrendIssue,
} from "@kanban/shared";

/**
 * What one drill-down is behind — one trend bar or one donut slice. Both hit
 * the same row shape (`DashboardTrendIssue`), so they share this dialog and
 * the `/boards?issue=` deep link it opens on click.
 */
export type DrillSource =
  | { kind: "trend"; bucket: string; period: DashboardPeriod }
  | {
      kind: "dimension";
      dim: "app" | "category" | "status";
      /** The slice's row id, or "none" for the no-app / no-category slice. */
      id: number | "none";
      /** The app drilled through first (level 2) — omits the extra filter. */
      app?: number;
    };

/**
 * The list behind a clicked chart — GET /dashboard/trend-issues or
 * GET /dashboard/dimension-issues.
 *
 * Rows use the two-line layout from the mockup: `#ref · title · time` on top,
 * `status dot · priority · reporter → assignee` underneath. Clicking a row
 * leaves for `/boards?issue=<id>`, which is the app's existing deep link (the
 * same one notifications use) and opens that card's full detail dialog — no
 * issue page of our own, no board refactor.
 *
 * `count` is the number printed on the bar/slice, so the footer can say when
 * the server capped the list (200 rows max). `title` is built by the caller —
 * only it knows which chart was clicked.
 */
export default function IssuesDrillDialog({
  title,
  count,
  source,
  scope,
  statusId,
  onClose,
}: {
  /** Already formatted by the caller ("POS · 10 งาน"). */
  title: string;
  /** The bar's/slice's count — for the "showing X of Y" footer. */
  count: number;
  source: DrillSource;
  scope: DashboardScope;
  /**
   * The page's status cross-filter — sent along so the list adds up to the
   * (filtered) number on the bar/slice it came from. Left out by the caller
   * when the source *is* that status filter, where it would only restate it.
   */
  statusId?: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const router = useRouter();

  const [rows, setRows] = useState<DashboardTrendIssue[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  // primitives out of the source: an inline `{...}` literal would be a new
  // object on every parent render and refetch the list for no reason
  const kind = source.kind;
  const bucket = kind === "trend" ? source.bucket : "";
  const period = kind === "trend" ? source.period : null;
  const dim = kind === "dimension" ? source.dim : null;
  const dimId = kind === "dimension" ? source.id : 0;
  const parentApp = kind === "dimension" ? (source.app ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const load =
      kind === "trend" && period
        ? fetchTrendIssues({ bucket, period, scope, statusId })
        : kind === "dimension" && dim
          ? fetchDimensionIssues({
              dim,
              id: dimId,
              ...(parentApp != null ? { app: parentApp } : {}),
              scope,
              statusId,
            })
          : Promise.resolve<DashboardTrendIssue[]>([]);
    load
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, bucket, period, dim, dimId, parentApp, scope, statusId, attempt]);

  /** The caller formats the title — only it knows which chart was clicked. */
  const truncated = status === "ready" && rows.length < count;

  const priorityChipColor = (name: string): "error" | "warning" | "success" | "default" => {
    const key = name.toLowerCase();
    if (key.includes("critical") || key.includes("high") || key.includes("สูง")) return "error";
    if (key.includes("medium") || key.includes("กลาง")) return "warning";
    if (key.includes("low") || key.includes("ต่ำ")) return "success";
    return "default";
  };

  const reference = (row: DashboardTrendIssue): string => {
    if (!row.issueNumber) return `#${row.id}`;
    return row.issueNumber.startsWith("#") ? row.issueNumber : `#${row.issueNumber}`;
  };

  const formatDateTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`;
  };

  const openIssue = (id: number) => {
    onClose();
    // the board's `?issue=` deep link opens that card's IssueDetailDialog
    router.push({ pathname: "/boards", query: { issue: String(id) } });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Typography>
            <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
              {t("trend.rowHint")}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label={t("trend.close")} size="small" sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {status === "loading" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 6 }}>
            <CircularProgress size={32} />
            <Typography sx={{ fontSize: 13, color: "text.disabled" }}>{t("loading")}</Typography>
          </Box>
        )}

        {status === "error" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 6, px: 2.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{t("errorTitle")}</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setAttempt((a) => a + 1)}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {t("retry")}
            </Button>
          </Box>
        )}

        {status === "ready" && rows.length === 0 && (
          <Typography sx={{ py: 6, px: 2.5, textAlign: "center", fontSize: 13.5, color: "text.disabled" }}>
            {t("trend.emptyIssues")}
          </Typography>
        )}

        {status === "ready" && rows.length > 0 && (
          <List disablePadding>
            {rows.map((row) => {
              const statusColor = row.status
                ? resolveStatusColor(theme, row.status.color, row.status.name)
                : null;
              return (
                <ListItemButton
                  key={row.id}
                  onClick={() => openIssue(row.id)}
                  sx={{
                    alignItems: "flex-start",
                    px: 2.5,
                    py: 1.25,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* line 1 — reference · title · created at */}
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <Typography
                        component="span"
                        sx={{ fontSize: 12.5, fontWeight: 700, color: "text.disabled", flexShrink: 0 }}
                      >
                        {reference(row)}
                      </Typography>
                      <Typography
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13.5,
                          fontWeight: 600,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {row.title}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }}>
                        {formatDateTime(row.createdAt)}
                      </Typography>
                    </Box>

                    {/* line 2 — status · priority · reporter → assignee */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                      {row.status && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, minWidth: 0 }}>
                          <Box
                            sx={{
                              width: 9,
                              height: 9,
                              borderRadius: "50%",
                              bgcolor: statusColor ?? "grey.400",
                              flexShrink: 0,
                            }}
                          />
                          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                            {row.status.name}
                          </Typography>
                        </Box>
                      )}
                      {row.priority && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={priorityChipColor(row.priority.name)}
                          label={row.priority.name}
                          sx={{ height: 20, fontSize: 11.5, fontWeight: 600 }}
                        />
                      )}
                      <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>
                        {(row.reporter?.name || "—") +
                          " → " +
                          (row.assignee?.name || t("unassigned"))}
                      </Typography>
                    </Box>
                  </Box>
                  <ChevronRightIcon sx={{ color: "text.disabled", alignSelf: "center", ml: 0.5 }} />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>
          {truncated ? t("trend.truncated", { shown: rows.length, total: count }) : ""}
        </Typography>
        <Button onClick={onClose} size="small" sx={{ textTransform: "none", fontWeight: 600 }}>
          {t("trend.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
