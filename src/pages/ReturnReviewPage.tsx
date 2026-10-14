import {CaseRecognitionPanel} from '../components/RecognitionWorkspace';
import React from "react";
import { AlertCircle, Clipboard, Clock3, Download, FileClock, ImagePlus, Loader2, RefreshCcw, Save, Send, ShieldCheck, UserCheck, Wrench } from "lucide-react";
import {
  appendManualReviewRecord,
  buildDemoKpis,
  buildNextBookingProtection,
  collectAiPhotoSignals,
  manualReviewOutcomeLabels,
  type ManualReviewOutcome,
  type ManualReviewRecord,
  type NextBookingProtectionDecision
} from "../lib/companyDemoInsights";
import { enrichCompanyCase } from "../lib/assessmentEngine/enrichCompanyCase";
import { decisionLabels, minutesLabel } from "../lib/formatters";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { fetchLlmHealth, inspectCustomerPhotos, patchDemoCase, recordDemoManualReview, reanalyzeDemoCase } from "../lib/demoApi";
import { compressImageForInspection, formatBytes } from "../lib/imageCompression";
import { photoAngleLabels, requiredPhotoAngles } from "../data/clientSubmissions";
import { AiProviderHealthCard } from "../components/AiProviderHealthCard";
import type { ClientPhoto, ClientPhotoAngle, ClientPhotoStatus, ClientReturnSubmission } from "../types/client";
import type { CompanyReturnCase } from "../types/company";
import type { ExpectedVehicleView, FinalPhotoInspectionResult, PublicLlmHealthSnapshot } from "../types/photoInspection";
import type { DetectedIssue, InspectionPhoto, VehicleInspectionStatus } from "../types/vehicleInspectionCase";
import { ActionCard } from "../components/ActionCard";
import { EvidenceCard } from "../components/EvidenceCard";
import { JsonExportModal } from "../components/JsonExportModal";
import { RiskBreakdown } from "../components/RiskBreakdown";
import { RiskMeter } from "../components/RiskMeter";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";

