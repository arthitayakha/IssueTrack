"use client";

import { useEffect, useState } from "react";
import { Box, Toolbar, useMediaQuery, useTheme } from "@mui/material";
import { usePathname } from "@/i18n/navigation";
import Navbar from "./navbar";
import Sidebar from "./sidebar";

export default function DashboardLayout({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
}) {
  const theme = useTheme();
  // the sidebar is permanent from `xl` up (1536px+, e.g. the external
  // monitor); below that it becomes a temporary drawer opened by the
  // navbar's hamburger button
  const isNarrow = useMediaQuery(theme.breakpoints.down("xl"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // navigating closes the drawer — otherwise it would cover the new page
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", overflow: "hidden" }}>
      <Navbar
        header={header}
        onMenuToggle={() => setDrawerOpen((open) => !open)}
        showMenuButton={isNarrow}
      />
      <Sidebar
        variant={isNarrow ? "temporary" : "permanent"}
        open={isNarrow ? drawerOpen : true}
        onClose={() => setDrawerOpen(false)}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, md: 3 },
          bgcolor: "background.default",
          minHeight: "100vh",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
