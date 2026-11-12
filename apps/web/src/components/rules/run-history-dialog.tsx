"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import { useLocale, useTranslations } from "next-intl";
import { fetchRuleActivity, fetchRules } from "@/lib/rules-api";
import type { PaginatedActivity } from "@/lib/rules-api";
import { Pagination } from "@/components/pagination";
import DataTable, {
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from "@/components/data-table";
import type { RuleActivityDto, RuleDto } from "@kanban/shared";
import { timeAgo } from "@/lib/time-ago";

const PAGE_SIZE = 10;

/** Audit actions written by RulesService → label key + chip colour. */
const ACTION_STYLE: Record<
  string,
  { key: "actionCreated" | "actionUpdated" | "actionDeleted"; color: "success" | "info" | "error" }
> = {
  "rule.created": { key: "actionCreated", color: "success" },
  "rule.updated": { key: "actionUpdated", color: "info" },
  "rule.deleted": { key: "actionDeleted", color: "error" },
};

interface RunHistoryDialogProps {
  /** ปิดป๊อปอัพ (กด ✕ / Esc) — host (RulesPanel) เป็นคนถือ state */
  onClose: () => void;
}

/**
 * ป๊อปอัพ "ประวัติการทำงาน" — เนื้อหาทั้งหมดย้ายมาจากหน้าเต็ม `/automation/runs`
 * ซึ่งตอนนี้ถูกถอดเป็น 307 redirect ไปแท็บระบบอัตโนมัติของ `/master-data` แล้ว
 * (ตรงกับ create/edit: bookmark เก่าไม่ 404 และ **ไม่ auto-open** ป๊อปอัพ)
 * — mount ใหม่ทุกครั้งที่เปิด (host ตั้ง state = null เมื่อปิด) เพื่อให้ดึง
 * รายการ + กฎสำหรับ dropdown กรอง ใหม่ทุกครั้ง
 * — ผัง flex เหมือน RuleWizardDialog: ความสูงฟิก 680px, toolbar กรอง/รีเฟรชตรึงบน,
 * ตารางเลื่อนกลาง (flex:1 + overflowY), pagination ตรึงขอบล่างไม่จมหาย
 */
export default function RunHistoryDialog({ onClose }: RunHistoryDialogProps) {
  const t = useTranslations("Automation");
  const tRuns = useTranslations("Automation.runs");
  const theme = useTheme();
  const locale = useLocale();

  const [activity, setActivity] = useState<PaginatedActivity | null>(null);
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // rule list only feeds the filter dropdown — its failure must not hide history
  useEffect(() => {
    let cancelled = false;
    fetchRules()
      .then((data) => {
        if (!cancelled) setRules(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRuleActivity({
          page,
          limit: PAGE_SIZE,
          ...(ruleFilter === "all" ? {} : { ruleId: Number(ruleFilter) }),
        });
        if (!cancelled) setActivity(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : tRuns("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleFilter, page, reloadKey]);

  function actionLabel(action: string): string {
    const style = ACTION_STYLE[action];
    return style ? tRuns(style.key) : action;
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      /**
       * ความสูงฟิก 680px (กันจอล้นด้วย 88vh) + flex column + overflow hidden เหมือน
       * RuleWizardDialog — เนื้อหาส่วนที่เกินให้ "กล่องตาราง" เลื่อนเอง ปุ่ม ✕ กับ
       * pagination จึงไม่เคยจมหายตอนมีหลายหน้า
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
      aria-labelledby="run-history-dialog-title"
    >
      <DialogTitle sx={{ px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }} id="run-history-dialog-title">
            {tRuns("title")}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label={t("cancel")}
            size="small"
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* ⚠️ อย่าใส่ `pt` เพื่อเว้นจาก DialogTitle — MUI บังคับ padding-top: 0 ให้
          DialogContent ที่อยู่ติด DialogTitle ด้วย selector .MuiDialogTitle-root +
          .MuiDialogContent-root ซึ่งชนะ sx ทุกครั้ง → ช่องว่างใต้หัวป๊อปอัพจึง
          ไม่ต้องมี (toolbar ชิดหัวได้เลย) */}
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
        {/* toolbar ตรึงบน — เปลี่ยนกฎกรอง/รีเฟรชได้โดยไม่ต้องเลื่อนตาราง */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <Select
            size="small"
            value={ruleFilter}
            onChange={(e) => {
              setRuleFilter(e.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 240 }}
            aria-label={tRuns("filterAll")}
          >
            <MenuItem value="all">{tRuns("filterAll")}</MenuItem>
            {rules.map((rule) => (
              <MenuItem key={rule.id} value={String(rule.id)}>
                {rule.name}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {tRuns("refresh")}
          </Button>
          {activity && (
            <Typography variant="body2" color="text.secondary">
              {tRuns("total", { count: activity.total })}
            </Typography>
          )}
        </Box>

        {/* กล่องตารางเลื่อนกลาง (flex:1 + minHeight:0 + overflowY) — โหลด/พัง/ว่าง/ตาราง
            อยู่ในกลองนี้ทั้งหมด ให้ pagination ด้านล่างเป็นคนตรึงขอบป๊อปอัพ */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                  {t("retry")}
                </Button>
              }
            >
              <Typography>{error}</Typography>
            </Alert>
          ) : !activity || activity.data.length === 0 ? (
            <Box sx={{ py: 8, textAlign: "center" }}>
              <HistoryIcon sx={{ fontSize: 48, color: "text.disabled" }} />
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ color: theme.palette.navy.main, mt: 1 }}
              >
                {tRuns("emptyTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {tRuns("emptyDescription")}
              </Typography>
            </Box>
          ) : (
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableCell>{tRuns("columnTime")}</DataTableCell>
                  <DataTableCell>{tRuns("columnActor")}</DataTableCell>
                  <DataTableCell>{tRuns("columnAction")}</DataTableCell>
                  <DataTableCell>{tRuns("columnRule")}</DataTableCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {activity.data.map((row: RuleActivityDto) => {
                  const style = ACTION_STYLE[row.action];
                  return (
                    <DataTableRow key={row.id}>
                      <DataTableCell sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip
                          title={new Date(row.createdAt).toLocaleString(locale)}
                          placement="top"
                        >
                          <span>{timeAgo(row.createdAt, locale)}</span>
                        </Tooltip>
                      </DataTableCell>
                      <DataTableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.actorName ?? "—"}
                        </Typography>
                        {row.actorRole && (
                          <Typography variant="caption" color="text.secondary">
                            {row.actorRole}
                          </Typography>
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={style?.color ?? "default"}
                          label={actionLabel(row.action)}
                          sx={{ fontWeight: 600 }}
                        />
                      </DataTableCell>
                      <DataTableCell>
                        {row.ruleName ?? (row.ruleId != null ? `#${row.ruleId}` : "—")}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          )}
        </Box>

        {/* pagination ตรึงขอบล่าง — Pagination คืน null เมื่อมีหน้าเดียว
            (ไม่ render กรอบเปล่า ๆ ไว้รอ) */}
        {activity && activity.totalPages > 1 && (
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", mt: 1 }}>
            <Pagination
              page={page}
              totalPages={activity.totalPages}
              total={activity.total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
            />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
