"use client";

import { useTranslations } from "next-intl";
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SettingsIcon from "@mui/icons-material/Settings";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import PeopleIcon from "@mui/icons-material/People";
import { DRAWER_WIDTH } from "./navbar";
import { usePermissions } from "@/lib/permissions";
import { Link, usePathname } from "@/i18n/navigation";

export default function Sidebar() {
  const t = useTranslations("Nav");
  const { can } = usePermissions();
  const pathname = usePathname();

  const navItems = [
    { label: t("dashboard"), href: "/", icon: <DashboardIcon /> },
    { label: t("boards"), href: "/boards", icon: <ViewKanbanIcon /> },
    ...(can("user.view") || can("role.view") || can("position.view")
      ? [{ label: t("users"), href: "/users", icon: <PeopleIcon /> }]
      : []),
    ...(can("permission.update")
      ? [{ label: t("settings"), href: "/settings", icon: <SettingsIcon /> }]
      : []),
    ...(can("report.view")
      ? [{ label: t("reports"), href: "/reports", icon: <BarChartIcon /> }]
      : []),
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          borderRight: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        },
      }}
    >
      <Toolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" fontWeight={700} color="text.primary">
            Issue Tracker
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1.5, py: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={Link}
              href={item.href}
              selected={pathname === item.href}
              sx={{ borderRadius: 1.5 }}
            >
              {item.icon}
              <ListItemText
                primary={item.label}
                sx={{ ml: 1.5 }}
                primaryTypographyProps={{
                  fontSize: "0.9rem",
                  fontWeight: pathname === item.href ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}
