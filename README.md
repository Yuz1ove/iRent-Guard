# iRent Guard｜AI 車況守護系統

2026 和泰 AI 黑客松作品原型。此方向對應企業挑戰「運用 AI 打造 iRent 智能車況管家：優化租還車體驗與營運效率」。

## 核心提案

共享車在高周轉租還車情境下，車況檢查、清潔派工、客服爭議與下一筆訂單銜接容易互相卡住。本作品把租客上傳照片、語音備註、車聯網訊號、歷史維修與客訴資料整合成 AI 風險分數，並自動產生處置建議。

## Prototype 範圍

- 首頁 `/`：作品價值、雙端展示入口、展示腳本
- 手機展示入口 `/demo/client`：引導進入 `/client/return`
- 公司展示入口 `/demo/company`：引導進入 `/company/return-review`
- 客戶端 `/client/return`、`/client/return-result`：租客還車、照片/備註、AI 補拍提醒、安心送出摘要
- 公司端 `/company/return-review`、`/company/ops-dashboard`、`/company/customer-service`、`/company/work-orders`：共享案件稽核、儀表板、客服摘要與工單
- 舊路由 `/return-review`、`/ops-dashboard`、`/customer-service` 會 redirect 到公司端新路由

## 初賽報名限制

- 每隊 2-5 人，不開放個人參賽
- 隊長須具備中華民國國籍
- 初賽報名與提案上傳截止：2026/10/14 13:00
- 早鳥團隊資料截止：2026/08/31 13:00

## 待補報名資料

- 隊名
- 隊長姓名、信箱、電話、身分別與國籍
- 2-5 位隊員基本資料
- 是否有未滿 18 歲隊員
- 指導老師資料，如有
- 初賽提案 PDF
- 3 分鐘方案說明影片連結

## 開發

```bash
npm install
npm run dev
```

`npm run dev` 已使用 `vite --host 0.0.0.0`，可支援同 Wi-Fi 手機測試。若要指定 port：

```bash
npm run dev -- --port 5299
```

## 雙裝置 Demo

1. 筆電與手機連同一個 Wi-Fi。
2. 筆電執行 `npm run dev`，看終端機顯示的 Network URL，或用 `ifconfig` 查筆電區網 IP。
3. 手機開 `http://電腦區網IP:5173/demo/client`。
4. 筆電開 `http://localhost:5173/demo/company`。
5. 手機進入 `/client/return`，輸入「右側有刮傷，可能原本就有」並送出。
6. 筆電公司端每 3 秒 polling `/api/demo/submissions/latest`，可在稽核、儀表板、客服摘要與工單頁看到同一筆 shared case。

## API 與 AI Key

本 demo 只允許前端呼叫本機後端 API，不允許在前端放置 API key。

- `POST /api/demo/submissions`
- `GET /api/demo/submissions/latest`
- `GET /api/demo/submissions/:id`
- `PATCH /api/demo/submissions/:id`
- `POST /api/demo/reset`
- `GET /api/ai/health`
- `POST /api/ai/return-precheck`
- `POST /api/ai/photo-evidence`
- `POST /api/customer/photo-inspection`
- `GET /api/support/cases/:caseId/photos`

設定方式請複製 `.env.example` 為 `.env.local`，正式 key 僅放在後端環境變數：

```bash
AI_PROVIDER=mock
AI_MODEL=
AI_TIMEOUT_MS=15000

# Formal customer photo inspection uses an OpenAI-compatible school relay.
SCHOOL_LLM_API_KEY=
SCHOOL_LLM_BASE_URL=
SCHOOL_LLM_MODEL=gpt-5.4

# Optional official OpenAI fallback. Only use an official sk-* key here.
OPENAI_API_KEY=
AI_PHOTO_EVIDENCE_MODEL=gpt-5.4
AI_PHOTO_INSPECTION_MODEL=gpt-5.4
```

沒有 API key 時會自動 fallback 到 mock pre-check / mock photo evidence；正式客戶照片檢核不會 fallback 成 pass，必須設定 `SCHOOL_LLM_API_KEY`、`SCHOOL_LLM_BASE_URL`、`SCHOOL_LLM_MODEL`，或使用官方 `sk-*` OpenAI key。`POST /api/customer/photo-inspection` 是客戶端拍照後的即時 AI 檢核；`GET /api/llm/health` 可檢查目前 LLM provider，但不會回傳 API key；`GET /api/support/cases/:caseId/photos` 讓客服端讀取已保存的照片與 AI bbox 結果。正式環境請使用 5 到 15 分鐘有效期的 HTTPS signed URL。

## 工程位置

- Mock AI scoring rule：`src/lib/mockAiEngine.ts`
- Mock return cases：`src/data/mockReturnCases.ts`
- Shared demo API：`server/demoStore.mjs`
- 共用型別：`src/types/assessment.ts`
- 頁面：`src/pages/`
