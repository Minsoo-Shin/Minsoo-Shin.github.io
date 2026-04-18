import { chromium } from "playwright";

const url = "https://minsoo-shin.github.io";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("console", (msg) => console.log(`[${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(`${url}/projects`, { waitUntil: "networkidle" });

async function state(label) {
  const info = await page.evaluate(() => ({
    url: location.href,
    sections: Array.from(document.querySelectorAll("[data-kind]")).map((e) => e.style.display || "(vis)"),
  }));
  console.log(`[${label}] ${info.url}  sections: ${info.sections.join(" | ")}`);
}

await state("init");

// Try clicking
await page.click('a[href="/projects#company"]');
await page.waitForTimeout(600);
await state("after click /projects#company");

// Try direct hash set
await page.evaluate(() => { window.location.hash = "side"; });
await page.waitForTimeout(600);
await state("after JS hash=side");

// Trigger hashchange manually
await page.evaluate(() => window.dispatchEvent(new Event("hashchange")));
await page.waitForTimeout(300);
await state("after dispatch hashchange");

await browser.close();
