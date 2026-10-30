import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("./.deps/lightvm/", import.meta.url));
export default defineConfig({
  site: "https://kajlights.com",
  base: process.env.BASE_PATH || "/",
  output: "static",
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "@device-client": source + "web/protocol.mjs",
        "@device-transports": source + "web/transports.mjs",
        "@firmware-contract": source + "shared/device-core/web/firmware.mjs",
        "@device-contracts": source + "shared/device-core/contracts",
      },
    },
  },
});
