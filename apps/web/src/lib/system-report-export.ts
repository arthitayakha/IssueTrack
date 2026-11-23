import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { theme } from "./theme";
import { FONT_FAMILY, ensureFonts, getPdfMake } from "./report-pdf";
import type { SystemReport } from "./system-reports-api";

/** Labels are passed in already translated, so the library stays i18n-free. */
export interface SystemReportExportLabels {
  title: string;
  count: string;
  colTitle: string;
  colReporter: string;
  colStatus: string;
  colCreated: string;
  colAttachments: string;
  status: Record<string, string>;
}

function dateOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH");
}

function body(rows: SystemReport[], l: SystemReportExportLabels): string[][] {
  return rows.map((r) => [
    r.title,
    r.reporterName ?? `#${r.reporterId}`,
    l.status[r.status] ?? r.status,
    dateOf(r.createdAt),
    String(r.attachments.length || 0),
  ]);
}

/** CSV with a BOM so Excel opens Thai text correctly. All FILTERED rows, not just the current page. */
export function exportSystemReportsCsv(
  rows: SystemReport[],
  l: SystemReportExportLabels,
  filename: string,
): void {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [l.colTitle, l.colReporter, l.colStatus, l.colCreated, l.colAttachments];
  const csv = [header, ...body(rows, l)].map((line) => line.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** PDF via the same lazy pdfmake + embedded Sarabun font the reports page uses. */
export async function exportSystemReportsPdf(
  rows: SystemReport[],
  l: SystemReportExportLabels,
  filename: string,
): Promise<void> {
  const pdfMake = await getPdfMake();
  await ensureFonts(pdfMake);
  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 26, 24, 32],
    defaultStyle: { font: FONT_FAMILY, fontSize: 9 },
    content: [
      { text: l.title, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      { text: `${l.count}: ${rows.length}`, margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ["*", 90, 85, 80, 45],
          body: [
            [l.colTitle, l.colReporter, l.colStatus, l.colCreated, l.colAttachments],
            ...body(rows, l),
          ],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? theme.palette.grey[100] : null),
        },
      },
    ],
  };
  await pdfMake.createPdf(doc).download(filename);
}
