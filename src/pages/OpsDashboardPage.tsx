import React from "react";
import { BatteryCharging, Brush, Car, Download, Filter, Search, ShieldCheck, UserCheck, Wrench, X } from "lucide-react";
import { submissionToReturnCase } from "../lib/assessmentEngine/enrichCompanyCase";
import { decisionLabels, minutesLabel } from "../lib/formatters";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { CaseAssessment, ReturnStatus } from "../types/assessment";
import type { CompanyReturnCase } from "../types/company";
import { EvidenceCard } from "../components/EvidenceCard";
import { RiskBreakdown } from "../components/RiskBreakdown";
import { RiskMeter } from "../components/RiskMeter";
import { JsonExportModal } from "../components/JsonExportModal";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";
import { VehicleTable } from "../components/VehicleTable";

type FilterKey = "all" | "rentable" | "conditional" | "hold" | "offline" | "clean" | "energy" | "repair" | "manual" | "next";
type SortKey = "risk" | "nextBooking" | "priority" | "confidence";

const filterLabels: Record<FilterKey, string> = {
  all: "全部",
  rentable: "可出租",
  conditional: "有條件出租",
  hold: "暫停出租",
  offline: "強制下架",
  clean: "待清潔",
  energy: "待充電/加油",
  repair: "待維修",
  manual: "需人工覆核",
  next: "即將影響下一筆訂單"
};

const sortLabels: Record<SortKey, string> = {
  risk: "風險分數",
  nextBooking: "下一筆訂單時間",
  priority: "派工優先序",
  confidence: "AI 信心度"
};

