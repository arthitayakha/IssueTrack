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
      tableShadow: string;
      columnColors: {
        backlog: string;
        todo: string;
        doing: string;
        done: string;
        review: string;
        default: string;
      };
      tableStripe: string;
      tableBorder: string;
      labelColors: {
        green: string;
        red: string;
        yellow: string;
        blue: string;
        purple: string;
        orange: string;
        pink: string;
        gray: string;
        default: string;
      };
    };
  }
  interface ThemeOptions {
    custom?: {
      loginGradient?: string;
      cardShadow?: string;
      tableShadow?: string;
      columnColors?: {
        backlog: string;
        todo: string;
        doing: string;
        done: string;
        review: string;
        default: string;
      };
      tableStripe?: string;
      tableBorder?: string;
      labelColors?: {
        green: string;
        red: string;
        yellow: string;
        blue: string;
        purple: string;
        orange: string;
        pink: string;
        gray: string;
        default: string;
      };
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
    tableShadow: "0 2px 12px rgba(30, 64, 120, 0.06)",
    columnColors: {
      backlog: "#9e9e9e",
      todo: "#42a5f5",
      doing: "#ffa726",
      done: "#66bb6a",
      review: "#ab47bc",
      default: "#78909c",
    },
    tableStripe: "#f5f5f5",
    tableBorder: "#eeeeee",
    labelColors: {
      green: "#4caf50",
      red: "#f44336",
      yellow: "#ffeb3b",
      blue: "#2196f3",
      purple: "#9c27b0",
      orange: "#ff9800",
      pink: "#e91e63",
      gray: "#9e9e9e",
      default: "#9e9e9e",
    },
  },
});
