import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getReportTool from "./tools/get-report";
import listReportsTool from "./tools/list-reports";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "bioreport-studio",
  title: "BioReport Studio",
  version: "0.1.0",
  instructions:
    "Ferramentas clínicas do BioReport Studio. Use `list_reports` para encontrar relatórios de bioimpedância gerados (com filtro opcional por nome do paciente) e `get_report` para obter o detalhe completo de um relatório.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listReportsTool, getReportTool],
});
