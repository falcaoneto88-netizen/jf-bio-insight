import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getReportTool from "./tools/get-report";
import ghlFindContactTool from "./tools/ghl-find-contact";
import ghlPushReportTool from "./tools/ghl-push-report";
import listReportsTool from "./tools/list-reports";
import patientEvolutionTool from "./tools/patient-evolution";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "bioreport-studio",
  title: "BioReport Studio",
  version: "0.2.0",
  instructions:
    "Ferramentas clínicas do BioReport Studio (apenas administradores). Use `list_reports` para encontrar relatórios de bioimpedância (filtros por nome e datas), `get_report` para o detalhe de um relatório, `patient_evolution` para comparar a evolução de um paciente, `ghl_find_contact` para procurar contactos no GoHighLevel e `ghl_push_report` para enviar o resumo de um relatório para o GoHighLevel — esta última escreve dados e exige confirmação explícita do utilizador.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listReportsTool,
    getReportTool,
    patientEvolutionTool,
    ghlFindContactTool,
    ghlPushReportTool,
  ],
});
