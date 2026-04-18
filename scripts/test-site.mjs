import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function shot(name) {
  const path = `/tmp/site-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}
async function click(selector, waitMs = 500) {
  await page.click(selector);
  await page.waitForTimeout(waitMs);
}
async function visibleKinds() {
  return await page.$$eval("section[data-kind]", (s) =>
    s.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.dataset.kind)
  );
}

console.log(`URL: ${url}`);

// PROJECTS filter sequence — including the previously-broken case
await page.goto(`${url}/projects`, { waitUntil: "networkidle" });
console.log("1. /projects fresh:       ", await visibleKinds());
await click('a[href="/projects#company"]');
console.log("2. click Company:         ", await visibleKinds());
await click('a[href="/projects#side"]');
console.log("3. click Side:            ", await visibleKinds());
await click('a[href="/projects"]');
console.log("4. click All:             ", await visibleKinds());
await click('a[href="/projects#company"]');
console.log("5. click Company again:   ", await visibleKinds());
await click('a[href="/projects#side"]');
console.log("6. click Side:            ", await visibleKinds());

// BLOG category comparison
await page.goto(`${url}/blog/category/Backend`, { waitUntil: "networkidle" });
const backendH1 = await page.$eval("main", (m) => m.getBoundingClientRect());
const backendTitle = await page.$eval("main h1, main .text-3xl", (e) => {
  const r = e.getBoundingClientRect();
  return { x: r.x, text: e.textContent?.trim() };
});
await shot("cat-backend");

await page.goto(`${url}/blog/category/Career%20Journey`, { waitUntil: "networkidle" });
const cjH1 = await page.$eval("main", (m) => m.getBoundingClientRect());
const cjTitle = await page.$eval("main h1, main .text-3xl", (e) => {
  const r = e.getBoundingClientRect();
  return { x: r.x, text: e.textContent?.trim() };
});
await shot("cat-career-journey");

console.log("\nBackend page:");
console.log("  main.left =", backendH1.x, " title.left =", backendTitle.x, " text:", backendTitle.text);
console.log("Career Journey page:");
console.log("  main.left =", cjH1.x, "   title.left =", cjTitle.x, " text:", cjTitle.text);

await browser.close();
