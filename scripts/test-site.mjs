import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4321";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function shot(path, desc) {
  await page.screenshot({ path, fullPage: true });
  console.log(`[${desc}] → ${path}`);
}

console.log("→ /blog");
await page.goto(`${url}/blog/`, { waitUntil: "networkidle" });
await shot("/tmp/site-blog.png", "/blog");

console.log("→ /projects");
await page.goto(`${url}/projects`, { waitUntil: "networkidle" });
await shot("/tmp/site-projects.png", "/projects");

console.log("→ /projects#company");
await page.goto(`${url}/projects#company`, { waitUntil: "networkidle" });
await shot("/tmp/site-projects-company.png", "/projects#company");

console.log("→ click Side in sidebar (same page)");
await page.click('a[href="/projects#side"]');
await page.waitForTimeout(300);
await shot("/tmp/site-projects-side.png", "/projects#side after click");

console.log("→ click All projects");
await page.click('a[href="/projects"]');
await page.waitForTimeout(300);
await shot("/tmp/site-projects-all.png", "/projects all after click");

await browser.close();
