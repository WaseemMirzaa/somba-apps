import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function loginAs(page, personaId) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((id) => localStorage.setItem("somba-persona-id", id), personaId);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
}

const shopTests = [
  ["/shop/account", ["Disputes"], "Shop account — Disputes label", null],
  ["/shop/orders/ORD-2024-002", ["Fulfilment by Seller", "PKG-002"], "Shop order MF-2", null],
  ["/shop/orders/ORD-2024-002/tracking", ["Parcel 1", "Live map"], "Shop tracking MF-2", null],
  ["/shop/returns", ["RET-001"], "Shop returns list", null],
  ["/shop/returns/RET-001", ["RET-001"], "Shop return detail", null],
  ["/shop/disputes", ["DSP-001"], "Shop disputes list", null],
  ["/shop/disputes/DSP-001", ["DSP-001"], "Shop dispute detail", null],
  ["/shop/support/TKT-441", ["TKT-441"], "Shop support detail", null],
  ["/shop/wallet/transactions/WTX-02", ["WTX-02"], "Shop wallet txn", null],
  ["/shop/account/addresses/new", ["Address"], "Address form CF-21", null],
];

const sellerTests = [
  ["/seller/support", ["TKT-001"], "Seller support list", "seller-1"],
  ["/seller/support/TKT-001", ["Payout delay"], "Seller support detail", "seller-1"],
  ["/seller/finance/payouts/PAY-002", ["Linked Transactions", "Cancel Request"], "Seller payout pending", "seller-1"],
  ["/seller/finance/payouts/PAY-001", ["PAY-001"], "Seller payout paid", "seller-1"],
  ["/seller/finance/transactions/TXN-2024-001", ["TXN-2024-001"], "Seller finance txn", "seller-1"],
  ["/seller/orders/ORD-2024-001", ["Paris Fulfillment Center", "Warehouse Detail"], "Seller order warehouse link", "seller-1"],
  ["/seller/reviews/1", ["Marie D."], "Seller review detail", "seller-1"],
];

const adminTests = [
  ["/admin/finance", ["TXN-901"], "Admin finance list", "admin-fin"],
  ["/admin/finance/transactions/TXN-901", ["TXN-901", "Order Payment"], "Admin finance txn detail", "admin-fin"],
  ["/admin/audit", ["APPROVE_SELLER"], "Admin audit list", "admin-1"],
  ["/admin/audit/AUD-001", ["AUD-001", "APPROVE_SELLER"], "Admin audit detail", "admin-1"],
  ["/admin/orders/ORD-2024-001", ["ORD-2024-001"], "Admin order detail", "admin-1"],
  ["/admin/payouts/PAY-001", ["PAY-001"], "Admin payout detail", "admin-fin"],
  ["/admin/support/TKT-441", ["TKT-441"], "Admin support detail", "admin-sup"],
  ["/admin/fraud/FRD-001", ["FRD-001"], "Admin fraud detail", "admin-1"],
  ["/admin/returns/RET-001", ["RET-001"], "Admin return detail", "admin-1"],
  ["/admin/marketing/CMP-01", ["CMP-01"], "Admin marketing detail", "admin-mkt"],
  ["/admin/flash-sales/FS-01", ["FS-01"], "Admin flash sale detail", "admin-mkt"],
  ["/admin/categories/1", ["Electronics"], "Admin category detail", "admin-1"],
  ["/admin/roles/super", ["Super Admin"], "Admin role detail", "admin-1"],
  ["/admin/cms/blocks/hero", ["Hero Banner"], "Admin CMS block", "admin-mkt"],
];

const warehouseTests = [
  ["/warehouse/hubs/WH-KIN", ["Kinshasa"], "Warehouse hub detail", "wh-kin"],
  ["/warehouse/batches/BATCH-002", ["BATCH-002"], "Warehouse batch detail", "wh-kin"],
  ["/warehouse/reconciliation/REC-001", ["REC-001"], "Warehouse reconciliation", "wh-kin"],
  ["/warehouse/replacements/REP-001", ["REP-001"], "Warehouse replacement", "wh-kin"],
  ["/warehouse/parcels/PKG-001", ["PKG-001"], "Warehouse parcel detail", "wh-kin"],
];

const riderTests = [
  ["/rider/batches/BATCH-002", ["BATCH-002"], "Rider batch detail", "rider-1"],
  ["/rider/tasks/TSK-8841", ["TSK-8841"], "Rider task detail", "rider-1"],
];

const linkTests = [
  ["/admin/finance", "a[href*='/admin/finance/transactions/']", "TXN-901", "Admin finance row link", "admin-fin"],
  ["/admin/audit", "a[href*='/admin/audit/AUD-']", "AUD-001", "Admin audit card link", "admin-1"],
  ["/seller/finance/payouts/PAY-001", "a[href*='/seller/finance/transactions/']", "TXN-2024-001", "Seller payout linked txn", "seller-1"],
];

const allTests = [...shopTests, ...sellerTests, ...adminTests, ...warehouseTests, ...riderTests];

async function checkPage(page, path, expected, name, personaId) {
  const url = `${BASE}${path}`;
  try {
    if (personaId) await loginAs(page, personaId);
    await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
    await page.waitForTimeout(800);
    const text = await page.locator("body").innerText();
    const finalUrl = page.url();
    const redirectedToLogin = finalUrl.includes("/login");
    const error = /not found/i.test(text);
    const missing = expected.filter((s) => !text.includes(s));
    const pass = !redirectedToLogin && !error && missing.length === 0;
    return { name, path, pass, error, missing, url: finalUrl, redirectedToLogin };
  } catch (e) {
    return { name, path, pass: false, error: true, missing: expected, url, err: String(e) };
  }
}

async function checkLink(page, listPath, selector, expectedOnPage, name, personaId) {
  try {
    await loginAs(page, personaId);
    await page.goto(`${BASE}${listPath}`, { waitUntil: "networkidle", timeout: 25000 });
    const link = page.locator(selector).first();
    await link.waitFor({ timeout: 10000 });
    await link.click();
    await page.waitForTimeout(800);
    const text = await page.locator("body").innerText();
    const error = /not found/i.test(text);
    const pass = text.includes(expectedOnPage) && !error;
    return { name, path: listPath, pass, error, missing: pass ? [] : [expectedOnPage], url: page.url() };
  } catch (e) {
    return { name, path: listPath, pass: false, error: true, missing: [expectedOnPage], url: listPath, err: String(e) };
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const [path, expected, name, personaId] of allTests) {
  results.push(await checkPage(page, path, expected, name, personaId));
}

for (const args of linkTests) {
  results.push(await checkLink(page, ...args));
}

// Interactive flow: seller payout cancel
try {
  await loginAs(page, "seller-1");
  await page.goto(`${BASE}/seller/finance/payouts/PAY-002`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Cancel Request" }).click();
  await page.waitForTimeout(500);
  const text = await page.locator("body").innerText();
  results.push({
    name: "Seller payout cancel CTA",
    path: "/seller/finance/payouts/PAY-002",
    pass: text.includes("rejected") || text.includes("cancelled"),
    error: false,
    missing: [],
    url: page.url(),
  });
} catch (e) {
  results.push({ name: "Seller payout cancel CTA", path: "/seller/finance/payouts/PAY-002", pass: false, error: true, missing: ["cancel"], err: String(e) });
}

await browser.close();

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);

console.log(JSON.stringify({ passed, total: results.length, failedCount: failed.length, failed, results }, null, 2));
process.exit(failed.length > 0 ? 1 : 0);
