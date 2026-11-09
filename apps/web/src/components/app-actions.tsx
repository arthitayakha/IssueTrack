"use client";

import { FormControlLabel, IconButton, Switch } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import type { App } from "@/lib/apps-api";

/**
 * คอลัมน์ "การจัดการ" ของแอป — ปุ่มแก้ + ปุ่มลบ (และ switch เปิด/ปิด **ถ้าส่ง `onToggle` มาให้**)
 * ใช้ร่วมกันทั้งตารางสั้นใน `/master-data` และตารางละเอียดใน `/systems`
 * เพื่อให้สิทธิ์/พฤติกรรมของปุ่มทั้งสองหน้าตรงกันเป๊ะ
 *
 * **`onToggle` เป็น optional**: หน้า `/systems` ไม่ส่งมา → ไม่โชว์สวิตช์
 * (คอลัมน์ "การใช้งาน" ถูกเอาออกจากหน้านั้นแล้ว การเปิด/ปิดแอปทำที่แท็บแอปใน `/master-data`)
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
  onToggle?: (app: App) => void;
  onEdit: (app: App) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {canUpdate && onToggle && (
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
