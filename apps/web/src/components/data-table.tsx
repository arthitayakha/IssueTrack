"use client";

import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme } from "@mui/material";
import type { SxProps } from "@mui/material/styles";
import type { ReactNode } from "react";

interface DataTableProps {
  children: ReactNode;
  rounded?: boolean;
}

export default function DataTable({ children, rounded = true }: DataTableProps) {
  const theme = useTheme();
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        borderRadius: rounded ? 3 : 1,
        border: "1px solid",
        borderColor: "divider",
        boxShadow: theme.custom.tableShadow,
        overflow: "hidden",
        "& .MuiTableCell-head": {
          bgcolor: "grey.50",
          color: "text.primary",
          fontWeight: 500,
          fontSize: "0.875rem",
          borderBottom: "2px solid",
          borderColor: "divider",
          py: 1.5,
        },
        "& .MuiTableCell-body": {
          borderBottom: "1px solid",
          borderColor: "grey.100",
          py: 1.5,
        },
        "& .MuiTableRow-root:last-child .MuiTableCell-body": {
          borderBottom: "none",
        },
        "& .MuiTableRow-root:hover .MuiTableCell-body": {
          bgcolor: "sky.dark",
        },
      }}
    >
      <Table size="small">
        {children}
      </Table>
    </TableContainer>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return <TableHead>{children}</TableHead>;
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <TableBody>{children}</TableBody>;
}

export function DataTableRow({ children, hover = true, ...props }: {
  children: ReactNode;
  hover?: boolean;
  ref?: React.Ref<HTMLTableRowElement>;
  style?: React.CSSProperties;
  sx?: SxProps;
}) {
  return <TableRow hover={hover} ref={props.ref} style={props.style} sx={props.sx}>{children}</TableRow>;
}

export function DataTableCell({ children, align, colSpan, sx }: {
  children: ReactNode;
  align?: "left" | "center" | "right";
  colSpan?: number;
  sx?: SxProps;
}) {
  return <TableCell align={align} colSpan={colSpan} sx={sx}>{children}</TableCell>;
}
