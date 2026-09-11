/**
 * Gera o HTML do fixture SINTÉTICO para validação visual e em WeasyPrint.
 * Nenhum dado real de paciente é usado.
 *
 *   bun run scripts/export-jornada-html.ts            # escreve /tmp/jornada-sintetica.html
 *   bun run scripts/export-jornada-html.ts saida.html
 *   weasyprint /tmp/jornada-sintetica.html /tmp/jornada-sintetica.pdf
 */
import { writeFileSync } from "node:fs";

import {
  fixtureAnamnese,
  fixtureBio,
  fixtureJourney,
  fixtureProtocolo,
} from "../src/lib/journey/__fixtures__/jornada-sintetica";
import { renderProtocolHtml } from "../src/lib/journey/html";

const target = process.argv[2] ?? "/tmp/jornada-sintetica.html";

const html = renderProtocolHtml({
  patientName: fixtureJourney.patientName,
  objetivo: fixtureProtocolo.objetivo,
  anamnese: fixtureAnamnese,
  bio: fixtureBio,
  protocolo: fixtureProtocolo,
  draft: false,
  version: fixtureJourney.version,
});

writeFileSync(target, html, "utf8");
console.log(`HTML escrito em ${target} (${html.length} bytes).`);
