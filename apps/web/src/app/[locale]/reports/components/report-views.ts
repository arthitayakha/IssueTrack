import FactCheckIcon from "@mui/icons-material/FactCheck";
import PeopleIcon from "@mui/icons-material/People";
import AppsIcon from "@mui/icons-material/Apps";
import type { SvgIconComponent } from "@mui/icons-material";
import type { ReportView } from "@/lib/reports-api";

/** Menu / table-title icons for each report view (order = dropdown order). */
export const REPORT_VIEW_ORDER: ReportView[] = ["issues", "assignee", "app"];

export const VIEW_ICONS: Record<ReportView, SvgIconComponent> = {
  issues: FactCheckIcon,
  assignee: PeopleIcon,
  app: AppsIcon,
};
