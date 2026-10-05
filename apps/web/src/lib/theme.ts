"use client";

import { createTheme } from "@mui/material/styles";
import type { PaletteColor, PaletteColorOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    navy: PaletteColor;
    sky: PaletteColor;
  }
  interface PaletteOptions {
    navy?: PaletteColorOptions;
    sky?: PaletteColorOptions;
  }
  interface Theme {
    custom: {
      loginGradient: string;
      cardShadow: string;
    };
  }
  interface ThemeOptions {
    custom?: {
      loginGradient?: string;
      cardShadow?: string;
    };
  }
}

export const theme = createTheme({
  palette: {
    mode: "light",
    navy: {
      main: "#1c2541",
      dark: "#141b31",
    },
    sky: {
      main: "#a8d4f0",
      light: "#c9e6f7",
      dark: "#e8f4fc",
    },
  },
  custom: {
    loginGradient:
      "linear-gradient(180deg, #a8d4f0 0%, #c9e6f7 45%, #e8f4fc 100%)",
    cardShadow: "0 12px 40px rgba(30, 64, 120, 0.15)",
  },
});
