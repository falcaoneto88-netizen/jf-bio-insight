import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Exercita o handler real sem transformá-lo em um stub RPC do TanStack.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/lib/appointments/*.test.ts", "src/lib/appointments/functions.handler.check.ts"],
  },
});
