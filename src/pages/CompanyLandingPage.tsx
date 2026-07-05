import { ArrowRight, BatteryCharging, Brush, Car, ClipboardCheck, Clock3, Headphones, ShieldCheck, UserCheck, Wrench } from "lucide-react";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";

export function CompanyLandingPage() {
  const { cases } = useSharedCompanyCases();
  const kpis = [
    { label: "今日還車案件", value: cases.length, icon: Car },
    { label: "AI 輔助放行", value: cases.filter((item) => item.assessment.status === "rentable").length, icon: ShieldCheck },
    { label: "需清潔", value: countAction(cases, "cleaning"), icon: Brush },
    { label: "需補電/加油", value: countAction(cases, "charge_or_refuel"), icon: BatteryCharging },
    { label: "需維修", value: countAction(cases, "repair"), icon: Wrench },
    { label: "需人工覆核", value: cases.filter((item) => item.assessment.manualReviewRequired).length, icon: UserCheck }
  ];
  const urgentCount = cases.filter((item) => item.assessment.dispatchPriority === "high" || item.assessment.dispatchPriority === "critical").length;
  const nextBookingPressureCount = cases.filter((item) => item.bookingContext.nextBookingMinutes <= 60).length;

  return (
    <main className="page company-page">
      <section className="company-hero">
        <div className="company-hero-copy">
          <p className="eyebrow">公司端展示</p>
          <h1><span>iRent Guard</span><span>公司端車況稽核中心</span></h1>
          <p>整合還車照片、語音備註、車聯網訊號與歷史工單，提供公司端覆核建議、派工優先序與客服摘要。</p>
          <div className="hero-actions">
            <a className="primary-button" href="/company/return-review">
              進入還車稽核 <ClipboardCheck size={18} />
            </a>
            <a className="secondary-button" href="/company/ops-dashboard">
              查看營運儀表板 <ArrowRight size={18} />
            </a>
          </div>
        </div>
        <aside className="company-hero-panel" aria-label="今日處理重點">
          <span className="live-indicator">今日處理重點</span>
          <div>
            <Clock3 size={20} />
            <strong>{nextBookingPressureCount}</strong>
            <span>下一筆訂單 60 分鐘內</span>
          </div>
          <div>
            <UserCheck size={20} />
            <strong>{urgentCount}</strong>
            <span>高優先序待處理</span>
          </div>
          <div>
            <Headphones size={20} />
            <strong>{cases.filter((item) => item.assessment.riskBreakdown.dispute >= 8).length}</strong>
            <span>高爭議客服案件</span>
          </div>
        </aside>
      </section>

      <section className="kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className="kpi-card" key={kpi.label}>
              <Icon size={22} />
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="company-module-grid">
        <a href="/company/return-review"><ClipboardCheck size={22} /><strong>還車稽核</strong><span>單筆案件 evidence、風險構成、下一筆訂單決策。</span></a>
        <a href="/company/ops-dashboard"><Car size={22} /><strong>營運儀表板</strong><span>車隊任務佇列、批次操作與 detail panel。</span></a>
        <a href="/company/customer-service"><Headphones size={22} /><strong>客服摘要</strong><span>中立回覆、多版本話術與人工覆核標記。</span></a>
        <a href="/company/work-orders"><Wrench size={22} /><strong>工單派工</strong><span>由 AI recommended actions 轉成清潔、補能、維修工單。</span></a>
      </section>
    </main>
  );
}

function countAction(cases: ReturnType<typeof useSharedCompanyCases>["cases"], actionType: string) {
  return cases.filter((item) => item.assessment.recommendedActions.some((action) => action.actionType === actionType)).length;
}
