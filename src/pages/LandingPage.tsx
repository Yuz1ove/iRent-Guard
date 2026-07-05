import React from "react";
import { ArrowRight, Building2, Car, ClipboardCheck, Headphones, Smartphone, Workflow } from "lucide-react";
import { fetchLlmHealth } from "../lib/demoApi";
import type { PublicLlmHealthSnapshot } from "../lib/demoApi";

const flow = [
  "租客還車應用",
  "客戶端還車資料",
  "AI 初步檢核",
  "公司端還車案件",
  "風險評估引擎",
  "營運、客服與工單"
];

const demoSteps = [
  "客戶端送出還車紀錄",
  "公司端查看 AI 稽核結果",
  "營運儀表板查看車隊任務佇列",
  "客服摘要產生中立回覆",
  "工單頁查看派工結果"
];

type AiMode = "formal" | "demo" | "fallback";

const riskSourcePreview = [
  "照片缺漏 +20",
  "損傷關鍵字 +25",
  "髒污標記 +15",
  "下一筆訂單壓力 +20",
  "客戶補充說明 -10"
];

const publicReasoningSummary = [
  "偵測輸入是否完整",
  "比對照片部位是否缺漏",
  "根據備註判斷是否可能有爭議",
  "產生公司端摘要與下一步建議"
];

export function LandingPage() {
  const [llmHealth, setLlmHealth] = React.useState<PublicLlmHealthSnapshot | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetchLlmHealth()
      .then((health) => {
        if (alive) setLlmHealth(health);
      })
      .catch(() => {
        if (alive) setLlmHealth(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const aiMode = resolveAiMode(llmHealth);
  const modeMeta = aiModeMetadata[aiMode];
  const aiCheckLabel = aiMode === "formal" ? "正式 AI 檢核" : aiMode === "fallback" ? "規則引擎 fallback" : "Demo 模擬檢核";

  return (
    <main className="page landing-page">
      <section className="hero-section brand-hero">
        <div className="hero-copy">
          <p className="eyebrow">2026 和泰 AI 黑客松｜iRent challenge</p>
          <h1>iRent Guard｜AI 車況守護系統</h1>
          <p className="hero-subtitle">從租客還車到公司派工，30 秒內完成車況稽核、下一筆訂單判斷與客服摘要。</p>
          <div className="hero-actions">
            <a className="primary-button" href="/demo/client">
              手機客戶端展示 <Smartphone size={18} />
            </a>
            <a className="secondary-button" href="/demo/company">
              公司後台展示 <Building2 size={18} />
            </a>
          </div>
        </div>
        <div className="hero-device-board" aria-label="雙端流程示意">
          <div className="mini-phone"><Smartphone size={32} /><strong>租客還車</strong><span>照片 / 備註 / 補拍提醒</span></div>
          <div className="mini-console"><Car size={32} /><strong>公司稽核</strong><span>風險 / 派工 / 客服摘要</span></div>
          <article className="architecture-flow-card">
            <div className="architecture-card-top">
              <Workflow size={24} />
              <span className={`ai-mode-badge ${aiMode}`}>{modeMeta.badge}</span>
            </div>
            <h2>運算架構與 LLM 推理流程</h2>
            <p className="architecture-subtitle">照片檢核 / 規則加權 / LLM 摘要 / 派工決策</p>
            <p>
              系統將客戶照片、備註、車況標記與下一筆訂單壓力整合，先由規則引擎完成可解釋風險加權，再交由 LLM 產生客服摘要與派工建議。若正式 AI provider 尚未設定，頁面會明確標示為 Demo 模擬，不會假裝成真實判定。
            </p>
            <div className="architecture-step-list">
              <section>
                <strong>Step 1 客戶端輸入</strong>
                <span>還車照片、文字 / 語音備註、車輛、時間與下一筆訂單資訊。</span>
              </section>
              <section>
                <strong>Step 2 AI / 規則檢核</strong>
                <span>{aiCheckLabel}：{modeMeta.description}</span>
              </section>
              <section>
                <strong>Step 3 風險分數生成</strong>
                <span>分數來源可解釋，Demo 模擬分數非正式判責結果。</span>
                <div className="risk-source-chips">
                  {riskSourcePreview.map((item) => <small key={item}>{item}</small>)}
                </div>
              </section>
              <section>
                <strong>Step 4 公司端輸出</strong>
                <span>風險等級、是否補拍、是否派工、客服摘要與下一筆訂單處理建議。</span>
              </section>
            </div>
            <div className="reasoning-summary">
              <strong>可公開的推理摘要</strong>
              <ul>
                {publicReasoningSummary.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <p className="architecture-note">Demo 分數僅用於展示流程；正式環境需保存照片、模型回傳、規則加權與人工覆核紀錄。</p>
          </article>
        </div>
      </section>

      <section className="demo-entry-grid">
        <article>
          <Smartphone size={28} />
          <h2>手機客戶端展示</h2>
          <p>模擬租客完成照片上傳、語音備註與 AI 補拍提醒。</p>
          <a className="primary-button" href="/demo/client">進入手機展示入口 <ArrowRight size={18} /></a>
        </article>
        <article>
          <Building2 size={28} />
          <h2>公司後台展示</h2>
          <p>模擬公司端接收還車資料後，進行 AI 風險評分、派工、客服與下一筆訂單決策。</p>
          <a className="secondary-button" href="/demo/company">進入公司展示入口 <ArrowRight size={18} /></a>
        </article>
      </section>

      <section className="panel-section demo-order-section">
        <div className="section-heading">
          <p className="eyebrow">Demo script</p>
          <h2>建議展示順序</h2>
        </div>
        <ol className="demo-order-list">
          {demoSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <p className="eyebrow">雙端同步</p>
          <h2>雙端資料流</h2>
        </div>
        <div className="flow-diagram">
          {flow.map((item, index) => (
            <div key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
              {index < flow.length - 1 ? <ArrowRight size={18} /> : <Workflow size={18} />}
            </div>
          ))}
        </div>
      </section>

      <section className="company-module-grid">
        <a href="/company/return-review"><ClipboardCheck size={22} /><strong>還車稽核</strong><span>單筆 evidence trail 與下一筆訂單決策。</span></a>
        <a href="/company/ops-dashboard"><Car size={22} /><strong>營運儀表板</strong><span>篩選、排序、批次派工與 detail panel。</span></a>
        <a href="/company/customer-service"><Headphones size={22} /><strong>客服摘要</strong><span>中立話術、多版本回覆與人工覆核。</span></a>
      </section>
    </main>
  );
}

const aiModeMetadata: Record<AiMode, { badge: string; description: string }> = {
  formal: {
    badge: "正式 AI 檢核中",
    description: "SCHOOL_LLM 或正式 provider 已可用，模型回傳會納入照片檢核與摘要。"
  },
  demo: {
    badge: "Demo 模擬推理",
    description: "尚未設定 SCHOOL_LLM_API_KEY、SCHOOL_LLM_BASE_URL、SCHOOL_LLM_MODEL，僅展示 Demo 流程。"
  },
  fallback: {
    badge: "規則引擎 fallback",
    description: "AI provider 設定不完整或暫時不可用，目前只採用可解釋規則引擎。"
  }
};

function resolveAiMode(health: PublicLlmHealthSnapshot | null): AiMode {
  if (!health) return "demo";
  if (health.available && health.status === "ok") return "formal";
  if (health.configurationState === "partial" || health.status === "unauthorized" || health.status === "error") return "fallback";
  return "demo";
}
