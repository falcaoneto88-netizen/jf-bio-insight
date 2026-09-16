/** Executar com: npx tsx scripts/export-protocol-previews.ts [diretório]. Apenas dados fictícios. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderProtocolHtml } from "../src/lib/journey/html";
import {
  longProtocolFixture,
  shortProtocolFixture,
} from "../src/lib/journey/__fixtures__/protocol-visual";
const directory = resolve(process.argv[2] ?? "output/html");
mkdirSync(directory, { recursive: true });
for (const [name, data] of [
  ["protocolo-curto-ficticio", shortProtocolFixture()],
  ["protocolo-extenso-ficticio", longProtocolFixture()],
] as const) {
  const path = resolve(directory, `${name}.html`);
  writeFileSync(path, renderProtocolHtml(data));
  console.log(path);
}
