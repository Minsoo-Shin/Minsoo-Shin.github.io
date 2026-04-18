import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const t of ["main", "software", "hardware"]) {
  await page.goto(`${url}/resume/${t}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `/tmp/resume-${t}.png`, fullPage: true });
  console.log(`/resume/${t} → /tmp/resume-${t}.png`);
}
await browser.close();
