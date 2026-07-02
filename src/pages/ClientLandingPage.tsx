import { ArrowRight, Camera, CheckCircle2, MapPin, MessageSquareText, Smartphone } from "lucide-react";

const steps = [
  "確認車輛與還車站點",
  "拍攝車身與車內照片",
  "補充語音或文字備註",
  "AI 初步檢查是否需要補拍",
  "送出還車紀錄"
];

export function ClientLandingPage() {
  return (
    <main className="page client-page">
      <section className="client-hero">
        <div className="client-copy">
          <p className="eyebrow">Client side demo</p>
          <h1>iRent Guard 客戶端還車助手</h1>
          <p>還車時上傳照片與語音備註，AI 協助檢查車況並降低爭議。</p>
          <a className="primary-button" href="/client/return">
            開始還車檢查
            <ArrowRight size={18} />
          </a>
        </div>
        <div className="phone-shell" aria-label="iRent 還車 App 模擬畫面">
          <div className="phone-status">iRent</div>
          <div className="phone-card accent">
            <MapPin size={18} />
            <div>
              <strong>台南小西門站</strong>
              <span>IR-7712｜Toyota Altis</span>
            </div>
          </div>
          <div className="phone-photo-grid">
            <span><Camera size={20} />車頭</span>
            <span><Camera size={20} />右側</span>
            <span><Camera size={20} />車內</span>
            <span><Camera size={20} />儀表</span>
          </div>
          <div className="phone-card">
            <MessageSquareText size={18} />
            <span>可補充：右側有刮傷，可能原本就有</span>
          </div>
          <button className="phone-submit" type="button">送出還車紀錄</button>
        </div>
      </section>

      <section className="client-flow-panel">
        {steps.map((step, index) => (
          <article key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
            <CheckCircle2 size={18} />
          </article>
        ))}
      </section>
    </main>
  );
}
