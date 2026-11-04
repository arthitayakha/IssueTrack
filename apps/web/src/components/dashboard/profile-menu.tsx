"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@mui/material/styles";
import {
  Avatar,
  Box,
  Divider,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Typography,
} from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { useAuthStore } from "@/lib/auth-store";
import { useOwnAvatar } from "@/lib/avatar";

interface ProfileMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** Navbar's `handleLogout` — clears the session and lands on /login. */
  onLogout: () => void;
  /** Opens the account popup on its settings tab. */
  onOpenSettings: () => void;
  /** Opens the account popup on its profile tab. */
  onOpenProfile: () => void;
}

/**
 * The navbar's avatar menu: identity header (avatar + name + role) over
 * settings / profile / logout. The first two open the account popup
 * instead of navigating — the old `/settings` page is gone.
 */
export default function ProfileMenu({
  open,
  anchorEl,
  onClose,
  onLogout,
  onOpenSettings,
  onOpenProfile,
}: ProfileMenuProps) {
  const t = useTranslations("Nav");
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const ownAvatar = useOwnAvatar();

  function openDialog(openTab: () => void) {
    onClose();
    openTab();
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{
        paper: {
          sx: {
            width: 260,
            maxWidth: "calc(100vw - 24px)",
            mt: 1,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadow,
            overflow: "hidden",
          },
        },
      }}
    >
      {/* Identity — the profile picture, name and role */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 2 }}>
        <Avatar
          src={ownAvatar ?? undefined}
          sx={{
            width: 40,
            height: 40,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontSize: "1rem",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {user?.name?.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            fontWeight={700}
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user?.name}
          </Typography>
          {user?.roleName && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {user.roleName}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider />

      <Box sx={{ py: 0.5 }}>
        <ListItemButton
          onClick={() => openDialog(onOpenSettings)}
          sx={{ px: 2, py: 1, "&:hover": { bgcolor: "action.hover" } }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <SettingsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t("accountSettings")}
            primaryTypographyProps={{ fontSize: "0.875rem" }}
          />
        </ListItemButton>

        <ListItemButton
          onClick={() => openDialog(onOpenProfile)}
          sx={{ px: 2, py: 1, "&:hover": { bgcolor: "action.hover" } }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t("profile")}
            primaryTypographyProps={{ fontSize: "0.875rem" }}
          />
        </ListItemButton>

        <Divider sx={{ my: 0.5 }} />

        <ListItemButton
          onClick={() => {
            onClose();
            onLogout();
          }}
          sx={{ px: 2, py: 1, "&:hover": { bgcolor: "action.hover" } }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <LogoutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t("signOut")}
            primaryTypographyProps={{ fontSize: "0.875rem" }}
          />
        </ListItemButton>
      </Box>
    </Popover>
  );
}
