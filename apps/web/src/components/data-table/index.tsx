"use client";

import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { ReactNode } from "react";

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">{children}</Table>
    </TableContainer>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <TableHead>
      <TableRow>{children}</TableRow>
    </TableHead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <TableBody>{children}</TableBody>;
}

export function DataTableRow({ children }: { children: ReactNode }) {
  return <TableRow sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>{children}</TableRow>;
}

export function DataTableCell({
  children,
  align,
}: {
  children: ReactNode;
  align?: "left" | "center" | "right";
}) {
  return <TableCell align={align}>{children}</TableCell>;
}
