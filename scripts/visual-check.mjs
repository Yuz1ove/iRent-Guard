import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.TEST_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const errors = [];

async function pageWithConsole(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}

const tinyPng = "/tmp/irent-guard-upload.png";
fs.writeFileSync(
  tinyPng,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lVdP7wAAAABJRU5ErkJggg==",
    "base64"
  )
);

const routeChecks = [
  "/",
  "/client",
  "/demo/client",
  "/demo/company",
  "/client/return",
  "/client/return-result",
  "/company",
  "/company/return-review",
  "/company/ops-dashboard",
  "/company/customer-service",
  "/company/work-orders"
];

const desktop = await pageWithConsole({ width: 1440, height: 1000 });
await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });

for (const route of routeChecks) {
  await desktop.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await desktop.locator(".app-header").waitFor();
  const bodyText = await desktop.locator("body").innerText();
  if (!bodyText.includes("iRent Guard")) throw new Error(`Route ${route} did not render iRent Guard shell`);
}

const redirects = {
  "/return-review": "/company/return-review",
  "/ops-dashboard": "/company/ops-dashboard",
  "/customer-service": "/company/customer-service"
};
for (const [from, to] of Object.entries(redirects)) {
  await desktop.goto(`${baseUrl}${from}`, { waitUntil: "networkidle" });
  await desktop.waitForURL(`${baseUrl}${to}`);
}

await desktop.goto(baseUrl, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: /iRent Guard/ }).waitFor();
await desktop.getByRole("heading", { name: "建議展示順序" }).waitFor();
await desktop.getByRole("link", { name: /手機客戶端展示|進入手機展示入口/ }).first().waitFor();
await desktop.goto(`${baseUrl}/demo/client`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "客戶端還車模擬" }).waitFor();
await desktop.goto(`${baseUrl}/demo/company`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "公司後台監控中心" }).waitFor();
await desktop.goto(baseUrl, { waitUntil: "networkidle" });
await desktop.screenshot({ path: "output/playwright/home-1440.png", fullPage: true });

await desktop.goto(`${baseUrl}/client/return`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "確認車輛" }).waitFor();
await desktop.getByLabel("訂單編號").fill("RT-260629-FINAL");
await desktop.getByRole("button", { name: /下一步/ }).click();
await desktop.locator('input[type="file"]').first().setInputFiles(tinyPng);
await desktop.getByText(/AI 檢查中|照片角度已通過|通過/).first().waitFor();
await desktop.getByRole("button", { name: /返回/ }).click();
await desktop.locator('input[value="RT-260629-FINAL"]').waitFor();
await desktop.getByRole("button", { name: /下一步/ }).click();
await desktop.getByRole("button", { name: /下一步/ }).click();
await desktop.getByPlaceholder("例如：右側有刮傷，可能原本就有").fill("右側有刮傷，可能原本就有");
await desktop.getByRole("button", { name: "車況原本就有問題" }).click();
await desktop.getByRole("button", { name: /下一步/ }).click();
await desktop.getByText("建議您再拍攝右前方或右側車身").first().waitFor();
await desktop.getByText("請於備註中補充時間、位置或可辨識描述").first().waitFor();
const clientPrecheckText = await desktop.locator(".phone-workspace").innerText();
if (/租客責任|賠償|風險分數|派工優先序|工單成本/.test(clientPrecheckText)) {
  throw new Error("Client pre-check leaked forbidden company/internal wording");
}
await desktop.getByRole("button", { name: /下一步/ }).click();
await desktop.getByRole("button", { name: /送出還車紀錄/ }).click();
await desktop.waitForURL(`${baseUrl}/client/return-result`);
await desktop.getByRole("heading", { name: "還車紀錄已送出" }).waitFor();
const clientResultText = await desktop.locator("body").innerText();
if (/風險分數|派工優先序|工單成本|Evidence Timeline|Audit Trail|租客責任|賠償/.test(clientResultText)) {
  throw new Error("Client result leaked company-only details");
}
await desktop.screenshot({ path: "output/playwright/client-return-1440.png", fullPage: true });

