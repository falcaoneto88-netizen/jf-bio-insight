import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getReportTool from "./tools/get-report";
import ghlFindContactTool from "./tools/ghl-find-contact";
import ghlPushReportTool from "./tools/ghl-push-report";
import listReportsTool from "./tools/list-reports";
import patientEvolutionTool from "./tools/patient-evolution";
import {
  consultarJornadaTool,
  exportarProtocoloHtmlTool,
  extrairBioimpedanciaTool,
  organizarAnamneseTool,
  prepararProtocoloTool,
} from "./tools/journey-tools";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "bioreport-studio",
  title: "BioReport Studio",
  version: "0.3.0",
  instructions:
    "Ferramentas clínicas do BioReport Studio (apenas administradores). Relatórios antigos: `list_reports`, `get_report`, `patient_evolution`. GoHighLevel: `ghl_find_contact` e `ghl_push_report` (escreve dados, exige confirmação explícita). Nova jornada clínica do Dr. João Falcão: `consultar_jornada`, `organizar_anamnese`, `extrair_bioimpedancia`, `preparar_protocolo` e `exportar_protocolo_html`. O assistente NUNCA aprova um protocolo: a aprovação é exclusivamente humana, feita na aplicação; o HTML final só existe depois dessa aprovação.",
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
    consultarJornadaTool,
    organizarAnamneseTool,
    extrairBioimpedanciaTool,
    prepararProtocoloTool,
    exportarProtocoloHtmlTool,
  ],
});
