"use client";

import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme } from "@mui/material";
import type { SxProps } from "@mui/material/styles";
import type { ReactNode } from "react";

interface DataTableProps {
  children: ReactNode;
  rounded?: boolean;
}

/**
 * The one table of the system — every page with a table renders through this
 * component, so changing its style (or the table tokens in the theme) updates
 * all of them at once. The look mirrors the board issue table: striped header,
 * compact cells, light row borders.
 */
export default function DataTable({ children, rounded = true }: DataTableProps) {
  const theme = useTheme();
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        borderRadius: rounded ? 2 : 1,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        minWidth: 0,
        "& .MuiTableCell-head": {
          bgcolor: theme.custom.tableStripe,
          color: "text.primary",
          fontWeight: 600,
          fontSize: "0.8rem",
          py: 1.5,
        },
        "& .MuiTableCell-body": {
          fontSize: "0.8rem",
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: theme.custom.tableBorder,
        },
        "& .MuiTableRow-root:last-child .MuiTableCell-body": {
          borderBottom: "none",
        },
        "& .MuiTableRow-root:hover .MuiTableCell-body": {
          bgcolor: theme.palette.action.hover,
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
  onClick?: React.MouseEventHandler<HTMLTableRowElement>;
  style?: React.CSSProperties;
  sx?: SxProps;
}) {
  return (
    <TableRow hover={hover} ref={props.ref} style={props.style} onClick={props.onClick} sx={props.sx}>
      {children}
    </TableRow>
  );
}

export function DataTableCell({ children, align, colSpan, sx }: {
  children: ReactNode;
  align?: "left" | "center" | "right";
  colSpan?: number;
  sx?: SxProps;
}) {
  return <TableCell align={align} colSpan={colSpan} sx={sx}>{children}</TableCell>;
}
