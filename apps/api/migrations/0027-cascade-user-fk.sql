-- Deleting a user must not fail when dependent rows exist.
-- programmer_id/user_id had no ON DELETE action (RESTRICT), which made
-- DELETE FROM users roll back with SQLSTATE 23503 whenever the user had
-- work_sessions or notifications. Align them with comments.user_id (CASCADE).

ALTER TABLE work_sessions DROP CONSTRAINT fk_work_sessions_programmer;
ALTER TABLE work_sessions
  ADD CONSTRAINT fk_work_sessions_programmer
  FOREIGN KEY (programmer_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT fk_notifications_user;
ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
