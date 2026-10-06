"use client";

import { useTranslations } from "next-intl";
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanban";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { DRAWER_WIDTH } from "./navbar";
import { usePermissions } from "@/lib/permissions";
import { Link, usePathname } from "@/i18n/navigation";

export default function Sidebar() {
  const t = useTranslations("Nav");
  const { can } = usePermissions();
  const pathname = usePathname();

  const navItems = [
    { label: t("dashboard"), icon: DashboardIcon, href: "/" },
    { label: t("boards"), icon: ViewKanbanOutlinedIcon, href: "/boards" },
    { label: t("labels"), icon: LabelOutlinedIcon, href: "/labels" },
    { label: t("comments"), icon: ChatBubbleOutlineOutlinedIcon, href: "/comments" },
    ...(can("user.view")
      ? [{ label: t("users"), icon: PeopleOutlineIcon, href: "/users" }]
      : []),
    ...(can("permission.update")
      ? [{ label: t("settings"), icon: SettingsOutlinedIcon, href: "/settings" }]
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
          <ViewKanbanOutlinedIcon color="primary" />
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
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                <item.icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
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
