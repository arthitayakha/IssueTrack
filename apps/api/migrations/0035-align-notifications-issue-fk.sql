-- 0035: the DB-level FK was NO ACTION while Notification.entity declares
-- onDelete CASCADE — align the constraint so a real (hard) issue delete can
-- never be blocked by leftover notifications.
-- Idempotent on purpose — safe to run more than once.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_issue;
ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_issue
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
