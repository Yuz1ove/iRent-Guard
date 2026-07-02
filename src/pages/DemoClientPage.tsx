import { ArrowRight, Smartphone } from "lucide-react";

export function DemoClientPage() {
  return (
    <main className="page client-page">
      <section className="client-hero">
        <div className="client-copy">
          <p className="eyebrow">Dual-device demo</p>
          <h1>客戶端還車模擬</h1>
          <p>請用手機開啟此頁，模擬租客完成照片、備註與 AI 補拍提醒；送出後公司端會讀到同一筆還車案件。</p>
          <a className="primary-button" href="/client/return">
            進入客戶端還車流程
            <ArrowRight size={18} />
          </a>
        </div>
        <div className="phone-shell" aria-label="手機客戶端展示">
          <div className="phone-status">iRent Guard</div>
          <div className="phone-card accent">
            <Smartphone size={20} />
            <div>
              <strong>手機客戶端展示</strong>
              <span>/client/return</span>
            </div>
          </div>
          <div className="phone-card">
            <span>送出後，筆電公司端每 3 秒同步最新案件。</span>
          </div>
        </div>
      </section>
    </main>
  );
}
