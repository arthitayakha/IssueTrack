import { Box, CircularProgress } from "@mui/material";

/** Spinner ทันทีตอนเข้า `/automation/runs` — โหลดประวัติสองชุด (กฎ + activity) */
export default function Loading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <CircularProgress />
    </Box>
  );
}
