import { ArrowRight, Building2, RefreshCcw } from "lucide-react";

export function DemoCompanyPage() {
  return (
    <main className="page company-page">
      <section className="company-hero">
        <div>
          <p className="eyebrow">Dual-device demo</p>
          <h1>公司後台監控中心</h1>
          <p>請用筆電開啟此頁。手機端送出還車資料後，公司稽核、儀表板、客服摘要與工單頁會讀取同一筆 shared demo case。</p>
          <div className="hero-actions">
            <a className="primary-button" href="/company/return-review">
              進入公司端稽核工作台 <ArrowRight size={18} />
            </a>
            <a className="secondary-button" href="/company/ops-dashboard">
              查看營運儀表板 <Building2 size={18} />
            </a>
          </div>
        </div>
      </section>
      <section className="company-module-grid">
        <a href="/company/return-review"><RefreshCcw size={22} /><strong>同步最新案件</strong><span>公司端每 3 秒 polling shared demo store。</span></a>
        <a href="/company/customer-service"><Building2 size={22} /><strong>客服與工單共用</strong><span>客服摘要與工單頁讀取同一筆案件。</span></a>
      </section>
    </main>
  );
}
