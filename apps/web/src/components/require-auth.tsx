"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Box, CircularProgress } from "@mui/material";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [mounted, token, router, pathname]);

  if (!mounted || !token) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return <>{children}</>;
}
