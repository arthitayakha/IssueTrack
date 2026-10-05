"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconButton, Menu, MenuItem } from "@mui/material";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function LanguageSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label={t("switchLanguage")}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        <LanguageOutlinedIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {routing.locales.map((l) => (
          <MenuItem
            key={l}
            selected={l === locale}
            onClick={() => {
              setAnchorEl(null);
              router.replace(pathname, { locale: l });
            }}
          >
            {l === "th" ? "ไทย" : "English"}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