export function ReturnReviewPage() {
  const { cases, latestCase, remoteError, refreshLatestCase, updateInspectionCase, updateInspectionStatus, createWorkOrder, completeWorkOrder } = useSharedCompanyCases();
  const [selectedId, setSelectedId] = React.useState(() => {const id=new URLSearchParams(window.location.search).get("case");return cases.find(c=>c.submission.submissionId===id||c.assessmentId===id)?.assessmentId||cases[0].assessmentId;});
  const autoSelectedLatestRef = React.useRef<string | null>(null);
  const baseCase = cases.find((item) => item.assessmentId === selectedId) ?? cases[0];
  const [draftSubmission, setDraftSubmission] = React.useState<ClientReturnSubmission>(baseCase.submission);
  const [photoUploaded, setPhotoUploaded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [analysisState, setAnalysisState] = React.useState<"idle" | "loading" | "complete">("idle");
  const [supportPhotoAngle, setSupportPhotoAngle] = React.useState<ClientPhotoAngle>("right");
  const [supportPhotoState, setSupportPhotoState] = React.useState<"idle" | "compressing" | "checking" | "reanalyzing" | "complete" | "failed">("idle");
  const [supportPhotoError, setSupportPhotoError] = React.useState("");
  const supportPhotoLock = React.useRef(false);
  const supportPhotoBusy = ["compressing", "checking", "reanalyzing"].includes(supportPhotoState);
  const [refreshing, setRefreshing] = React.useState(false);
  const [finalizeState, setFinalizeState] = React.useState<"idle" | "loading" | "complete">("idle");
  const [manualReviewOutcome, setManualReviewOutcome] = React.useState<ManualReviewOutcome>("confirmed_scratch");
  const [manualReviewNote, setManualReviewNote] = React.useState("");
  const [manualReviewSaving, setManualReviewSaving] = React.useState(false);
  const [manualReviewRecords, setManualReviewRecords] = React.useState<Record<string, ManualReviewRecord>>({});
  const [llmHealth, setLlmHealth] = React.useState<PublicLlmHealthSnapshot | null>(null);
  const [llmHealthLoading, setLlmHealthLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLlmHealthLoading(true);
    fetchLlmHealth()
      .then((health) => {
        if (alive) setLlmHealth(health);
      })
      .catch(() => {
        if (alive) setLlmHealth(null);
      })
      .finally(() => {
        if (alive) setLlmHealthLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    setDraftSubmission(baseCase.submission);
    setPhotoUploaded(false);
    setCopied(false);
    setAnalysisState("idle");
    setSupportPhotoState("idle");
    setSupportPhotoError("");
    setFinalizeState("idle");
  }, [baseCase]);
  React.useEffect(() => setSaveError(""), [selectedId]);

  React.useEffect(() => {
    const requested=new URLSearchParams(window.location.search).get("case");
    const match=cases.find(c=>c.submission.submissionId===requested||c.assessmentId===requested);
    if(match){setSelectedId(match.assessmentId);return;}
    if (latestCase && autoSelectedLatestRef.current !== latestCase.assessmentId) {
      autoSelectedLatestRef.current = latestCase.assessmentId;
      setSelectedId(latestCase.assessmentId);
    }
  }, [latestCase,cases]);

  const baseCompanyCase = React.useMemo<CompanyReturnCase>(() => {
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

  const savedManualReviewRecord = manualReviewRecords[baseCompanyCase.assessmentId];
  const companyCase = React.useMemo<CompanyReturnCase>(() => {
    return savedManualReviewRecord ? appendManualReviewRecord(baseCompanyCase, savedManualReviewRecord) : baseCompanyCase;
  }, [baseCompanyCase, savedManualReviewRecord]);

  const assessment = companyCase.assessment;
  const photoSignals = React.useMemo(() => collectAiPhotoSignals(companyCase), [companyCase]);
  const nextBookingProtection = React.useMemo(() => buildNextBookingProtection(companyCase), [companyCase]);
  const demoKpis = React.useMemo(() => buildDemoKpis(cases), [cases]);
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

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || supportPhotoLock.current) return;
    supportPhotoLock.current = true;

    const supportId = `support-${supportPhotoAngle}-${Date.now()}`;
    const capturedAt = new Date().toISOString();
    setPhotoUploaded(true);
    setSupportPhotoState("compressing");
    setSupportPhotoError("");
    setToast("補充照片壓縮中");

    try {
      const compressed = await compressImageForInspection(file);
      const checkingPhoto: ClientPhoto = {
        id: supportId,
        angle: supportPhotoAngle,
        label: `${photoAngleLabels[supportPhotoAngle]}補充照片`,
        previewUrl: compressed.previewDataUrl,
        imageUrl: compressed.previewDataUrl,
        aiImageDataUrl: compressed.aiImageDataUrl,
        originalSizeBytes: compressed.originalSizeBytes,
        compressedSizeBytes: compressed.compressedSizeBytes,
        imageWidth: compressed.width,
        imageHeight: compressed.height,
        status: "checking",
        aiHint: "公司端 AI 檢核中。"
      };
      const checkingSubmission = upsertSupportPhoto(draftSubmission, checkingPhoto);
      setDraftSubmission(checkingSubmission);
      setSupportPhotoState("checking");
      setToast("補充照片 AI 檢核中");

      const result = await inspectCustomerPhotos({
        caseId: companyCase.submission.submissionId,
        rentalId: companyCase.submission.orderId,
        userId: "company-support",
        expectedVehicle: {
          plate: companyCase.submission.vehicleId,
          makeModel: companyCase.submission.vehicleModel,
          color: null
        },
        photos: [
          {
            id: supportId,
            imageUrl: compressed.aiImageDataUrl,
            expectedView: expectedViewForAngle(supportPhotoAngle),
            stage: "support_claim",
            capturedAt,
            note: `公司端補充照片：${photoAngleLabels[supportPhotoAngle]}`
          }
        ]
      });
      const aiPhoto = result.photos.find((photo) => photo.photo_id === supportId) ?? result.photos[0] ?? null;
      if (result.ai_meta.health) setLlmHealth(result.ai_meta.health);
      const completedPhoto: ClientPhoto = {
        ...checkingPhoto,
        status: companyPhotoStatusFromAi(result, aiPhoto),
        aiHint: aiPhoto?.support_message ?? result.final_decision.support_message,
        aiInspection: aiPhoto,
        aiInspectionRaw: result,
        lastCheckedAt: new Date().toISOString()
      };
      const completedSubmission = upsertSupportPhoto(checkingSubmission, completedPhoto);
      setDraftSubmission(completedSubmission);
      setSupportPhotoState("reanalyzing");
      setToast("AI 檢核完成，正在重算公司端 assessment");

      if (companyCase.submission.submissionId.startsWith("CASE-")) {
        const updatedCase = await reanalyzeDemoCase(companyCase.submission.submissionId, { submission: completedSubmission });
        setSelectedId(updatedCase.assessmentId);
        await refreshLatestCase();
        setPhotoUploaded(false);
        setSupportPhotoState("complete");
        setToast("補充照片已寫回 evidence，AI 重新分析完成");
      } else {
        setSupportPhotoState("complete");
        setToast("補充照片已完成 AI 檢核；靜態案例未寫回 demo store");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "補充照片檢核失敗，請重新上傳。";
      setSupportPhotoState("failed");
      setSupportPhotoError(message);
      setToast(message);
    } finally {
      supportPhotoLock.current = false;
      window.setTimeout(() => setToast(""), 2200);
    }
  }

  async function reAnalyze() {
    setAnalysisState("loading");
    try {
      if (companyCase.submission.submissionId.startsWith("CASE-")) {
        const updatedCase = await reanalyzeDemoCase(companyCase.submission.submissionId, { submission: draftSubmission });
        setSelectedId(updatedCase.assessmentId);
      }
      await refreshLatestCase();
      setAnalysisState("complete");
      setPhotoUploaded(false);
      setToast("AI 重新分析完成，assessment / evidence / actions 已更新");
    } catch {
      setToast("AI 重新分析失敗，請稍後再試");
    }
    window.setTimeout(() => setAnalysisState("idle"), 1800);
    window.setTimeout(() => setToast(""), 1600);
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
    if (finalizeState === "loading") return;
    setFinalizeState("loading");
    setSaveError("");
    let saved = false;
    try {
      if (companyCase.submission.submissionId.startsWith("CASE-")) {
        await patchDemoCase(companyCase.submission.submissionId, { status: "under_review" });
        saved = true;
        await refreshLatestCase();
        setToast("已送出最終判定");
      } else {
        saved = true;
        setToast("示範案件判定已更新於目前畫面");
      }
    } catch (error) {
      setToast("");
      setSaveError(`最終判定尚未保存，請重試。${error instanceof Error ? error.message : "服務連線失敗。"}`);
    } finally {
      setFinalizeState(saved ? "complete" : "idle");
    }
  }

  async function saveManualReview() {
    if (manualReviewSaving) return;
    const record: ManualReviewRecord = {
      outcome: manualReviewOutcome,
      note: manualReviewNote.trim() || "人工覆核結果已保存，供後續車況履歷與 AI 改善資料使用。",
      savedAt: new Date().toISOString()
    };
    setManualReviewSaving(true);
    setSaveError("");
    try {
      const isSavedCase = companyCase.submission.submissionId.startsWith("CASE-");
      if (isSavedCase) {
        await recordDemoManualReview(companyCase.submission.submissionId, record);
        setManualReviewRecords((current) => ({ ...current, [companyCase.assessmentId]: record }));
        await refreshLatestCase();
      } else if (companyCase.inspectionCase) {
        updateInspectionCase(companyCase.inspectionCase.caseId, (current) => ({
          ...current,
          inspectionStatus: record.outcome === "dispatch_required" ? "work_order_created" : record.outcome === "not_damage" ? "resolved" : "manual_review",
          reviewerDecision: manualReviewOutcomeLabels[record.outcome],
          updatedAt: record.savedAt,
          auditTrail: [
            ...current.auditTrail,
            {
              id: `${current.caseId}-manual-review-${record.savedAt}`,
              time: record.savedAt,
              actor: "ops",
              eventType: "manual_review_saved",
              description: `人工覆核結果已保存：${manualReviewOutcomeLabels[record.outcome]}。${record.note}`
            }
          ]
        }));
      }
      if (!isSavedCase) setManualReviewRecords((current) => ({ ...current, [companyCase.assessmentId]: record }));
      setToast(isSavedCase ? "人工覆核結果已寫入車況履歷" : "示範案件人工覆核已保存於本機 Demo");
    } catch (error) {
      setToast("");
      setSaveError(`人工覆核尚未保存，原紀錄未變更，請重試。${error instanceof Error ? error.message : "服務連線失敗。"}`);
    } finally {
      setManualReviewSaving(false);
      window.setTimeout(() => setToast(""), 1700);
    }
  }

  async function refreshCases() {
    setRefreshing(true);
    await refreshLatestCase();
    setRefreshing(false);
    setToast("案件資料已重新整理");
    window.setTimeout(() => setToast(""), 1500);
  }

  function handleInspectionAction(status: VehicleInspectionStatus) {
    const inspectionCase = companyCase.inspectionCase;
    if (!inspectionCase) {
      setToast("靜態舊版案例僅提供展示，請切換 Case A-D 共享案件操作。");
      window.setTimeout(() => setToast(""), 1800);
      return;
    }

    if (status === "work_order_created") {
      createWorkOrder(inspectionCase.caseId);
      setToast("已建立工單並同步客服、工單與營運儀表板");
    } else if (status === "resolved") {
      completeWorkOrder(inspectionCase.caseId, inspectionCase.workOrderId);
      setToast("案件已結案，車輛恢復可出租並寫入履歷");
    } else {
      const descriptions: Record<VehicleInspectionStatus, string> = {
        draft: "案件已更新為草稿。",
        analyzing: "案件已進入 AI 分析中。",
        needs_retake: "已要求使用者補拍，案件暫不進入責任判定。",
        submitted: "案件已送出公司端覆核。",
        auto_approved: "低風險案件已自動放行。",
        manual_review: "案件已轉人工覆核。",
        customer_contact: "已建立客服聯繫狀態。",
        work_order_created: "工單已建立。",
        resolved: "案件已結案。"
      };
      updateInspectionStatus(inspectionCase.caseId, status, "ops", descriptions[status]);
      setToast(descriptions[status]);
    }
    window.setTimeout(() => setToast(""), 2600);
  }

  const requestedPhotoCase = new URLSearchParams(window.location.search).get('case');
  if(requestedPhotoCase?.startsWith('INTEGRATED-'))return <main className="page review-page company-workbench"><div className="page-title-row"><div><p className="eyebrow">Company return review</p><h1>公司端照片覆核案件</h1><p>此案件由真實照片建立，尚未核對車輛或租賃身分。模型、人工修訂與來源分開保存。</p></div><a className="secondary-button" href="/company/return-review">返回營運案件</a></div><CaseRecognitionPanel caseId={requestedPhotoCase} returnTo={'/company/return-review?case='+encodeURIComponent(requestedPhotoCase)}/></main>;
  return (
    <main className="page review-page company-workbench">
      {remoteError&&<div role="alert" className="recognition-alert">{remoteError} 目前顯示的其他展示案件不能代替所要求的案件。</div>}
      {saveError&&<div role="alert" className="recognition-alert">{saveError}</div>}
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Company return review</p>
          <h1>公司端單筆還車稽核工作台</h1>
        </div>
        <div className="title-actions">
          <button className={`secondary-button ${analysisState === "complete" ? "selected" : ""}`} disabled={analysisState === "loading"} onClick={() => void reAnalyze()} type="button">
            <RefreshCcw size={18} /> {analysisState === "loading" ? "同步中" : analysisState === "complete" ? "已同步" : "同步 AI 結果"}
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

      <CaseRecognitionPanel caseId={companyCase.submission.submissionId} returnTo={"/company/return-review?case="+encodeURIComponent(companyCase.submission.submissionId)}/>

      <AiProviderHealthCard variant="company" health={llmHealth} loading={llmHealthLoading} />

      <section className="scenario-tabs">
        {cases.map((item) => (
          <button aria-pressed={item.assessmentId === selectedId} className={item.assessmentId === selectedId ? "selected" : ""} key={item.assessmentId} onClick={() => {setSelectedId(item.assessmentId);window.history.replaceState({},"","/company/return-review?case="+encodeURIComponent(item.submission.submissionId));}} type="button">
            <strong>{item.scenarioName}</strong>
            <span>{item.submission.vehicleId}</span>
          </button>
        ))}
      </section>

      <section aria-label="Demo 模擬指標" className="kpi-grid demo-kpi-grid">
        {demoKpis.map((kpi) => (
          <article className="kpi-card" key={kpi.label}>
            <ShieldCheck size={21} />
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.detail}</small>
          </article>
        ))}
      </section>

      <section className="company-review-layout">
        <aside className="input-console client-submission-panel">
          <div className="section-heading">
            <p className="eyebrow">Client submission</p>
            <h2>租客送出的還車資料</h2>
          </div>
          <p role="status">{supportUploadLabel(supportPhotoState, photoUploaded)}</p>
          <div className="photo-source-actions">
            <label className="secondary-button" aria-disabled={supportPhotoBusy}>
              <ImagePlus size={18} />拍照
              <input accept="image/*" capture="environment" disabled={supportPhotoBusy} aria-label="拍照補充公司端證據" onChange={(event) => void handlePhoto(event)} type="file" />
            </label>
            <label className="secondary-button" aria-disabled={supportPhotoBusy}>
              <ImagePlus size={18} />從相簿選取
              <input accept="image/*" disabled={supportPhotoBusy} aria-label="從相簿選取公司端證據" onChange={(event) => void handlePhoto(event)} type="file" />
            </label>
          </div>
          <label>
            補充照片角度
            <select value={supportPhotoAngle} onChange={(event) => setSupportPhotoAngle(event.target.value as ClientPhotoAngle)}>
              {requiredPhotoAngles.map((angle) => (
                <option key={angle} value={angle}>{photoAngleLabels[angle]}</option>
              ))}
            </select>
          </label>
          {supportPhotoError ? (
            <div className="inline-notice warning">
              <AlertCircle size={17} />
              <p>{supportPhotoError}</p>
            </div>
          ) : null}
          <div className="client-photo-list">
            {draftSubmission.photos.map((photo) => (
              <div key={photo.id}>
                {photo.previewUrl || photo.imageUrl ? <img className="company-photo-preview" alt={photo.label} src={photo.previewUrl ?? photo.imageUrl} /> : null}
                <div className="company-photo-row-heading">
                  <strong>{photo.label}</strong>
                  <span>{photoStatusLabel(photo.status)}</span>
                  <small>{photo.originalSizeBytes || photo.compressedSizeBytes ? `${formatBytes(photo.originalSizeBytes)} -> ${formatBytes(photo.compressedSizeBytes)}` : ""}</small>
                </div>
                <CompanyPhotoAiDetail photo={photo} />
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

          <NextBookingProtectionCard protection={nextBookingProtection} nextBookingMinutes={companyCase.bookingContext.nextBookingMinutes} />

          {companyCase.inspectionCase ? (
            <>
              <InspectionActionPanel companyCase={companyCase} onAction={handleInspectionAction} />
              <PhotoComparisonPanel companyCase={companyCase} />
              <AiExplainabilityPanel companyCase={companyCase} />
              <VehicleHistoryPanel companyCase={companyCase} />
            </>
          ) : null}

          <section className="report-card ai-decision-card">
            <div className="section-heading inline">
              <div>
                <p className="eyebrow">AI uncertainty</p>
                <h3>AI 決策層級與人工覆核原因</h3>
              </div>
              <span className={`badge ${aiStatusTone(photoSignals.status)}`}>{aiStatusLabel(photoSignals.status)}</span>
            </div>
            <dl className="dispatch-list">
              <div><dt>三層決策</dt><dd>{aiStatusDescription(photoSignals.status)}</dd></div>
              <div><dt>人工覆核</dt><dd>{photoSignals.manualReviewReasons.length > 0 ? "需要" : "未觸發"}</dd></div>
              <div><dt>敏感資訊</dt><dd>{photoSignals.hasSensitive ? "建議遮罩後保存" : "未標記"}</dd></div>
            </dl>
            {photoSignals.manualReviewReasons.length > 0 ? (
              <ul className="reason-list">
                {photoSignals.manualReviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : (
              <p>照片品質足夠且未見需人工覆核的車況訊號。</p>
            )}
          </section>

          <section className="report-card">
            <h3>證據鏈 Evidence Timeline</h3>
            <div className="evidence-grid">{assessment.evidenceCards.map((evidence) => <EvidenceCard evidence={evidence} key={evidence.id} />)}</div>
          </section>

          <section className="report-card manual-review-card">
            <div className="section-heading inline">
              <div>
                <p className="eyebrow">Human-in-the-loop</p>
                <h3>人工覆核與車況履歷閉環</h3>
              </div>
              <UserCheck size={22} />
            </div>
            <div className="manual-review-form">
              <label>
                覆核結果
                <select value={manualReviewOutcome} onChange={(event) => setManualReviewOutcome(event.target.value as ManualReviewOutcome)}>
                  {(Object.keys(manualReviewOutcomeLabels) as ManualReviewOutcome[]).map((outcome) => (
                    <option key={outcome} value={outcome}>{manualReviewOutcomeLabels[outcome]}</option>
                  ))}
                </select>
              </label>
              <label>
                補充說明
                <textarea rows={3} value={manualReviewNote} onChange={(event) => setManualReviewNote(event.target.value)} placeholder="例如：右側痕跡判定為反光，或需派清潔/維修工單。" />
              </label>
              <button className="primary-button" disabled={manualReviewSaving} onClick={() => void saveManualReview()} type="button">
                <Save size={18} /> {manualReviewSaving ? "寫入中" : "寫入車況履歷"}
              </button>
            </div>
            <p className="client-note">此結果作為 Demo 資料閉環，保留給未來 AI 改善與車況履歷比對，不直接判定顧客責任。</p>
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

function CompanyPhotoAiDetail({ photo }: { photo: ClientPhoto }) {
  const ai = photo.aiInspection;
  if (!ai) return null;
  if (isAiUnavailableResult(photo.aiInspectionRaw)) {
    return (
      <div className="company-photo-ai-card unavailable">
        <p className="ai-warning">AI provider unavailable，案件已轉人工覆核，不產生正式 AI 判定。</p>
        <dl className="company-photo-ai-detail">
          <div><dt>provider</dt><dd>{photo.aiInspectionRaw?.ai_meta.provider ?? photo.aiInspectionRaw?.ai_meta.source ?? "unknown"}</dd></div>
          <div><dt>model</dt><dd>{photo.aiInspectionRaw?.ai_meta.model ?? "-"}</dd></div>
          <div><dt>formal_result</dt><dd>no</dd></div>
          <div className="wide"><dt>unavailable_reason</dt><dd>{photo.aiInspectionRaw?.ai_meta.unavailableReason ?? photo.aiInspectionRaw?.staffSummary ?? ai.support_message}</dd></div>
        </dl>
      </div>
    );
  }
  const demoReplay = isDemoReplayResult(photo.aiInspectionRaw);
  const issues = ai.issues ?? [];
  const hasSensitive = ai.flags.includes("sensitive_content_visible");

  return (
    <div className="company-photo-ai-card">
      {demoReplay ? <p className="ai-warning">Demo 範例資料，非正式 AI 判定。</p> : null}
      <dl className="company-photo-ai-detail">
        <div><dt>expected_view</dt><dd>{viewLabel(ai.expected_view)}</dd></div>
        <div><dt>detected_view</dt><dd>{viewLabel(ai.detected_view)}</dd></div>
        <div><dt>expected_view_match</dt><dd>{matchLabel(ai.expected_view_match)}</dd></div>
        <div><dt>confidence</dt><dd>{Math.round(ai.view_confidence * 100)}%</dd></div>
        <div><dt>flags</dt><dd>{ai.flags.length > 0 ? ai.flags.join(", ") : "-"}</dd></div>
        <div><dt>cleanliness</dt><dd>{levelLabel(ai.cleanliness.level)}｜{Math.round(ai.cleanliness.confidence * 100)}%</dd></div>
        <div><dt>damage</dt><dd>{levelLabel(ai.damage.level)}｜{Math.round(ai.damage.confidence * 100)}%</dd></div>
        <div><dt>retake</dt><dd>{ai.retake_required ? "需要" : "不需要"}</dd></div>
        <div className="wide"><dt>cleanliness_summary</dt><dd>{ai.cleanliness.summary}</dd></div>
        <div className="wide"><dt>damage_summary</dt><dd>{ai.damage.summary}</dd></div>
        <div className="wide"><dt>support_message</dt><dd>{ai.support_message}</dd></div>
      </dl>
      {hasSensitive ? <p className="ai-warning">AI flags 包含 sensitive_content_visible，建議遮罩後保存。</p> : null}
      <div className="ai-issues-block">
        <strong>issues</strong>
        {issues.length > 0 ? (
          <ul className="ai-issues-list">
            {issues.map((issue) => (
              <li key={issue.issue_id}>
                <span>{issueKindLabel(issue.issue_kind)}｜{issue.vehicle_area}｜{Math.round(issue.confidence * 100)}%</span>
                <p>{issue.visual_evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>無結構化 issue。</p>
        )}
      </div>
    </div>
  );
}

function upsertSupportPhoto(submission: ClientReturnSubmission, photo: ClientPhoto): ClientReturnSubmission {
  const existing = submission.photos.filter((item) => item.id !== photo.id);
  return {
    ...submission,
    photos: [photo, ...existing]
  };
}

function companyPhotoStatusFromAi(result: FinalPhotoInspectionResult, aiPhoto: FinalPhotoInspectionResult["photos"][number] | null): ClientPhotoStatus {
  if (isAiUnavailableResult(result)) return "ai_unavailable";
  if (isDemoReplayResult(result)) return "demo_replay";
  if (!isRealAiResult(result) || !aiPhoto) return "needs_manual_review";
  if (aiPhoto.retake_required || result.final_decision.status === "needs_retake") return "retake_required";
  if (aiPhoto.flags.includes("manual_review_recommended") || result.final_decision.status === "manual_review") return "manual_review";
  return "passed";
}

function isRealAiResult(result: FinalPhotoInspectionResult | null | undefined) {
  const source = result?.ai_meta?.source;
  const responseId = result?.ai_meta?.responseId;
  return (source === "school-relay" || source === "openai" || source === "local-detector") && typeof responseId === "string" && responseId.length > 0;
}

function isAiUnavailableResult(result: FinalPhotoInspectionResult | null | undefined) {
  return result?.ai_meta?.resultKind === "ai_unavailable";
}

function isDemoReplayResult(result: FinalPhotoInspectionResult | null | undefined) {
  return result?.ai_meta?.resultKind === "demo_replay" || result?.ai_meta?.source === "demo_replay";
}

function expectedViewForAngle(angle: ClientPhotoAngle): ExpectedVehicleView {
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  if (angle === "left") return "left_side";
  if (angle === "right") return "right_side";
  if (angle === "interior") return "interior";
  if (angle === "dashboard") return "dashboard";
  return "any";
}

function supportUploadLabel(state: "idle" | "compressing" | "checking" | "reanalyzing" | "complete" | "failed", uploaded: boolean) {
  if (state === "compressing") return "補充照片壓縮中";
  if (state === "checking") return "補充照片 AI 檢核中";
  if (state === "reanalyzing") return "公司端重新分析中";
  if (state === "complete") return "補充照片已寫回 AI evidence";
  if (state === "failed") return "補充照片檢核失敗，請重試";
  return uploaded ? "已新增還車照片" : "補充公司端照片證據";
}

function NextBookingProtectionCard({
  protection,
  nextBookingMinutes
}: {
  protection: ReturnType<typeof buildNextBookingProtection>;
  nextBookingMinutes: number;
}) {
  return (
    <section className="report-card next-booking-protection-card">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">Next booking guard</p>
          <h3>下一筆訂單保護</h3>
        </div>
        <span className={`badge ${protectionTone(protection.decision)}`}>
          <Clock3 size={15} /> {protectionDecisionLabel(protection.decision)}
        </span>
      </div>
      <dl className="dispatch-list">
        <div><dt>剩餘時間</dt><dd>{minutesLabel(nextBookingMinutes)}</dd></div>
        <div><dt>目前 AI 檢核狀態</dt><dd>{aiStatusLabel(protection.aiStatus)}</dd></div>
        <div><dt>建議</dt><dd>{protectionDecisionLabel(protection.decision)}</dd></div>
        <div><dt>理由</dt><dd>{protection.reason}</dd></div>
        <div><dt>建議處置</dt><dd>{protection.action}</dd></div>
      </dl>
    </section>
  );
}

function InspectionActionPanel({
  companyCase,
  onAction
}: {
  companyCase: CompanyReturnCase;
  onAction: (status: VehicleInspectionStatus) => void;
}) {
  const inspectionCase = companyCase.inspectionCase;
  if (!inspectionCase) return null;
  const actions: Array<{ status: VehicleInspectionStatus; label: string; icon: React.ReactNode }> = [
    { status: "auto_approved", label: "自動放行", icon: <ShieldCheck size={17} /> },
    { status: "needs_retake", label: "要求補拍", icon: <ImagePlus size={17} /> },
    { status: "manual_review", label: "人工覆核", icon: <UserCheck size={17} /> },
    { status: "customer_contact", label: "聯絡使用者", icon: <Clipboard size={17} /> },
    { status: "work_order_created", label: "建立工單", icon: <Wrench size={17} /> },
    { status: "resolved", label: "結案/恢復出租", icon: <Save size={17} /> }
  ];

  return (
    <section className="report-card inspection-action-panel">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">Case operations</p>
          <h3>處理動作</h3>
        </div>
        <span className={`badge ${inspectionCase.vehicleRentable ? "success" : "hold"}`}>{inspectionCase.vehicleRentable ? "車輛可出租" : "暫停出租"}</span>
      </div>
      <div className="inspection-action-grid">
        {actions.map((action) => (
          <button
            className={inspectionCase.inspectionStatus === action.status ? "secondary-button selected" : "secondary-button"}
            key={action.status}
            onClick={() => onAction(action.status)}
            type="button"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <p className="client-note">每個操作會更新共享案件、寫入 audit trail，並同步客服、工單與營運儀表板。</p>
    </section>
  );
}

function PhotoComparisonPanel({ companyCase }: { companyCase: CompanyReturnCase }) {
  const inspectionCase = companyCase.inspectionCase;
  if (!inspectionCase) return null;
  const selectedAngles = buildComparisonAngles(inspectionCase.detectedIssues);

  return (
    <section className="report-card photo-comparison-card">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">Before / after evidence</p>
          <h3>取車前／還車後照片比對</h3>
        </div>
        <span className="badge neutral">相同角度比對</span>
      </div>
      <div className="comparison-grid">
        {selectedAngles.map((angle) => {
          const pickup = inspectionCase.pickupPhotos.find((photo) => photo.angle === angle);
          const returned = inspectionCase.returnPhotos.find((photo) => photo.angle === angle);
          const issue = inspectionCase.detectedIssues.find((item) => item.evidencePhotoIds.includes(returned?.id ?? "") || item.evidencePhotoIds.includes(pickup?.id ?? ""));
          return (
            <article className="comparison-pair" key={angle}>
              <header>
                <strong>{photoAngleLabels[angle]}</strong>
                <span>{issue ? issueLabel(issue) : "無明顯差異"}</span>
              </header>
              <div className="comparison-images">
                <EvidenceImage title="取車前" photo={pickup} issue={issue} />
                <EvidenceImage title="還車後" photo={returned} issue={issue} />
              </div>
              {issue ? (
                <dl className="issue-detail-list">
                  <div><dt>異常位置</dt><dd>{issue.location}</dd></div>
                  <div><dt>模型信心</dt><dd>{Math.round(issue.confidence * 100)}%</dd></div>
                  <div><dt>取車前是否存在</dt><dd>{issue.existedBefore === true ? "已存在" : issue.existedBefore === false ? "未發現" : "無法判斷"}</dd></div>
                  <div className="wide"><dt>限制</dt><dd>{companyCase.inspectionCase?.uncertaintySummary}</dd></div>
                </dl>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceImage({
  title,
  photo,
  issue
}: {
  title: string;
  photo?: InspectionPhoto;
  issue?: DetectedIssue;
}) {
  if (!photo) {
    return (
      <div className="comparison-image-shell empty">
        <strong>{title}</strong>
        <span>無照片</span>
      </div>
    );
  }
  const markerIssue = issue?.evidencePhotoIds.includes(photo.id) && issue.bbox ? issue : null;
  return (
    <div className="comparison-image-shell">
      <strong>{title}</strong>
      <div className="comparison-image-frame">
        <img alt={photo.label} src={photo.imageUrl} />
        {markerIssue ? (
          <span
            className={markerIssue.existedBefore ? "bbox-marker existing" : "bbox-marker new"}
            style={{
              left: `${(markerIssue.bbox?.x ?? 0) * 100}%`,
              top: `${(markerIssue.bbox?.y ?? 0) * 100}%`,
              width: `${(markerIssue.bbox?.w ?? 0) * 100}%`,
              height: `${(markerIssue.bbox?.h ?? 0) * 100}%`
            }}
          />
        ) : null}
      </div>
      <small>{formatPhotoTime(photo.capturedAt)}｜{photo.source === "pickup_record" ? "取車基準" : "使用者上傳"}</small>
    </div>
  );
}

function AiExplainabilityPanel({ companyCase }: { companyCase: CompanyReturnCase }) {
  const inspectionCase = companyCase.inspectionCase;
  if (!inspectionCase) return null;
  const primaryIssue = inspectionCase.detectedIssues[0];
  return (
    <section className="report-card ai-explainability-panel">
      <div className="section-heading">
        <p className="eyebrow">AI explainability</p>
        <h3>AI 判定拆解</h3>
      </div>
      <div className="explainability-grid">
        <article>
          <strong>判斷結果</strong>
          <p>{primaryIssue ? issueLabel(primaryIssue) : "無明顯異常"}</p>
        </article>
        <article>
          <strong>判斷依據</strong>
          <p>{inspectionCase.aiReasoningSummary}</p>
        </article>
        <article>
          <strong>不確定因素</strong>
          <p>{inspectionCase.uncertaintySummary}</p>
        </article>
        <article>
          <strong>建議處理</strong>
          <p>{inspectionCase.recommendedAction}</p>
        </article>
      </div>
      <p className="client-note">AI 分析結果僅提供車況檢核與營運決策輔助；最終責任認定仍由授權人員依完整照片、訂單紀錄與人工覆核結果決定。</p>
    </section>
  );
}

function VehicleHistoryPanel({ companyCase }: { companyCase: CompanyReturnCase }) {
  const inspectionCase = companyCase.inspectionCase;
  if (!inspectionCase) return null;
  return (
    <section className="report-card vehicle-history-panel">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">Vehicle condition history</p>
          <h3>車況履歷與下一筆訂單影響</h3>
        </div>
        <span className={`badge ${inspectionCase.nextBookingImpact.highPriorityAlert ? "danger" : "success"}`}>
          {inspectionCase.nextBookingImpact.highPriorityAlert ? "高優先警示" : "無逾時警示"}
        </span>
      </div>
      <dl className="dispatch-list">
        <div><dt>下一筆預約</dt><dd>{inspectionCase.nextBookingImpact.minutesUntilNextBooking} 分鐘後</dd></div>
        <div><dt>目前車況</dt><dd>{inspectionCase.nextBookingImpact.currentCondition}</dd></div>
        <div><dt>預估處理時間</dt><dd>{inspectionCase.nextBookingImpact.estimatedHandlingMinutes} 分鐘</dd></div>
        <div><dt>系統建議</dt><dd>{inspectionCase.nextBookingImpact.recommendation}</dd></div>
      </dl>
      <ol className="vehicle-history-list">
        {inspectionCase.vehicleConditionHistory.map((item) => (
          <li key={item.id}>
            <strong>{item.date}｜{item.title}</strong>
            <span>{item.status}</span>
            <p>{item.handling}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildComparisonAngles(issues: DetectedIssue[]) {
  const issueAngles = new Set<ClientPhotoAngle>();
  for (const issue of issues) {
    for (const photoId of issue.evidencePhotoIds) {
      if (photoId.includes("-right")) issueAngles.add("right");
      if (photoId.includes("-rear")) issueAngles.add("rear");
      if (photoId.includes("-left")) issueAngles.add("left");
      if (photoId.includes("-front")) issueAngles.add("front");
      if (photoId.includes("-interior")) issueAngles.add("interior");
    }
  }
  return issueAngles.size > 0 ? [...issueAngles] : (["front", "rear", "left", "right"] as ClientPhotoAngle[]);
}

function issueLabel(issue: DetectedIssue) {
  if (issue.type === "photo_quality") return "照片品質不足";
  if (issue.existedBefore === true) return "既有損傷";
  if (issue.existedBefore === false) return "疑似新增損傷";
  return "需人工確認";
}

function formatPhotoTime(value: string) {
  return new Date(value).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function photoFindingsFromBase(item: CompanyReturnCase) {
  const evidenceFindings = item.assessment.evidenceCards
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
  const aiFindings = item.submission.photos.flatMap((photo) => photoFindingsFromAiPhoto(photo));
  return [...new Set([...evidenceFindings, ...aiFindings])];
}

function photoStatusLabel(status: string) {
  const map: Record<string, string> = {
    missing: "未上傳",
    compressing: "壓縮中",
    uploaded: "尚未檢核",
    checking: "AI 檢核中",
    passed: "通過",
    retake_required: "需要補拍",
    needs_manual_review: "需人工覆核",
    manual_review: "需人工覆核",
    ai_unavailable: "AI 不可用，轉人工",
    demo_replay: "Demo 範例資料",
    failed: "檢核失敗"
  };
  return map[status] ?? status;
}

function viewLabel(view: string) {
  const map: Record<string, string> = {
    front: "車頭",
    rear: "車尾",
    left_side: "左側",
    right_side: "右側",
    interior: "車內",
    dashboard: "儀表板",
    wheel: "輪胎",
    front_or_rear: "車頭或車尾",
    any: "任意",
    unknown: "無法判斷"
  };
  return map[view] ?? view;
}

function matchLabel(value: string) {
  if (value === "yes") return "符合";
  if (value === "no") return "不符合";
  if (value === "not_applicable") return "不適用";
  return "不確定";
}

function levelLabel(value: string) {
  const map: Record<string, string> = {
    none: "無",
    minor: "輕微",
    moderate: "中度",
    severe: "嚴重",
    unknown: "不明"
  };
  return map[value] ?? value;
}

function photoFindingsFromAiPhoto(photo: ClientPhoto) {
  const ai = photo.aiInspection;
  if (!ai) return [];
  const findings: string[] = [];
  if (ai.flags.includes("damage_detected") || ai.flags.includes("possible_damage_detected") || !["none", "unknown"].includes(ai.damage.level)) findings.push("scratch");
  if (ai.flags.includes("dirty_detected") || !["none", "unknown"].includes(ai.cleanliness.level)) findings.push("trash");
  for (const issue of ai.issues) {
    if (["dirty", "mud", "dust", "stain", "bird_dropping"].includes(issue.issue_kind)) findings.push("trash");
    if (["scratch", "possible_damage", "paint_peel", "paint_transfer"].includes(issue.issue_kind)) findings.push("scratch");
    if (["dent", "deformation"].includes(issue.issue_kind)) findings.push("dent");
    if (["crack", "broken_light", "missing_part"].includes(issue.issue_kind)) findings.push("broken_light");
  }
  return findings;
}

function issueKindLabel(kind: string) {
  const map: Record<string, string> = {
    dirty: "髒污",
    mud: "泥污",
    dust: "灰塵",
    stain: "污漬",
    bird_dropping: "鳥糞",
    scratch: "刮傷",
    dent: "凹陷",
    crack: "裂痕",
    paint_peel: "掉漆",
    paint_transfer: "漆面轉移",
    broken_light: "燈具破損",
    deformation: "變形",
    missing_part: "零件缺失",
    possible_damage: "疑似損傷",
    other: "其他"
  };
  return map[kind] ?? kind;
}

function aiStatusLabel(status: ReturnType<typeof collectAiPhotoSignals>["status"]) {
  const map: Record<string, string> = {
    pass: "pass",
    needs_retake: "needs_retake",
    manual_review: "manual_review",
    pending: "pending"
  };
  return map[status];
}

function aiStatusDescription(status: ReturnType<typeof collectAiPhotoSignals>["status"]) {
  if (status === "pass") return "pass：照片品質足夠且未見異常";
  if (status === "needs_retake") return "needs_retake：照片缺失、角度錯誤、車輛不可見、模糊或太暗";
  if (status === "manual_review") return "manual_review：疑似損傷、髒污、敏感資訊或低信心";
  return "pending：尚未取得完整 AI 照片結果";
}

function aiStatusTone(status: ReturnType<typeof collectAiPhotoSignals>["status"]) {
  if (status === "pass") return "success";
  if (status === "needs_retake") return "danger";
  if (status === "manual_review") return "warning";
  return "neutral";
}

function protectionDecisionLabel(decision: NextBookingProtectionDecision) {
  const map: Record<NextBookingProtectionDecision, string> = {
    keep: "保留",
    delay: "延後",
    reassign: "改派",
    hold: "暫停出租"
  };
  return map[decision];
}

function protectionTone(decision: NextBookingProtectionDecision) {
  if (decision === "keep") return "success";
  if (decision === "delay") return "warning";
  if (decision === "reassign") return "danger";
  return "hold";
}
