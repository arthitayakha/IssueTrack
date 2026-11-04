"use client";

import { FormControlLabel, IconButton, Switch } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import type { App } from "@/lib/apps-api";

/**
 * คอลัมน์ "การจัดการ" ของแอป — switch เปิด/ปิด + ปุ่มแก้ + ปุ่มลบ
 * ใช้ร่วมกันทั้งตารางสั้นใน `/master-data` และตารางละเอียดใน `/systems`
 * เพื่อให้สิทธิ์/พฤติกรรมของปุ่มทั้งสองหน้าตรงกันเป๊ะ
 */
export default function AppActions({
  app,
  canUpdate,
  canDelete,
  onToggle,
  onEdit,
  onDelete,
}: {
  app: App;
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: (app: App) => void;
  onEdit: (app: App) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {canUpdate && (
        <FormControlLabel
          control={
            <Switch
              checked={app.isVisible}
              onChange={() => onToggle(app)}
              size="small"
            />
          }
          label=""
          sx={{ mr: 1 }}
        />
      )}
      {canUpdate && (
        <IconButton size="small" onClick={() => onEdit(app)}>
          <EditIcon fontSize="small" />
        </IconButton>
      )}
      {canDelete && (
        <IconButton size="small" onClick={() => onDelete(app.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </>
  );
}