await desktop.goto(`${baseUrl}/company/return-review`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "公司端單筆還車稽核工作台" }).waitFor();
await desktop.getByText(/AST-20260629-0001/).waitFor();
await desktop.getByText("RT-260629-FINAL", { exact: true }).first().waitFor();
await desktop.getByText("手機端最新送出").waitFor();
await desktop.getByRole("button", { name: /胎壓異常/ }).click();
await desktop.locator(".evidence-card strong", { hasText: "胎壓異常強制暫停" }).waitFor();
await desktop.getByText("車聯網訊號快照").waitFor();
await desktop.getByText("歷史工單摘要").first().waitFor();
await desktop.getByText("AI 規則判定").waitFor();
await desktop.getByRole("button", { name: /重新分析/ }).click();
await desktop.getByText(/已重新分析/).waitFor();
await desktop.getByRole("button", { name: /匯出 JSON/ }).click();
await desktop.getByRole("dialog", { name: "AI 判讀 JSON" }).waitFor();
const exportedJson = await desktop.locator(".json-modal pre").innerText();
for (const field of ["submission", "telematics", "bookingContext", "history", "assessment", "evidenceCards", "actions", "auditTrail"]) {
  if (!exportedJson.includes(`"${field}"`)) throw new Error(`Export JSON missing ${field}`);
}
await desktop.getByRole("button", { name: /複製 JSON/ }).click();
await desktop.getByText("已複製 JSON").waitFor();
await desktop.locator(".modal-actions").getByRole("button", { name: "關閉" }).click();
await desktop.screenshot({ path: "output/playwright/company-review-1440.png", fullPage: true });

await desktop.goto(`${baseUrl}/company/ops-dashboard`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "公司端營運儀表板" }).waitFor();
for (const filter of ["全部", "可出租", "有條件出租", "暫停出租", "強制下架", "待清潔", "待充電/加油", "待維修", "需人工覆核", "即將影響下一筆訂單"]) {
  await desktop.getByRole("button", { name: filter }).click();
}
for (const sort of ["風險分數", "下一筆訂單時間", "派工優先序", "AI 信心度"]) {
  await desktop.getByRole("button", { name: sort, exact: true }).click();
}
await desktop.locator(".vehicle-table tbody tr").first().click();
await desktop.getByText("為什麼排在前面").waitFor();
await desktop.getByRole("button", { name: "批次建立清潔任務" }).click();
await desktop.getByText("已建立清潔任務草稿").waitFor();
await desktop.getByRole("button", { name: "批次建立維修工單" }).click();
await desktop.getByText("已建立維修工單草稿").waitFor();
await desktop.getByRole("button", { name: "批次改派下一筆訂單" }).click();
await desktop.getByText("已送出下一筆訂單改派佇列").waitFor();
await desktop.getByRole("button", { name: /匯出今日 AI 判讀紀錄/ }).click();
await desktop.getByRole("dialog", { name: "AI 判讀 JSON" }).waitFor();
await desktop.locator(".modal-actions").getByRole("button", { name: "關閉" }).click();
await desktop.screenshot({ path: "output/playwright/ops-1280.png", fullPage: true });

await desktop.goto(`${baseUrl}/company/customer-service`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "公司端客服摘要工作台" }).waitFor();
await desktop.locator(".case-list button").nth(2).click();
const replyLocator = desktop.locator(".ai-reply-card > p");
const defaultReply = await replyLocator.innerText();
await desktop.getByRole("button", { name: /產生更委婉版本/ }).click();
await desktop.locator(".reply-mode", { hasText: "更委婉版本" }).waitFor();
const softReply = await replyLocator.innerText();
if (softReply === defaultReply) throw new Error("Soft customer reply did not change");
await desktop.getByRole("button", { name: /產生更簡短版本/ }).click();
const shortReply = await replyLocator.innerText();
if (shortReply.length >= softReply.length) throw new Error("Short customer reply is not shorter");
await desktop.getByRole("button", { name: /複製回覆/ }).click();
await desktop.getByText("已複製").waitFor();
await desktop.getByRole("button", { name: /標記需人工處理/ }).click();
await desktop.getByText("已標記人工").waitFor();
await desktop.getByRole("button", { name: /建立客服追蹤紀錄/ }).click();
await desktop.getByText("已建立追蹤").waitFor();
await desktop.screenshot({ path: "output/playwright/customer-service-1440.png", fullPage: true });

await desktop.goto(`${baseUrl}/company/work-orders`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "公司端工單派工" }).waitFor();
for (const status of ["待處理", "處理中", "已完成", "已取消"]) {
  await desktop.getByText(status).first().waitFor();
}
await desktop.getByRole("button", { name: "全部工單" }).click();
await desktop.getByText(/目前顯示 \d+ 筆/).waitFor();
await desktop.getByRole("button", { name: /批次建立維修工單/ }).click();
await desktop.getByText("已將待處理維修工單加入派工佇列").waitFor();
await desktop.screenshot({ path: "output/playwright/work-orders-1440.png", fullPage: true });

for (const [width, height, route, name] of [
  [1280, 900, "/company/return-review", "company-review-1280.png"],
  [1024, 900, "/company/ops-dashboard", "ops-1024.png"],
  [390, 900, "/client/return", "client-return-390.png"]
]) {
  const page = await pageWithConsole({ width, height });
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.locator(".app-header").waitFor();
  await page.screenshot({ path: `output/playwright/${name}`, fullPage: true });
  await page.close();
}

await browser.close();

if (errors.length > 0) {
  throw new Error(`Console errors:\n${errors.join("\n")}`);
}

console.log("visual and interaction checks passed");
