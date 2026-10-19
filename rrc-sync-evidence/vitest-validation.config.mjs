import { defineConfig } from '/home/devmat/BC4/franco-focus-forge/node_modules/vitest/dist/config.js';
export default defineConfig({root:'/home/devmat/BC4/franco-focus-forge',cacheDir:'/tmp/rrc-vitest-cache',test:{environment:'jsdom',globals:true,setupFiles:['./src/test/setup.ts'],include:['src/**/*.{test,spec}.{ts,tsx}']},resolve:{alias:{'@':'/home/devmat/BC4/franco-focus-forge/src'}}});
