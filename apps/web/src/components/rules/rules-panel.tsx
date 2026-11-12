"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/auth-store";
import { useNotification } from "@/components/notification";
import { fetchRules, deleteRule, toggleRule } from "@/lib/rules-api";
import { isApiError } from "@/lib/api";
import type { RuleDto } from "@kanban/shared";
import RuleList from "@/components/rules/rule-list";
import RuleWizardDialog from "@/components/rules/rule-wizard-dialog";
import RunHistoryDialog from "@/components/rules/run-history-dialog";

interface RulesPanelProps {
  /**
   * `false` = view-only seat: rows render read-only (no switch / edit / delete)
   * and the "สร้างกฎ" button stays hidden — the host tab passes
   * `can("automation.update")`; the list itself only needs `automation.view`,
   * which is what gates the host page/tab.
   */
  canUpdate: boolean;
}

/**
 * The rules list **body** (fetch + loading/error/empty + `RuleList`) + ปุ่มหัวแท็บ
 * ("ดูประวัติการทำงาน" / "สร้างกฎ") + ป๊อปอัพสร้าง/แก้ไขกฎ (`RuleWizardDialog`)
 * + ป๊อปอัพประวัติการทำงาน (`RunHistoryDialog`) — หน้า `/automation` (list),
 * `/automation/new`, `/automation/[id]` และ `/automation/runs` (ประวัติ) ถูกถอด
 * ออกเป็น 307 redirect ไปแท็บนี้ทั้งหมด เหลือ host เดียวคือแท็บ "ระบบอัตโนมัติ"
 * ใน `/master-data` ซึ่งตอนนี้ส่งมาแค่ `canUpdate` — ปุ่มเปิดป๊อปอัพทั้งสองจึง
 * อยู่ใน component นี้เพราะ state ของป๊อปอัพกับการรีเฟรชรายการต้องอยู่ที่เดียวกัน
 */
export default function RulesPanel({ canUpdate }: RulesPanelProps) {
  const t = useTranslations("Automation");
  const theme = useTheme();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();

  const [rules, setRules] = useState<RuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * ป๊อปอัพสร้าง/แก้ไขกฎ — `null` = ปิด, `{}` = สร้างใหม่, `{ rule }` = แก้ไขกฎนั้น
   * ตั้งเป็น null ตอนปิดเพื่อให้ `RuleWizardDialog` unmount → เปิดครั้งหน้าได้
   * state ใหม่ (โหลด reference + duplicate list ใหม่) ไม่ใช่ค่าค้างจากครั้งก่อน
   */
  const [wizard, setWizard] = useState<null | { rule?: RuleDto }>(null);
  /**
   * ป๊อปอัพ "ประวัติการทำงาน" — `false` = ปิด, `true` = เปิด (mount เฉพาะตอนเปิด
   * เหมือน wizard: เปิดใหม่ fetch ตาราง + dropdown กรอง ใหม่ทุกครั้ง) เดิมเป็น
   * <Link> ไปหน้าเต็ม `/automation/runs` ซึ่งตอนนี้ถูกถอดเป็น 307 redirect แล้ว
   */
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRules();
        if (!cancelled) {
          setRules(data);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadKey]);

  /**
   * A 404 means the rule is already gone from the DB (deleted from another
   * tab / session). Drop the stale row by refetching instead of leaving a
   * ghost that keeps failing every action.
   */
  function handleRuleGone(err: unknown): boolean {
    if (!isApiError(err, 404)) return false;
    notify(t("ruleGone"), "warning");
    setReloadKey((k) => k + 1);
    return true;
  }

  async function handleToggle(rule: RuleDto, isActive: boolean) {
    try {
      const updated = await toggleRule(rule.id, isActive);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      if (handleRuleGone(err)) return;
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      notify(t("deleted"), "success");
    } catch (err) {
      if (handleRuleGone(err)) return;
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  /**
   * แถวปุ่มหัวแท็บ — ย้ายมาจาก `/master-data` (เดิมเป็น chrome ของ host) เพราะ
   * ปุ่ม "สร้างกฎ" เปิดป๊อปอัพที่ component นี้ถือ state อยู่
   * — ปุ่ม "ดูประวัติการทำงาน" เดิมเป็น <Link> ไป `/automation/runs` ตอนนี้เป็น
   * onClick เปิดป๊อปอัพ (RunHistoryDialog) แทน — หน้านั้นถูกถอดเป็น 307 redirect
   * ไปแท็บเดียวกันแล้ว เหมือนหน้า list/wizard/edit ที่ถอดไปก่อนหน้า
   */
  const header = (
    <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<HistoryIcon />}
          onClick={() => setHistoryOpen(true)}
        >
          {t("history")}
        </Button>
        {canUpdate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizard({})}>
            {t("create")}
          </Button>
        )}
      </Box>
    </Box>
  );

  /**
   * ป๊อปอัพถูก mount เฉพาะตอนเปิด (`wizard !== null`) — สถานะโหลด/ผิด/ว่าง
   * ข้างล่างเป็นแค่ "body" ใต้ header เดียวกัน เพื่อให้ปุ่ม "สร้างกฎ"
   * ใช้ได้ทุกสถานะ รวมตอนที่ยังไม่มีกฎเลย
   */
  return (
    <Box>
      {header}

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
      ) : rules.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {t("emptyTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("emptyDescription")}
          </Typography>
        </Box>
      ) : (
        <RuleList
          rules={rules}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEdit={(rule) => setWizard({ rule })}
          canUpdate={canUpdate}
        />
      )}

      {wizard && (
        <RuleWizardDialog
          rule={wizard.rule}
          onClose={() => setWizard(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      {historyOpen && <RunHistoryDialog onClose={() => setHistoryOpen(false)} />}
    </Box>
  );
}
