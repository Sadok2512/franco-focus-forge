// Run the RRC guards under Node without writing to container-owned .vite-temp.
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export default {
  root,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/test/rrc-*.test.{ts,tsx}",
      "src/test/dictionary-grouping.test.ts",
      "src/features/dict-v2/*.test.ts",
    ],
  },
  resolve: { alias: { "@": `${root}src` } },
};
