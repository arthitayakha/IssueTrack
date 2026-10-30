import { theme } from "@/lib/theme";
import type { ReportView } from "@/lib/reports-api";
import type {
  CustomTableLayout,
  TDocumentDefinitions,
  TableCell,
} from "pdfmake/interfaces";

/**
 * PDF export for the reports page — pdfmake renders the whole report into a
 * downloadable A4 **landscape** file with an embedded Thai font (Sarabun),
 * replacing the old `window.print()` path that could not control orientation,
 * only printed the current page, and hid its layout in @media print CSS.
 *
 * The TTFs live in `public/fonts/` and are fetched → base64 → registered once
 * per session, so they stay out of the Next bundle; pdfmake itself arrives as
 * a lazy chunk that loads only when the user clicks Export PDF.
 */

const FONT_FAMILY = "Sarabun";
const FONT_FILES = {
  regular: "/fonts/Sarabun-Regular.ttf",
  bold: "/fonts/Sarabun-Bold.ttf",
};
/** vfs keys — pdfmake addresses fonts by these names, not by URL. */
const VFS_REGULAR = "Sarabun-Regular.ttf";
const VFS_BOLD = "Sarabun-Bold.ttf";

/**
 * Columns whose values are built from short space-separated tokens (dates
 * "28/10/69 13:15", durations "0 ชั่วโมง 2 นาที") break at those spaces —
 * `break-all` would split inside the clock or inside "นาที". Every other
 * column keeps break-all: Thai runs carry no spaces and must not overflow
 * their fixed-width cell.
 */
const WRAP_AT_SPACES = new Set([
  "receivedAt",
  "workStarted",
  "workEnded",
  "duration",
  "enteredTime",
  "lastAt",
]);

/** A4 landscape is 841.89 × 595.28 pt; margins leave a 793.89 pt content box. */
const PAGE_MARGIN: [number, number, number, number] = [24, 26, 24, 32];
const CONTENT_WIDTH = 841.89 - PAGE_MARGIN[0] - PAGE_MARGIN[2];

/**
 * Fixed table width (pt) per column key, per view. Keys without an entry
 * (title / description / analysis / resolution, person / app) become star
 * columns and split whatever width the fixed columns leave over — hiding
 * columns on screen therefore widens the free-text columns in the PDF too.
 */
const COLUMN_WIDTHS: Record<ReportView, Record<string, number>> = {
  issues: {
    index: 20,
    // wide enough for "#30926-0007" (11 chars) to stay on one line at 6.5pt
    issueNumber: 48,
    receivedAt: 42,
    assignee: 48,
    reporter: 48,
    workStarted: 42,
    workEnded: 42,
    duration: 36,
    enteredTime: 36,
    operators: 50,
    status: 42,
    category: 44,
    app: 40,
    priority: 34,
  },
  assignee: {
    issueCount: 44,
    openCount: 44,
    hoursActual: 56,
    hoursEntered: 56,
    lastAt: 52,
  },
  app: {
    issueCount: 44,
    openCount: 44,
    medianActual: 60,
    medianEntered: 60,
    topAssignee: 90,
    lastAt: 52,
  },
};

/**
 * Navy header row + alternating stripe, hairline borders in the table token —
 * the screen's look, applied through callbacks because pdfmake styles rows,
 * not elements. Colors come from the MUI theme (never hardcoded).
 */
const TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: (row, node) =>
    row === 0 || row === node.table.body.length ? 1 : 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => theme.custom.tableBorder,
  vLineColor: () => theme.custom.tableBorder,
  fillColor: (row) =>
    row === 0
      ? theme.palette.navy.main
      : row % 2 === 0
        ? theme.custom.tableStripe
        : null,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

export interface ReportPdfInput {
  /** Picks the column-width preset — same vocabulary as the view dropdown. */
  view: ReportView;
  /** Visible column keys in the user's display order (matches headers/data). */
  keys: string[];
  headers: string[];
  data: Array<Array<string | number>>;
  title: string;
  viewLabel: string;
  /** Already-translated header lines, e.g. "ช่วงวันที่: …" / "สร้างเมื่อ: …". */
  rangeLine: string;
  generatedLine: string;
  filename: string;
}

/**
 * The document definition on its own — pure, so it can be smoke-tested
 * outside the browser (fonts and the pdfmake chunk are wired separately).
 */