export function OpsDashboardPage() {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("risk");
  const [descending, setDescending] = React.useState(true);
  const [toast, setToast] = React.useState("");
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [lastBatchAction, setLastBatchAction] = React.useState("");
  const isCompact = useMediaQuery("(max-width: 920px)");
  const { cases, lastUpdatedAt } = useSharedCompanyCases();
  const assessments = React.useMemo(() => cases.map(toDashboardRow), [cases]);
  const filteredRows = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assessments
      .filter((row) => matchesFilter(row, filter))
      .filter((row) => matchesQuery(row, normalizedQuery))
      .sort((a, b) => sortRows(a, b, sortKey, descending));
  }, [assessments, descending, filter, query, sortKey]);

  const [selectedId, setSelectedId] = React.useState(filteredRows[0]?.returnCase.id ?? cases[0].assessmentId);
  React.useEffect(() => {
    if (filteredRows.length > 0 && !filteredRows.some((row) => row.returnCase.id === selectedId)) {
      setSelectedId(filteredRows[0].returnCase.id);
    }
  }, [filteredRows, selectedId]);

  const selected = filteredRows.find((row) => row.returnCase.id === selectedId) ?? filteredRows[0] ?? assessments[0];
  const selectedCompany = selected.companyCase;
  const kpis = buildKpis(assessments);
  const exportJson = JSON.stringify({
    exportedAt: new Date().toISOString(),
    cases: assessments.map((row) => ({
      assessmentId: row.companyCase.assessmentId,
      submission: row.companyCase.submission,
      telematics: row.companyCase.telematics,
      bookingContext: row.companyCase.bookingContext,
      history: row.companyCase.history,
      assessment: row.assessment,
      evidenceCards: row.assessment.evidenceCards,
      actions: row.assessment.recommendedActions,
      auditTrail: row.companyCase.auditTrail
    }))
  }, null, 2);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1700);
  }

  function handleBatchAction(action: string, message: string) {
    setLastBatchAction(action);
    showToast(message);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    if (isCompact) setDetailOpen(true);
  }

  React.useEffect(() => {
    if (!isCompact) setDetailOpen(false);
  }, [isCompact]);

  React.useEffect(() => {
    if (!isCompact || !detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailOpen, isCompact]);

  return (
    <main className="page ops-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Fleet command center</p>
          <h1>公司端營運儀表板</h1>
        </div>
        <span className="live-indicator">{lastUpdatedAt ? "Shared case synced" : "Mock AI engine online"}</span>
      </div>

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

      <section className="ops-layout">
        <div className="fleet-panel">
          <label className="dashboard-search">
            <Search size={18} />
            <span>搜尋案件</span>
            <input
              aria-label="搜尋車號、站點、場景或訂單"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋車號、站點、情境或訂單"
              value={query}
            />
          </label>
          <div className="filter-row">
            <Filter size={18} />
            {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <button className={filter === key ? "selected" : ""} key={key} onClick={() => setFilter(key)} type="button">
                {filterLabels[key]}
              </button>
            ))}
          </div>
          <div className="filter-row">
            <span>排序</span>
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <button className={sortKey === key ? "selected" : ""} key={key} onClick={() => setSortKey(key)} type="button">
                {sortLabels[key]}
              </button>
            ))}
          </div>
          <div className="batch-bar compact-actions">
            <button className={lastBatchAction === "clean" ? "secondary-button selected" : "secondary-button"} onClick={() => handleBatchAction("clean", "已建立清潔任務草稿")} type="button">批次建立清潔任務</button>
            <button className={lastBatchAction === "repair" ? "secondary-button selected" : "secondary-button"} onClick={() => handleBatchAction("repair", "已建立維修工單草稿")} type="button">批次建立維修工單</button>
            <button className={lastBatchAction === "reassign" ? "secondary-button selected" : "secondary-button"} onClick={() => handleBatchAction("reassign", "已送出下一筆訂單改派佇列")} type="button">批次改派下一筆訂單</button>
            <button className="primary-button" onClick={() => setJsonOpen(true)} type="button"><Download size={18} /> 匯出今日 AI 判讀紀錄</button>
          </div>
          <VehicleTable
            descending={descending}
            rows={filteredRows}
            selectedId={selected.returnCase.id}
            onSelect={handleSelect}
            onToggleSort={() => setDescending((value) => !value)}
          />
          {filteredRows.length === 0 ? (
            <div className="empty-state">
              <strong>找不到符合條件的案件</strong>
              <p>請調整搜尋字或篩選條件。</p>
            </div>
          ) : null}
        </div>

        <aside className="detail-panel">
          <OpsDetailContent selected={selected} selectedCompany={selectedCompany} onQueueAction={showToast} />
        </aside>
      </section>
      {isCompact ? (
        <>
          <button
            className="mobile-detail-fab"
            onClick={() => setDetailOpen(true)}
            type="button"
          >
            查看 {selected.returnCase.vehicleId} 詳情
          </button>
          {detailOpen ? (
            <div className="mobile-sheet-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setDetailOpen(false)}>
              <aside aria-label="案件詳情" aria-modal="true" className="mobile-detail-sheet" role="dialog">
                <div className="mobile-sheet-handle" aria-hidden="true" />
                <div className="mobile-sheet-title">
                  <strong>{selected.returnCase.vehicleId} 案件詳情</strong>
                  <button aria-label="關閉案件詳情" className="icon-button" onClick={() => setDetailOpen(false)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <OpsDetailContent selected={selected} selectedCompany={selectedCompany} onQueueAction={showToast} />
              </aside>
            </div>
          ) : null}
        </>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
      {jsonOpen ? <JsonExportModal json={exportJson} onClose={() => setJsonOpen(false)} /> : null}
    </main>
  );
}

type DashboardRow = CaseAssessment & { companyCase: CompanyReturnCase };

function matchesFilter(row: DashboardRow, filter: FilterKey) {
  const actionIds = row.assessment.recommendedActions.map((action) => action.id);
  const status: ReturnStatus = row.assessment.status;
  if (filter === "all") return true;
  if (filter === "rentable") return status === "rentable";
  if (filter === "conditional") return status === "conditional";
  if (filter === "hold") return status === "hold";
  if (filter === "offline") return status === "offline";
  if (filter === "clean") return actionIds.includes("clean");
  if (filter === "energy") return actionIds.includes("charge_refuel");
  if (filter === "repair") return actionIds.includes("create_work_order");
  if (filter === "manual") return row.assessment.manualReviewRequired;
  if (filter === "next") return row.assessment.recommendedActions.some((action) => action.blockingNextBooking);
  return true;
}

function matchesQuery(row: DashboardRow, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const searchable = [
    row.returnCase.vehicleId,
    row.returnCase.model,
    row.returnCase.location,
    row.returnCase.id,
    row.companyCase.scenarioName,
    row.companyCase.submission.orderId
  ];
  return searchable.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildKpis(rows: DashboardRow[]) {
  return [
    { label: "今日還車檢測數", value: rows.length, icon: Car },
    { label: "AI 輔助放行數", value: rows.filter((row) => row.assessment.status === "rentable").length, icon: ShieldCheck },
    { label: "需清潔車輛", value: rows.filter((row) => row.assessment.recommendedActions.some((action) => action.id === "clean")).length, icon: Brush },
    { label: "需充電/加油車輛", value: rows.filter((row) => row.assessment.recommendedActions.some((action) => action.id === "charge_refuel")).length, icon: BatteryCharging },
    { label: "需維修車輛", value: rows.filter((row) => row.assessment.recommendedActions.some((action) => action.id === "create_work_order")).length, icon: Wrench },
    { label: "需人工覆核", value: rows.filter((row) => row.assessment.manualReviewRequired).length, icon: UserCheck }
  ];
}

function toDashboardRow(companyCase: CompanyReturnCase): DashboardRow {
  return {
    companyCase,
    returnCase: submissionToReturnCase({
      assessmentId: companyCase.assessmentId,
      scenarioName: companyCase.scenarioName,
      submission: companyCase.submission,
      telematics: companyCase.telematics,
      bookingContext: companyCase.bookingContext,
      history: companyCase.history,
      photoFindings: []
    }),
    assessment: companyCase.assessment
  };
}

function sortRows(a: DashboardRow, b: DashboardRow, sortKey: SortKey, descending: boolean) {
  const priorityRank = { low: 1, medium: 2, high: 3, critical: 4 };
  const values = {
    risk: [a.assessment.riskScore, b.assessment.riskScore],
    nextBooking: [-a.returnCase.nextBookingMinutes, -b.returnCase.nextBookingMinutes],
    priority: [priorityRank[a.assessment.dispatchPriority], priorityRank[b.assessment.dispatchPriority]],
    confidence: [a.assessment.aiConfidence, b.assessment.aiConfidence]
  }[sortKey];
  return descending ? values[1] - values[0] : values[0] - values[1];
}

function OpsDetailContent({
  selected,
  selectedCompany,
  onQueueAction
}: {
  selected: DashboardRow;
  selectedCompany: CompanyReturnCase;
  onQueueAction: (message: string) => void;
}) {
  return (
    <>
      <div className="detail-top">
        <RiskMeter rawScore={selected.assessment.riskBreakdown.formula?.rawScore} score={selected.assessment.riskScore} label="車輛排序依據" />
        <div>
          <StatusBadge status={selected.assessment.status} />
          <h2>{selected.returnCase.vehicleId}</h2>
          <p>{selected.returnCase.location}</p>
          <PriorityBadge priority={selected.assessment.dispatchPriority} />
        </div>
      </div>
      <div className="detail-block">
        <h3>為什麼排在前面</h3>
        <RiskBreakdown breakdown={selected.assessment.riskBreakdown} />
      </div>
      <div className="detail-block">
        <h3>車聯網訊號</h3>
        <dl className="signal-list">
          <div>
            <dt>能源</dt>
            <dd>{selected.returnCase.telematics.batteryPercent ?? selected.returnCase.telematics.fuelPercent}%</dd>
          </div>
          <div>
            <dt>胎壓</dt>
            <dd>{selected.returnCase.telematics.tirePressureLow ? "異常" : "正常"}</dd>
          </div>
          <div>
            <dt>DTC</dt>
            <dd>{selected.returnCase.telematics.dtcWarning ? "有警示" : "正常"}</dd>
          </div>
          <div>
            <dt>定位信心</dt>
            <dd>{Math.round(selected.returnCase.telematics.locationConfidence * 100)}%</dd>
          </div>
        </dl>
      </div>
      <div className="detail-block">
        <h3>歷史工單摘要</h3>
        <p>
          近期客訴 {selectedCompany.history.recentComplaints} 件，未結工單{" "}
          {selectedCompany.history.unresolvedWorkOrders} 件
          {selectedCompany.history.repeatedDamageArea
            ? `，重複區域為 ${selectedCompany.history.repeatedDamageArea}`
            : "，無重複車損區域"}。
        </p>
      </div>
      <div className="detail-block">
        <h3>下一步建議</h3>
        <p>
          下一筆訂單 {minutesLabel(selected.returnCase.nextBookingMinutes)}，系統建議{" "}
          {decisionLabels[selected.assessment.nextBookingDecision]}。
        </p>
      </div>
      <div className="detail-block">
        <h3>AI 輔助稽核原因</h3>
        <div className="stacked-evidence">
          {selected.assessment.evidenceCards.slice(0, 3).map((evidence) => (
            <EvidenceCard evidence={evidence} key={evidence.id} />
          ))}
        </div>
      </div>
      <div className="detail-block">
        <h3>Audit Trail</h3>
        <ol className="audit-list">
          {selectedCompany.auditTrail.map((event) => <li key={event.id}>{event.description}</li>)}
        </ol>
      </div>
      <div className="detail-block">
        <h3>建議派工</h3>
        <div className="stacked-evidence">
          {selected.assessment.recommendedActions.map((action) => (
            <button
              className="action-card interactive-card"
              key={action.actionId}
              onClick={() => onQueueAction(`已建立 ${action.label} 草稿`)}
              type="button"
            >
              <Wrench size={17} />
              <div><strong>{action.label}</strong><p>{action.ownerRole}｜{action.estimatedMinutes} 分鐘</p></div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
