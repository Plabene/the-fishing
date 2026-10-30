import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',testMatch:'**/*.smoke.ts',workers:1,timeout:45000,
  use:{baseURL:'http://127.0.0.1:5182/the-fishing/',browserName:'chromium',reducedMotion:'reduce',trace:'retain-on-failure'},
  projects:[320,360,375,390,430,620,768,1024,1440].map(width=>({name:`width-${width}`,use:{viewport:{width,height:900},hasTouch:width<=430}})),
  webServer:{command:'pnpm dev --port 5182 --strictPort',url:'http://127.0.0.1:5182/the-fishing/tests/responsive-fixture.html',env:{PWA_BASE:'/the-fishing/'},reuseExistingServer:false},
});
