"use client";

import { Pagination as MuiPagination, PaginationItem, Typography, Box } from "@mui/material";
import type { PaginationRenderItemParams } from "@mui/material/Pagination";
import { useTranslations } from "next-intl";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: PaginationProps) {
  const t = useTranslations("pagination");
  if (totalPages <= 1) return null;

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        px: 2,
        py: 1.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {t("showing", { start, end, total })}
      </Typography>
      <MuiPagination
        count={totalPages}
        page={page}
        onChange={(_, p: number) => onPageChange(p)}
        shape="rounded"
        color="primary"
        size="small"
        renderItem={(item: PaginationRenderItemParams) => (
          <PaginationItem
            {...item}
            sx={{
              "&.Mui-selected": {
                bgcolor: "navy.main",
                color: "white",
                "&:hover": {
                  bgcolor: "navy.dark",
                },
              },
            }}
          />
        )}
      />
    </Box>
  );
}
