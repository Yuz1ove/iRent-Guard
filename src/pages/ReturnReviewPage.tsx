import React from "react";
import { Clipboard, Download, FileClock, ImagePlus, RefreshCcw, Save, Send } from "lucide-react";
import { enrichCompanyCase } from "../lib/assessmentEngine/enrichCompanyCase";
import { decisionLabels, minutesLabel } from "../lib/formatters";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { patchDemoCase } from "../lib/demoApi";
import type { ClientReturnSubmission } from "../types/client";
import type { CompanyReturnCase } from "../types/company";
import { ActionCard } from "../components/ActionCard";
import { EvidenceCard } from "../components/EvidenceCard";
import { JsonExportModal } from "../components/JsonExportModal";
import { RiskBreakdown } from "../components/RiskBreakdown";
import { RiskMeter } from "../components/RiskMeter";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";

export function ReturnReviewPage() {
  const { cases, latestCase, refreshLatestCase } = useSharedCompanyCases();
  const [selectedId, setSelectedId] = React.useState(cases[0].assessmentId);
  const autoSelectedLatestRef = React.useRef<string | null>(null);
  const baseCase = cases.find((item) => item.assessmentId === selectedId) ?? cases[0];
  const [draftSubmission, setDraftSubmission] = React.useState<ClientReturnSubmission>(baseCase.submission);
  const [photoUploaded, setPhotoUploaded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [analysisState, setAnalysisState] = React.useState<"idle" | "loading" | "complete">("idle");
  const [refreshing, setRefreshing] = React.useState(false);
  const [finalizeState, setFinalizeState] = React.useState<"idle" | "loading" | "complete">("idle");

  React.useEffect(() => {
    setDraftSubmission(baseCase.submission);
    setPhotoUploaded(false);
    setCopied(false);
    setToast("");
    setAnalysisState("idle");
    setFinalizeState("idle");
  }, [baseCase]);

  React.useEffect(() => {
    if (latestCase && autoSelectedLatestRef.current !== latestCase.assessmentId) {
      autoSelectedLatestRef.current = latestCase.assessmentId;
      setSelectedId(latestCase.assessmentId);
    }
  }, [latestCase]);

  const companyCase = React.useMemo<CompanyReturnCase>(() => {
    if (!photoUploaded && draftSubmission === baseCase.submission) return baseCase;
    const enriched = enrichCompanyCase({
      assessmentId: baseCase.assessmentId,
      scenarioName: baseCase.scenarioName,
      submission: draftSubmission,
      telematics: baseCase.telematics,
      bookingContext: baseCase.bookingContext,
      history: baseCase.history,
      workOrderHistory: baseCase.workOrderHistory,
      photoFindings: photoUploaded ? [...new Set([...baseCase.assessment.evidenceCards.filter((card) => card.type === "photo").map((card) => card.id), ...photoFindingsFromBase(baseCase)])] : photoFindingsFromBase(baseCase)
    });
    return enriched;
  }, [baseCase, draftSubmission, photoUploaded]);

  const assessment = companyCase.assessment;
  const exportJson = JSON.stringify({
    assessmentId: companyCase.assessmentId,
    submission: companyCase.submission,
    telematics: companyCase.telematics,
    bookingContext: companyCase.bookingContext,
    history: companyCase.history,
    workOrderHistory: companyCase.workOrderHistory,
    assessment,
    evidenceCards: assessment.evidenceCards,
    actions: assessment.recommendedActions,
    auditTrail: companyCase.auditTrail
  }, null, 2);

  function updateSubmission<K extends keyof ClientReturnSubmission>(key: K, value: ClientReturnSubmission[K]) {
    setDraftSubmission((current) => ({ ...current, [key]: value }));
  }

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    setPhotoUploaded(true);
    setToast("照片已納入公司端重新分析");
    window.setTimeout(() => setToast(""), 1600);
  }

  function reAnalyze() {
    setAnalysisState("loading");
    window.setTimeout(() => {
      setAnalysisState("complete");
      setToast(`已重新分析，風險分數 ${assessment.riskScore}`);
      window.setTimeout(() => setAnalysisState("idle"), 1800);
      window.setTimeout(() => setToast(""), 1600);
    }, 420);
  }

  async function copySummary() {
    try {
      await navigator.clipboard?.writeText(assessment.customerSummary);
    } catch {
      // Clipboard permission can be unavailable in preview browsers.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function finalizeDecision() {
    setFinalizeState("loading");
    if (companyCase.submission.submissionId.startsWith("CASE-")) {
      await patchDemoCase(companyCase.submission.submissionId, { status: "under_review" });
      await refreshLatestCase();
    }
    setFinalizeState("complete");
    setToast("已送出最終判定");
  }

  async function refreshCases() {
    setRefreshing(true);
    await refreshLatestCase();
    setRefreshing(false);
    setToast("案件資料已重新整理");
    window.setTimeout(() => setToast(""), 1500);
  }

  return (
    <main className="page review-page company-workbench">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Company return review</p>
          <h1>公司端單筆還車稽核工作台</h1>
        </div>
        <div className="title-actions">
          <button className={`secondary-button ${analysisState === "complete" ? "selected" : ""}`} disabled={analysisState === "loading"} onClick={reAnalyze} type="button">
            <RefreshCcw size={18} /> {analysisState === "loading" ? "分析中" : analysisState === "complete" ? "已重新分析" : "重新分析"}
          </button>
          <button className="secondary-button" disabled={refreshing} onClick={() => void refreshCases()} type="button">
            <RefreshCcw size={18} /> {refreshing ? "整理中" : "重新整理案件"}
          </button>
          <button className="primary-button" onClick={() => setJsonOpen(true)} type="button">
            <Download size={18} /> 匯出 JSON
          </button>
        </div>
      </div>

      <section className="case-overview-row">
        <div><span>Assessment ID</span><strong>{companyCase.assessmentId}</strong></div>
        <div><span>訂單編號</span><strong>{draftSubmission.orderId}</strong></div>
        <div><span>車號</span><strong>{draftSubmission.vehicleId}</strong></div>
        <div><span>還車站點</span><strong>{draftSubmission.returnStation}</strong></div>
        <div><span>下一筆訂單</span><strong>{minutesLabel(companyCase.bookingContext.nextBookingMinutes)}</strong></div>
        <div><span>AI 輔助稽核</span><StatusBadge status={assessment.status} /></div>
        <div><span>人工覆核</span><strong>{assessment.manualReviewRequired ? "需要" : "不需要"}</strong></div>
        <button className={finalizeState === "complete" ? "primary-button completed" : "primary-button"} disabled={finalizeState === "loading"} onClick={() => void finalizeDecision()} type="button">
          <Send size={18} /> {finalizeState === "loading" ? "送出中" : finalizeState === "complete" ? "已送出判定" : "送出最終判定"}
        </button>
      </section>

      <section className="scenario-tabs">
        {cases.map((item) => (
          <button aria-pressed={item.assessmentId === selectedId} className={item.assessmentId === selectedId ? "selected" : ""} key={item.assessmentId} onClick={() => setSelectedId(item.assessmentId)} type="button">
            <strong>{item.scenarioName}</strong>
            <span>{item.submission.vehicleId}</span>
          </button>
        ))}
      </section>

      <section className="company-review-layout">
        <aside className="input-console client-submission-panel">
          <div className="section-heading">
            <p className="eyebrow">Client submission</p>
            <h2>租客送出的還車資料</h2>
          </div>
          <label className="upload-zone compact">
            <input accept="image/*" onChange={handlePhoto} type="file" />
            <ImagePlus size={28} />
            <span>{photoUploaded ? "已新增還車照片" : "補充公司端照片證據"}</span>
          </label>
          <div className="client-photo-list">
            {draftSubmission.photos.map((photo) => (
              <div key={photo.id}>
                <strong>{photo.label}</strong>
                <span>{photo.status === "retake_required" ? "建議補拍" : photo.status === "missing" ? "未上傳" : "已上傳/通過"}</span>
              </div>
            ))}
          </div>
          <label>租客語音/文字備註<textarea rows={5} value={[draftSubmission.voiceNote, draftSubmission.textNote].filter(Boolean).join("\n")} onChange={(event) => updateSubmission("textNote", event.target.value)} /></label>
          <div className="detail-block">
            <h3>GPS / 站點資訊</h3>
            <p>{draftSubmission.returnStation}｜定位信心 {Math.round(companyCase.telematics.locationConfidence * 100)}%</p>
          </div>
          <div className="detail-block">
            <h3>歷史工單摘要</h3>
            <p>近期客訴 {companyCase.history.recentComplaints} 件，未結工單 {companyCase.history.unresolvedWorkOrders} 件{companyCase.history.repeatedDamageArea ? `，重複區域：${companyCase.history.repeatedDamageArea}` : ""}。</p>
          </div>
          <div className="detail-block">
            <h3>Audit Trail</h3>
            <ol className="audit-list">
              {companyCase.auditTrail.map((event) => <li key={event.id}><FileClock size={15} />{event.description}</li>)}
            </ol>
          </div>
        </aside>

        <section className="assessment-report">
          <div className="report-hero">
            <RiskMeter rawScore={assessment.riskBreakdown.formula?.rawScore} score={assessment.riskScore} size={156} />
            <div>
              <StatusBadge status={assessment.status} />
              <h2>{draftSubmission.vehicleId}｜{draftSubmission.vehicleModel}</h2>
              <p>{draftSubmission.returnStation}，下一筆訂單 {minutesLabel(companyCase.bookingContext.nextBookingMinutes)}</p>
              <div className="badge-row">
                <PriorityBadge priority={assessment.dispatchPriority} />
                <span className="badge neutral">{decisionLabels[assessment.nextBookingDecision]}</span>
                <span className={assessment.aiConfidence < 0.7 ? "badge warning" : "badge success"}>AI 信心 {Math.round(assessment.aiConfidence * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="report-grid">
            <section className="report-card">
              <h3>風險構成</h3>
              <RiskBreakdown breakdown={assessment.riskBreakdown} />
            </section>
            <section className="report-card">
              <h3>下一筆訂單決策</h3>
              <dl className="dispatch-list">
                <div><dt>決策</dt><dd>{decisionLabels[assessment.nextBookingDecision]}</dd></div>
                <div><dt>候補車輛</dt><dd>{companyCase.bookingContext.alternativeVehicleCount} 台</dd></div>
                <div><dt>人工覆核</dt><dd>{assessment.manualReviewRequired ? "需要" : "不需要"}</dd></div>
              </dl>
            </section>
          </div>

          <section className="report-card">
            <h3>證據鏈 Evidence Timeline</h3>
            <div className="evidence-grid">{assessment.evidenceCards.map((evidence) => <EvidenceCard evidence={evidence} key={evidence.id} />)}</div>
          </section>

          <section className="report-card">
            <h3>建議處置 Action Plan / 內部派工摘要</h3>
            <div className="actions-grid">{assessment.recommendedActions.map((action) => <ActionCard action={action} key={action.id} />)}</div>
          </section>

          <section className="report-card customer-summary">
            <div className="section-heading inline">
              <h3>客服摘要</h3>
              <button className="secondary-button" onClick={copySummary} type="button">
                <Clipboard size={17} /> {copied ? "已複製" : "複製摘要"}
              </button>
            </div>
            <p>{assessment.customerSummary}</p>
          </section>

          <section className="demo-strip">
            <Save size={18} />
            <span>{assessment.internalSummary}</span>
          </section>
        </section>
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
      {jsonOpen ? <JsonExportModal json={exportJson} onClose={() => setJsonOpen(false)} /> : null}
    </main>
  );
}

function photoFindingsFromBase(item: CompanyReturnCase) {
  return item.assessment.evidenceCards
    .filter((card) => card.type === "photo")
    .map((card) => {
      if (card.id === "scratch") return "scratch";
      if (card.id === "dent") return "dent";
      if (card.id === "bumper") return "bumper";
      if (card.id === "trash") return "trash";
      if (card.id === "spill") return "spill";
      return "";
    })
    .filter(Boolean);
}
