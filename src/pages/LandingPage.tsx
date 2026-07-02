import { ArrowRight, Building2, Car, ClipboardCheck, Headphones, Smartphone, Workflow } from "lucide-react";

const flow = [
  "租客還車 App",
  "ClientReturnSubmission",
  "AI Pre-check",
  "CompanyReturnCase",
  "Assessment Engine",
  "Ops / CS / Work Orders"
];

const demoSteps = [
  "客戶端送出還車紀錄",
  "公司端查看 AI 稽核結果",
  "營運儀表板查看車隊任務佇列",
  "客服摘要產生中立回覆",
  "工單頁查看派工結果"
];

export function LandingPage() {
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
          <p className="eyebrow">Data flow</p>
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