export function buildReportPdfDoc(input: ReportPdfInput): TDocumentDefinitions {
  const widths = input.keys.map((key) => COLUMN_WIDTHS[input.view][key] ?? "*");
  /**
   * A column is numeric when every row carries a number in it — mirrors the
   * screen's right alignment (the CSV keeps the raw String(value), so PDF and
   * CSV show identical text).
   */
  const numeric = input.keys.map(
    (_, col) =>
      input.data.length > 0 &&
      input.data.every((row) => typeof row[col] === "number"),
  );
  // 18 columns on A4 landscape is the tight case; fewer columns earn space.
  const fontSize =
    input.keys.length >= 16 ? 6.5 : input.keys.length >= 10 ? 7.5 : 9;

  const head: TableCell[] = input.headers.map((text, col) => ({
    text,
    style: "head",
    alignment: numeric[col] ? "right" : "left",
  }));
  const body: TableCell[][] = input.data.map((row) =>
    row.map((value, col) => ({
      text: String(value),
      style: WRAP_AT_SPACES.has(input.keys[col]) ? "cellWrap" : "cell",
      alignment: numeric[col] ? "right" : "left",
    })),
  );

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: PAGE_MARGIN,
    defaultStyle: {
      font: FONT_FAMILY,
      fontSize,
      color: theme.palette.text.primary,
    },
    info: { title: `${input.title} — ${input.viewLabel}` },
    styles: {
      title: {
        fontSize: 13,
        bold: true,
        color: theme.palette.navy.main,
        margin: [0, 0, 0, 3],
      },
      meta: {
        fontSize: 7.5,
        color: theme.palette.text.secondary,
        margin: [0, 0, 0, 1],
      },
      head: { bold: true, color: theme.palette.common.white, fontSize },
      // break-all: Thai runs have no spaces, so a long run would otherwise
      // overflow its fixed-width cell instead of wrapping.
      cell: { fontSize, wordBreak: "break-all" },
      // space-preferred wrapping for the date/duration columns
      cellWrap: { fontSize, wordBreak: "normal" },
    },
    content: [
      { text: `${input.title} — ${input.viewLabel}`, style: "title" },
      { text: input.rangeLine, style: "meta" },
      { text: input.generatedLine, style: "meta" },
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 1,
            lineColor: theme.palette.navy.main,
          },
        ],
        margin: [0, 5, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths,
          body: [head, ...body],
          dontBreakRows: true,
        },
        layout: TABLE_LAYOUT,
      },
    ],
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "right",
      fontSize: 7,
      color: theme.palette.text.secondary,
      margin: [PAGE_MARGIN[0], 0, PAGE_MARGIN[2], 0],
    }),
  };
}

type PdfMakeModule = typeof import("pdfmake");

/**
 * pdfmake resolves through webpack's `browser` field to the UMD build, whose
 * API lives on the prototype — `default ?? mod` covers both the CJS interop
 * default and a namespace that already carries the methods.
 */
let pdfMakePromise: Promise<PdfMakeModule> | null = null;
async function getPdfMake(): Promise<PdfMakeModule> {
  pdfMakePromise ??= (async () => {
    const mod = (await import("pdfmake")) as PdfMakeModule & {
      default?: PdfMakeModule;
    };
    return mod.default ?? mod;
  })();
  return pdfMakePromise;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // "data:font/ttf;base64,XXXX" → "XXXX" (pdfmake's vfs wants raw base64)
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("font read failed"));
    reader.readAsDataURL(blob);
  });
}

async function fetchFont(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  return blobToBase64(await res.blob());
}

/** Register Sarabun once per session (retries after a failed first attempt). */
let fontsPromise: Promise<void> | null = null;
function ensureFonts(pdfMake: PdfMakeModule): Promise<void> {
  fontsPromise ??= (async () => {
    const [regular, bold] = await Promise.all([
      fetchFont(FONT_FILES.regular),
      fetchFont(FONT_FILES.bold),
    ]);
    pdfMake.addFontContainer({
      vfs: { [VFS_REGULAR]: regular, [VFS_BOLD]: bold },
      fonts: {
        [FONT_FAMILY]: {
          normal: VFS_REGULAR,
          bold: VFS_BOLD,
          italics: VFS_REGULAR,
          bolditalics: VFS_BOLD,
        },
      },
    });
  })().catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

/** Build the document and trigger the browser download (no print dialog). */
export async function exportReportPdf(input: ReportPdfInput): Promise<void> {
  const pdfMake = await getPdfMake();
  await ensureFonts(pdfMake);
  await pdfMake.createPdf(buildReportPdfDoc(input)).download(input.filename);
}
