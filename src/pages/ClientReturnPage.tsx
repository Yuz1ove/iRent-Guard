import {CaseRecognitionPanel} from '../components/RecognitionWorkspace';
import {fileDataUrl, recognitionUrl} from '../lib/recognitionApi';
import React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Images,
  Loader2,
  Mic,
  RefreshCcw,
  RotateCcw,
  Send,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { buildEmptySubmission, photoAngleLabels, requiredPhotoAngles } from "../data/clientSubmissions";
import { applyDemoReturnScenario, demoReturnScenarios, type DemoReturnScenarioId } from "../data/demoReturnScenarios";
import { clientPreCheck } from "../lib/assessmentEngine";
import { getHardSubmitBlockers, getManualReviewSubmitBlockers, getSubmitBlockers, getSubmitReadyCount } from "../lib/clientReturnSubmitGuards";
import { CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE, fetchAiPrecheck, fetchLlmHealth, inspectCustomerPhotos, postDemoSubmission } from "../lib/demoApi";
import { compressImageForInspection, formatBytes } from "../lib/imageCompression";
import { AiProviderHealthCard } from "../components/AiProviderHealthCard";
import type { ClientPhoto, ClientPhotoAngle, ClientPhotoStatus, ClientReturnSubmission } from "../types/client";
import type { ExpectedVehicleView, FinalPhotoInspectionResult } from "../types/photoInspection";
import type { PublicLlmHealthSnapshot } from "../types/photoInspection";

const quickOptions = ["車況正常", "車內有垃圾", "電量/油量偏低", "發現刮傷", "胎壓或警示燈異常", "車況原本就有問題"];
const stepLabels = ["確認車輛", "上傳還車照片", "語音或文字備註", "AI 初步檢查", "送出完成"];

const statusLabels: Record<ClientPhotoStatus, string> = {
  missing: "未上傳",
  compressing: "壓縮中",
  uploaded: "尚未檢核",
  checking: "AI 檢核中",
  retake_required: "需要補拍",
  needs_manual_review: "需人工覆核",
  manual_review: "需人工覆核",
  ai_unavailable: "轉人工覆核",
  demo_replay: "Demo 範例資料",
  failed: "檢核失敗，可重試",
  passed: "通過"
};

const photoGuides: Record<ClientPhotoAngle, string> = {
  front: "請站在車頭正前方，讓車牌、頭燈、前保桿入鏡。",
  rear: "請站在車尾正後方，讓車牌、尾燈、後保桿入鏡。",
  left: "請拍攝左側車門、側窗與車身線條。",
  right: "請拍攝右側車門、側窗與車身線條。",
  interior: "請拍攝座椅、方向盤或中控台。",
  dashboard: "請清楚拍攝油量、電量、里程或警示燈資訊。"
};

export function ClientReturnPage() {
  const [step, setStep] = React.useState(0);
  const [submission, setSubmission] = React.useState<ClientReturnSubmission>(() => {try {const saved=sessionStorage.getItem("irentGuardDraft");return saved?JSON.parse(saved):buildEmptySubmission();}catch{return buildEmptySubmission();}});
  const [remoteHints, setRemoteHints] = React.useState<string[]>([]);
  const [photoBatchMessage, setPhotoBatchMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [workflowNotice, setWorkflowNotice] = React.useState("");
  const [submitNotice, setSubmitNotice] = React.useState("");
  const [activeDemoScenarioId, setActiveDemoScenarioId] = React.useState<DemoReturnScenarioId | null>(null);
  const [llmHealth, setLlmHealth] = React.useState<PublicLlmHealthSnapshot | null>(null);
  const [llmHealthLoading, setLlmHealthLoading] = React.useState(true);
  const resumedDraft = React.useRef(false);
  const photoSelectionLock = React.useRef(false);
  const [photoSelectionBusy, setPhotoSelectionBusy] = React.useState(false);
  const nextPhotoAngle = requiredPhotoAngles.find((angle) => !submission.photos.find((photo) => photo.angle === angle)?.previewUrl);
  React.useEffect(()=>{try {sessionStorage.setItem("irentGuardDraft",JSON.stringify(submission));}catch {}},[submission]);
  const preCheck = React.useMemo(() => clientPreCheck(submission), [submission]);
  const submitState = React.useMemo(() => buildSubmitState(submission), [submission]);
  const activeDemoScenario = demoReturnScenarios.find((scenario) => scenario.id === activeDemoScenarioId) ?? null;

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
    if (resumedDraft.current) return;
    resumedDraft.current = true;
    for (const photo of submission.photos) {
      if (photo.status !== "checking") continue;
      const image = photo.aiImageDataUrl || photo.imageUrl;
      if (image) void inspectPhotoDataUrl(photo.angle,image,undefined,{resumeOnly:true});
      else setSubmission(current => ({...current,photos:current.photos.map(item => item.id === photo.id ? {...item,status:"ai_unavailable",aiHint:"重新整理前的照片尚未保存，請重新拍攝或上傳。"} : item)}));
    }
  }, []);

  React.useEffect(() => {
    if (step !== 3) return;
    let alive = true;
    fetchAiPrecheck(submission)
      .then((result) => {
        if (!alive || !result) return;
        setRemoteHints(result.hints);
      })
      .catch(() => {
        if (alive) setRemoteHints([]);
      });
    return () => {
      alive = false;
    };
  }, [step, submission]);

  function update<K extends keyof ClientReturnSubmission>(key: K, value: ClientReturnSubmission[K]) {
    setActiveDemoScenarioId(null);
    setSubmission((current) => ({ ...current, [key]: value }));
  }

  async function handlePhoto(angle: ClientPhotoAngle, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || photoSelectionLock.current) return;
    photoSelectionLock.current = true; setPhotoSelectionBusy(true);
    try { await processPhotoFile(angle, file); }
    finally { photoSelectionLock.current = false; setPhotoSelectionBusy(false); }
  }

  async function processPhotoFile(angle: ClientPhotoAngle, file: File) {
    setActiveDemoScenarioId(null);
    if(file.size>2.9*1024*1024){setSubmitNotice("公開網站原圖上傳上限為 2.9 MB，請另選較小的照片。檔案尚未上傳。");return;}
    const photoLabel = photoAngleLabels[angle];
    const capturedAt = new Date().toISOString();
    setSubmitNotice("");
    setPhotoBatchMessage("");
    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((photo) =>
        photo.angle === angle
          ? {
              ...photo,
              status: "compressing",
              originalSizeBytes: file.size,
              compressedSizeBytes: undefined,
              imageWidth: undefined,
              imageHeight: undefined,
              aiHint: "照片壓縮中：正在修正手機照片方向並縮小檔案。",
              errorMessage: undefined,
              aiInspection: null,
              aiInspectionRaw: null
            }
          : photo
      )
    }));

    let compressed;
    try {
      compressed = await compressImageForInspection(file);
    } catch (error) {
      const fallbackPreview = await fileToPreviewDataUrl(file).catch(() => "");
      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          photo.angle === angle
            ? {
                ...photo,
                previewUrl: fallbackPreview || photo.previewUrl,
                imageUrl: fallbackPreview || photo.imageUrl,
                status: "failed",
                errorMessage: friendlyPhotoError(error),
                aiHint: "照片壓縮失敗，請重新拍攝或選擇較小的圖片。",
                aiInspection: null,
                aiInspectionRaw: null
              }
            : photo
        )
      }));
      return;
    }

    const originalDataUrl = await fileDataUrl(file);
    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((photo) =>
        photo.angle === angle
          ? {
              ...photo,
              previewUrl: compressed.previewDataUrl,
              imageUrl: compressed.previewDataUrl,
              aiImageDataUrl: originalDataUrl,
              originalSizeBytes: compressed.originalSizeBytes,
              compressedSizeBytes: compressed.compressedSizeBytes,
              imageWidth: compressed.width,
              imageHeight: compressed.height,
              status: "checking",
              aiHint: `AI 檢核中：正在辨識${photoLabel}照片中可見的損傷候選。角度与清潔程度仍待人工確認。`,
              errorMessage: undefined,
              aiInspection: null,
              aiInspectionRaw: null
            }
          : photo
      )
    }));

    await inspectPhotoDataUrl(angle, originalDataUrl, capturedAt);
  }

  async function inspectPhotoDataUrl(angle: ClientPhotoAngle, aiImageDataUrl: string, capturedAt = new Date().toISOString(), options: {resumeOnly?: boolean; retryFailed?: boolean} = {}) {
    const inspectedSubmissionId = submission.submissionId;
    const photoLabel = photoAngleLabels[angle];
    try {
      const result = await inspectCustomerPhotos({
        ...options,
        caseId: submission.submissionId,
        rentalId: submission.orderId,
        userId: "demo-customer",
        expectedVehicle: {
          plate: submission.vehicleId,
          makeModel: submission.vehicleModel,
          color: null
        },
        photos: [
          {
            id: photoIdForAngle(angle),
            imageUrl: aiImageDataUrl,
            expectedView: expectedViewForAngle(angle),
            stage: "return",
            capturedAt,
            note: `${photoLabel} 還車照片 ${submission.textNote || submission.voiceNote || ""}`
          }
        ]
      });
      const aiPhoto = getAiPhotoForAngle(result, angle);
      const nextStatus = statusFromAiPhoto(result, aiPhoto, angle);
      if (result.ai_meta.health) setLlmHealth(result.ai_meta.health);

      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          current.submissionId === inspectedSubmissionId && photo.angle === angle && (photo.aiImageDataUrl || photo.imageUrl) === aiImageDataUrl
            ? {
                ...photo,
                status: nextStatus,
                ...(result.ai_meta.integration ? {imageUrl:result.ai_meta.integration.image_url,previewUrl:result.ai_meta.integration.image_url,aiImageDataUrl:result.ai_meta.integration.image_url} : {}),
                aiHint: hintFromAiPhoto(result, aiPhoto, angle),
                errorMessage: undefined,
                aiInspection: aiPhoto,
                aiInspectionRaw: result,
                lastCheckedAt: new Date().toISOString()
              }
            : photo
        )
      }));
    } catch (error) {
      console.warn("[client-photo-inspection] failed", error);
      const message = friendlyPhotoError(error);
      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          current.submissionId === inspectedSubmissionId && photo.angle === angle && (photo.aiImageDataUrl || photo.imageUrl) === aiImageDataUrl
            ? {
                ...photo,
                status: "ai_unavailable",
                aiHint: "尚未確認伺服器保存，照片保留於目前表單，請重試或人工處理。",
                errorMessage: message,
                aiInspection: null,
                aiInspectionRaw: null
              }
            : photo
        )
      }));
    }
  }

  async function retryPhotoInspection(angle: ClientPhotoAngle) {
    const photo = submission.photos.find((item) => item.angle === angle);
    if (!photo?.aiImageDataUrl) {
      setSubmitNotice(`請先重新拍攝${photoAngleLabels[angle]}照片。`);
      return;
    }
    setSubmitNotice("");
    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((item) =>
        item.angle === angle
          ? {
              ...item,
              status: "checking",
              aiHint: `重新檢核中：正在確認${photoAngleLabels[angle]}照片。`,
              errorMessage: undefined,
              aiInspection: null,
              aiInspectionRaw: null
            }
          : item
      )
    }));
    await inspectPhotoDataUrl(angle, photo.aiImageDataUrl,undefined,{retryFailed:true});
  }

  function movePhotoToDetectedSlot(sourceAngle: ClientPhotoAngle) {
    const sourcePhoto = submission.photos.find((item) => item.angle === sourceAngle);
    const targetAngle = normalizeDetectedAngle(sourcePhoto?.aiInspection?.detected_view ?? "");
    if (!sourcePhoto?.aiImageDataUrl || !targetAngle || targetAngle === sourceAngle) {
      setSubmitNotice("AI 尚未判斷出可移動的正確欄位，請重新拍攝。");
      return;
    }

    const targetPhoto = submission.photos.find((item) => item.angle === targetAngle);
    const targetOccupied = Boolean(targetPhoto?.previewUrl || targetPhoto?.imageUrl || targetPhoto?.aiImageDataUrl);
    if (targetOccupied && !window.confirm(`${photoAngleLabels[targetAngle]}欄位已有照片，是否交換兩張照片並重新檢核？`)) {
      return;
    }

    setActiveDemoScenarioId(null);
    setSubmitNotice("");
    setPhotoBatchMessage(`已將${photoAngleLabels[sourceAngle]}照片移到${photoAngleLabels[targetAngle]}欄位，系統正在重新檢核 expected_view。`);

    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((photo) => {
        if (photo.angle === targetAngle) {
          return rehomePhotoForAngle(sourcePhoto, targetAngle, `已移到${photoAngleLabels[targetAngle]}欄位，AI 重新檢核中。`);
        }
        if (photo.angle === sourceAngle) {
          return targetOccupied && targetPhoto
            ? rehomePhotoForAngle(targetPhoto, sourceAngle, `已與${photoAngleLabels[targetAngle]}欄位交換，AI 重新檢核中。`)
            : buildFallbackPhoto(sourceAngle);
        }
        return photo;
      })
    }));

    void inspectPhotoDataUrl(targetAngle, sourcePhoto.aiImageDataUrl);
    if (targetOccupied && targetPhoto?.aiImageDataUrl) {
      void inspectPhotoDataUrl(sourceAngle, targetPhoto.aiImageDataUrl);
    }
  }

  async function handleBatchPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.currentTarget.value = "";
    if (files.length === 0 || photoSelectionLock.current) return;
    photoSelectionLock.current = true; setPhotoSelectionBusy(true);
    try {

    const selectedAngles = requiredPhotoAngles.slice(0, Math.min(files.length, requiredPhotoAngles.length));
    setPhotoBatchMessage(`已選取 ${selectedAngles.length} 張照片，先暫放到待補欄位。請確認每張照片角度，若 AI 判定與欄位不符，請重新拍攝或移到正確欄位。`);

    for (const [index, angle] of selectedAngles.entries()) {
      await processPhotoFile(angle, files[index]);
    }
    } finally { photoSelectionLock.current = false; setPhotoSelectionBusy(false); }
  }

  function toggleQuickNote(note: string) {
    setActiveDemoScenarioId(null);
    setSubmission((current) => ({
      ...current,
      quickNotes: current.quickNotes.includes(note)
        ? current.quickNotes.filter((item) => item !== note)
        : [...current.quickNotes, note]
    }));
  }

  function goToStep(nextStep: number) {
    if (nextStep > step && nextStep > 1) {
      const photoBlockers = getSubmitBlockers(submission).filter(blocker => blocker.code !== "acknowledgement_required");
      if (photoBlockers.some(blocker => !blocker.canOverrideWithManualReview)) { setSubmitNotice(photoBlockers.map(blockerNotice).join(" ")); setStep(1); return; }
      if (step <= 1 && photoBlockers.length && !window.confirm("照片尚未確認為合格車況照片，不能算檢核通過。要改走人工覆核流程嗎？取消可留在此頁補拍。")) return;
    }
    setStep(nextStep);
    setWorkflowNotice(`已切換至「${stepLabels[nextStep]}」`);
    window.setTimeout(() => setWorkflowNotice(""), 1200);
  }

  function resetWorkflow() {
    setSubmission(buildEmptySubmission());
    setActiveDemoScenarioId(null);
    setStep(0);
    setRemoteHints([]);
    setPhotoBatchMessage("");
    setSubmitNotice("");
    setWorkflowNotice("流程已重置");
    window.setTimeout(() => setWorkflowNotice(""), 1400);
  }

  function applyDemoScenario(scenarioId: DemoReturnScenarioId) {
    setSubmission((current) => applyDemoReturnScenario(current, scenarioId));
    setActiveDemoScenarioId(scenarioId);
    setStep(1);
    setRemoteHints([]);
    setPhotoBatchMessage("已套用 Demo Replay：照片、備註與 quickOptions 皆已自動填入；結果標示為 Demo 範例資料，非正式 AI 判定。");
    setSubmitNotice("");
    setWorkflowNotice("已載入 Demo Replay");
    window.setTimeout(() => setWorkflowNotice(""), 1400);
  }

  async function submitReturn() {
    if (submitting) return;

    const currentSubmitState = buildSubmitState(submission);
    if (currentSubmitState.hardBlockers.length > 0) {
      const first = currentSubmitState.hardBlockers[0];
      setStep(first.code === "acknowledgement_required" ? 4 : 1);
      setSubmitNotice(blockerNotice(first));
      return;
    }
    if (currentSubmitState.manualReviewBlockers.length > 0) {
      const confirmed = window.confirm("照片仍未通過車輛、角度或畫質檢核。送出只代表收件，還車檢核尚未通過。確認送客服人工覆核？");
      if (!confirmed) {
        setStep(1);
        setSubmitNotice(currentSubmitState.manualReviewBlockers.map(blockerNotice).join(" "));
        return;
      }
    }

    setSubmitting(true);
    const submitted: ClientReturnSubmission = {
      ...submission,
      submittedAt: new Date().toISOString(),
      submissionId: submission.submissionId || `SUB-${submission.orderId}`
    };
    let savedCaseId = '';
    try {
      const demoCase = await postDemoSubmission(submitted);
      savedCaseId = demoCase.caseId;
      sessionStorage.setItem("irentGuardLatestCaseId", demoCase.caseId);
    } catch (error) {
      setSubmitting(false);
      setSubmitNotice("尚未確認伺服器保存，已保留輸入，請稍後重試。" + (error instanceof Error ? error.message : ""));
      return;
    }
    sessionStorage.setItem("irentGuardClientSubmission", JSON.stringify(submitted));
    setSubmitting(false);
    window.history.pushState({}, "", "/client/return-result?case="+encodeURIComponent(savedCaseId));
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="page client-return-page">
      <div className="recognition-case-entry"><p>原本的還車流程完整保留。您上傳的照片會使用真實辨識服務並保存結果；Demo Replay 仍明確標示為模擬資料。</p><a href={recognitionUrl(undefined,submission.submissionId,'/client/return')}>選擇真實照片範例／查看本案辨識 <ArrowRight size={16}/></a></div>
      <section className="mobile-workflow">
        <div className="app-stepper">
          {stepLabels.map((label, index) => (
            <button aria-current={index === step ? "step" : undefined} className={index === step ? "active" : index < step ? "done" : ""} key={label} onClick={() => goToStep(index)} type="button">
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

          <div className="phone-workspace">
            <div className="phone-status">iRent 還車檢查</div>
            {activeDemoScenario ? (
              <div className="demo-data-banner">
                <Sparkles size={16} />
                <span>Demo 範例資料｜{activeDemoScenario.label}</span>
              </div>
            ) : null}

          {step === 0 ? (
            <section className="app-panel">
              <h1>確認車輛</h1>
              <div className="form-grid">
                <label>訂單編號<input value={submission.orderId} onChange={(event) => update("orderId", event.target.value)} /></label>
                <label>車號<input value={submission.vehicleId} onChange={(event) => update("vehicleId", event.target.value)} /></label>
                <label>車型<input value={submission.vehicleModel} onChange={(event) => update("vehicleModel", event.target.value)} /></label>
                <label>還車站點<input value={submission.returnStation} onChange={(event) => update("returnStation", event.target.value)} /></label>
                <label>還車時間<input type="datetime-local" value={submission.returnTime} onChange={(event) => update("returnTime", event.target.value)} /></label>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="app-panel">
              <h1>上傳還車照片</h1>
              <PhotoProgressChecklist photos={submission.photos} />
              <div className="batch-upload-row">
                <label className="batch-upload-button" aria-disabled={photoSelectionBusy || !nextPhotoAngle}>
                  <Camera size={18} /><span>{nextPhotoAngle ? `拍照（${photoAngleLabels[nextPhotoAngle]}）` : "照片欄位已備齊"}</span>
                  <input accept="image/*" capture="environment" type="file" disabled={photoSelectionBusy || !nextPhotoAngle} aria-label="拍照新增下一個空白角度" onChange={(event) => { if (nextPhotoAngle) void handlePhoto(nextPhotoAngle, event); }} />
                </label>
                <label className="batch-upload-button" aria-disabled={photoSelectionBusy}>
                  <Images size={18} /><span>從相簿選取（最多 6 張）</span>
                  <input accept="image/*" multiple type="file" disabled={photoSelectionBusy} aria-label="從相簿選取最多六張還車照片" onChange={handleBatchPhotos} />
                </label>
                {photoBatchMessage ? <p>{photoBatchMessage}</p> : <p>建議逐張拍攝，批次上傳後仍需確認每張角度。</p>}
              </div>
              {submitNotice ? <InlineNotice tone="warning" message={submitNotice} /> : null}
              <div className="client-photo-grid detailed">
                {requiredPhotoAngles.map((angle) => {
                  const photo = submission.photos.find((item) => item.angle === angle) ?? buildFallbackPhoto(angle);
                  return (
                    <PhotoSlotCard
                      angle={angle}
                      key={angle}
                      photo={photo}
                      selectionBusy={photoSelectionBusy}
                      onPhotoChange={handlePhoto}
                      onMoveToDetectedSlot={() => movePhotoToDetectedSlot(angle)}
                      onRetry={() => void retryPhotoInspection(angle)}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="app-panel">
              <h1>語音或文字備註</h1>
              <div className="voice-box">
                <Mic size={20} />
                <span>語音備註模擬區</span>
                <button type="button" onClick={() => update("voiceNote", "右側有刮傷，可能原本就有")}>套用示範語音</button>
              </div>
              <label>文字備註<textarea rows={5} value={submission.textNote} onChange={(event) => update("textNote", event.target.value)} placeholder="例如：右側有刮傷，可能原本就有" /></label>
              <div className="quick-note-grid">
                {quickOptions.map((note) => (
                  <button aria-pressed={submission.quickNotes.includes(note)} className={submission.quickNotes.includes(note) ? "selected" : ""} key={note} onClick={() => toggleQuickNote(note)} type="button">
                    {note}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="app-panel">
              <h1>AI 初步檢查</h1>
              <AnalysisStepList submission={submission} />
              <div className="client-check-card">
                <strong>{preCheck.statusLabel}</strong>
                {[...new Set([...preCheck.hints, ...remoteHints, ...submission.photos.map((photo) => photo.aiHint).filter(Boolean)])].map((hint) => <p key={hint}>{hint}</p>)}
              </div>
              <div className="photo-review-list">
                {submission.photos.map((photo) => (
                  <div key={photo.id}>
                    <strong>{photo.label}</strong>
                    <span className={`photo-status-badge ${displayPhotoStatus(photo)}`}>{statusLabels[displayPhotoStatus(photo)]}</span>
                    <p>{customerFacingPhotoMessage(photo) ?? "尚未上傳照片。"}</p>
                  </div>
                ))}
              </div>
              <div className="neutral-rules">
                <p>此紀錄將提供營運人員後續覆核。</p>
                <p>若車況為取車前已存在，請於備註中補充說明。</p>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="app-panel">
              <h1>確認送出方式</h1>
              <label className="ack-row">
                <input type="checkbox" checked={submission.clientAcknowledgement} onChange={(event) => update("clientAcknowledgement", event.target.checked)} />
                我確認已依 App 指示完成還車照片與備註。
              </label>
              {submitNotice ? <InlineNotice tone="warning" message={submitNotice} /> : null}
              <div className="client-check-card">
                <strong>還車紀錄準備送出</strong>
                <p>案件編號：{submission.submissionId}</p>
                <p>照片狀態：{submitState.readyCount} / {submission.photos.length} 張已通過（Demo Replay 另列示範）。</p>
                <p>未通過的照片只可送人工覆核；收件不代表還車檢核通過。</p>
              </div>
              {submitState.missing.length > 0 ? <InlineNotice tone="warning" message={`缺少照片：${formatAngleList(submitState.missing)}`} /> : null}
              {submitState.checking.length > 0 ? <InlineNotice tone="warning" message={`仍在檢核：${formatAngleList(submitState.checking)}`} /> : null}
                {submitState.needsConfirmation.length > 0 ? <InlineNotice tone="info" message={`可送客服覆核：${formatAngleList(submitState.needsConfirmation)}`} /> : null}
              {submitState.retakeReasons.length > 0 ? <InlineNotice tone="warning" message={`補拍原因：${submitState.retakeReasons.join("；")}`} /> : null}
            </section>
          ) : null}

          <div className="workflow-actions">
            {workflowNotice ? <div className="workflow-notice">{workflowNotice}</div> : null}
            <button className="secondary-button" disabled={step === 0} onClick={() => goToStep(Math.max(0, step - 1))} type="button">
              <ArrowLeft size={18} /> 返回
            </button>
            {step < 4 ? (
              <button className="primary-button" onClick={() => goToStep(Math.min(4, step + 1))} type="button">
                下一步 <ArrowRight size={18} />
              </button>
            ) : (
              <button
                aria-busy={submitting}
                className="primary-button"
                disabled={submitting || submitState.hardBlockers.length > 0}
                onClick={submitReturn}
                type="button"
              >
                {submitting ? "送出中" : submitState.manualReviewBlockers.length ? "送人工覆核（尚未通過）" : "送出還車紀錄"} <Send size={18} />
              </button>
            )}
          </div>
        </div>

        <aside className="client-side-summary">
          <AiProviderHealthCard variant="customer" health={llmHealth} loading={llmHealthLoading} />
          <div className="demo-scenario-selector">
            <div>
              <p className="eyebrow">Demo Replay</p>
              <h2>一鍵 Demo Replay 照片組</h2>
              <p>Demo Replay 會自動填入範例照片與結果；所有結果皆標示為 Demo 範例資料，非正式 AI 判定。</p>
            </div>
            <div className="demo-scenario-grid">
              {demoReturnScenarios.map((scenario) => (
                <button
                  aria-pressed={activeDemoScenarioId === scenario.id}
                  className={activeDemoScenarioId === scenario.id ? "selected" : ""}
                  key={scenario.id}
                  onClick={() => applyDemoScenario(scenario.id)}
                  type="button"
                >
                  <Sparkles size={16} />
                  <span>
                    <strong>{scenario.label}</strong>
                    <small>{scenario.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <h2>客戶端 AI 提醒</h2>
          {preCheck.hints.map((hint) => <p key={hint}>{hint}</p>)}
          <button className="secondary-button" onClick={resetWorkflow} type="button">
            <RotateCcw size={18} /> 重置流程
          </button>
          <button className="secondary-button" onClick={() => update("textNote", "右側有刮傷，可能原本就有")} type="button">
            <Check size={18} /> 測試右側刮傷備註
          </button>
        </aside>
      </section>
    </main>
  );
}

function PhotoProgressChecklist({ photos }: { photos: ClientPhoto[] }) {
  return (
    <div className="photo-progress-checklist" aria-label="車況檢查進度">
      {requiredPhotoAngles.map((angle) => {
        const photo = photos.find((item) => item.angle === angle) ?? buildFallbackPhoto(angle);
        const status = displayPhotoStatus(photo);
        const itemState = photoProgressState(status);
        return (
          <div className={itemState.tone} key={angle}>
            {itemState.icon === "done" ? <CheckCircle2 size={16} /> : itemState.icon === "retake" ? <AlertCircle size={16} /> : <Camera size={16} />}
            <span>{photoAngleLabels[angle]}</span>
            <strong>{itemState.label}</strong>
          </div>
        );
      })}
    </div>
  );
}

function AnalysisStepList({ submission }: { submission: ClientReturnSubmission }) {
  const states = buildSubmitState(submission);
  const allComplete = states.hardBlockers.length === 0 && states.manualReviewBlockers.length === 0;
  const hasRetake = states.retakeReasons.length > 0 || states.missing.length > 0;
  const steps = [
    {
      label: "正在檢查照片品質",
      done: submission.photos.some((photo) => photo.status !== "missing" && photo.status !== "checking" && photo.status !== "compressing"),
      warning: hasRetake
    },
    {
      label: "正在比對取車前紀錄",
      done: submission.photos.some((photo) => photo.status === "passed" || photo.status === "manual_review" || photo.status === "demo_replay"),
      warning: false
    },
    {
      label: "正在辨識車身異常",
      done: submission.photos.some((photo) => photo.aiInspection),
      warning: submission.photos.some((photo) => photo.status === "manual_review" || photo.status === "needs_manual_review")
    },
    {
      label: "正在產生還車建議",
      done: allComplete || states.manualReviewBlockers.length > 0,
      warning: states.manualReviewBlockers.length > 0
    }
  ];

  return (
    <ol className="analysis-step-list">
      {steps.map((step) => (
        <li className={step.warning ? "warning" : step.done ? "done" : ""} key={step.label}>
          {step.done || step.warning ? <CheckCircle2 size={16} /> : <Loader2 size={16} />}
          <span>{step.label}</span>
          <strong>{step.warning ? "需確認" : step.done ? "完成" : "等待中"}</strong>
        </li>
      ))}
    </ol>
  );
}

function PhotoSlotCard({
  angle,
  photo,
  selectionBusy,
  onPhotoChange,
  onMoveToDetectedSlot,
  onRetry
}: {
  angle: ClientPhotoAngle;
  photo: ClientPhoto;
  selectionBusy: boolean;
  onPhotoChange: (angle: ClientPhotoAngle, event: React.ChangeEvent<HTMLInputElement>) => void;
  onMoveToDetectedSlot: () => void;
  onRetry: () => void;
}) {
  const status = displayPhotoStatus(photo);
  const canRetry = Boolean(photo.aiImageDataUrl) && ["failed", "uploaded", "retake_required", "manual_review", "needs_manual_review", "ai_unavailable"].includes(status);
  const aiMessage = customerFacingPhotoMessage(photo);
  const hasLoading = status === "compressing" || status === "checking";
  const detectedAngle = normalizeDetectedAngle(photo.aiInspection?.detected_view ?? "");
  const canMoveToDetectedSlot = Boolean(
    photo.aiImageDataUrl &&
      photo.aiInspection?.flags.includes("wrong_expected_view") &&
      detectedAngle &&
      detectedAngle !== angle
  );

  return (
    <article className={`client-photo-card ${status}`}>
      <header>
        <div>
          <strong>{photoAngleLabels[angle]}</strong>
          <p>{photoGuides[angle]}</p>
        </div>
        <span className={`photo-status-badge ${status}`}>{statusLabels[status]}</span>
      </header>

      <label className="photo-upload-control">
        <input accept="image/*" capture="environment" type="file" disabled={selectionBusy || hasLoading} aria-label={`${photoAngleLabels[angle]}拍照`} onChange={(event) => onPhotoChange(angle, event)} />
        {photo.previewUrl ? (
          <img alt={photoAngleLabels[angle]} src={photo.previewUrl} />
        ) : (
          <span>
            <Camera size={24} />
            拍照
          </span>
        )}
      </label>

      <dl className="photo-size-meta">
        <div><dt>原始</dt><dd>{formatBytes(photo.originalSizeBytes)}</dd></div>
        <div><dt>壓縮後</dt><dd>{formatBytes(photo.compressedSizeBytes)}</dd></div>
        <div><dt>尺寸</dt><dd>{photo.imageWidth && photo.imageHeight ? `${photo.imageWidth}x${photo.imageHeight}` : "-"}</dd></div>
      </dl>

      {aiMessage ? (
        <div className={`photo-ai-message ${status}`}>
          {hasLoading ? <Loader2 size={16} /> : status === "passed" ? <CheckCircle2 size={16} /> : status === "demo_replay" ? <Sparkles size={16} /> : <AlertCircle size={16} />}
          <p>{aiMessage}</p>
        </div>
      ) : null}

      {photo.aiInspection ? (
        <PublicPhotoAiEvidence photo={photo} />
      ) : null}

      <div className="photo-card-actions">
        <label className="secondary-button" aria-disabled={selectionBusy || hasLoading}>
          <Camera size={16} />
          {photo.previewUrl ? "重新拍照" : "拍照"}
          <input accept="image/*" capture="environment" type="file" disabled={selectionBusy || hasLoading} aria-label={`${photoAngleLabels[angle]}拍照`} onChange={(event) => onPhotoChange(angle, event)} />
        </label>
        <label className="secondary-button" aria-disabled={selectionBusy || hasLoading}>
          <UploadCloud size={16} />從相簿選取
          <input accept="image/*" type="file" disabled={selectionBusy || hasLoading} aria-label={`${photoAngleLabels[angle]}從相簿選取`} onChange={(event) => onPhotoChange(angle, event)} />
        </label>
        {canRetry ? (
          <button className="secondary-button" disabled={hasLoading} onClick={onRetry} type="button">
            <RefreshCcw size={16} /> 重新檢核
          </button>
        ) : null}
        {canMoveToDetectedSlot && detectedAngle ? (
          <button className="secondary-button" disabled={hasLoading} onClick={onMoveToDetectedSlot} type="button">
            <ArrowRight size={16} /> 移到{photoAngleLabels[detectedAngle]}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function photoProgressState(status: ClientPhotoStatus) {
  if (status === "passed" || status === "demo_replay") return { label: "已完成", tone: "done", icon: "done" };
  if (status === "retake_required" || status === "failed") return { label: "需補拍", tone: "warning", icon: "retake" };
  if (status === "manual_review" || status === "needs_manual_review" || status === "ai_unavailable") return { label: "未通過・待覆核", tone: "warning", icon: "retake" };
  if (status === "checking" || status === "compressing" || status === "uploaded") return { label: "檢核中", tone: "checking", icon: "camera" };
  return { label: "尚未完成", tone: "missing", icon: "camera" };
}

function PublicPhotoAiEvidence({ photo }: { photo: ClientPhoto }) {
  const ai = photo.aiInspection;
  if (!ai) return null;
  if (isAiUnavailableResult(photo.aiInspectionRaw)) {
    return (
      <dl className="client-ai-evidence-card unavailable">
        <div className="wide"><dt>AI 檢核</dt><dd>尚未確認伺服器保存，照片保留於目前表單，請重試或人工處理。</dd></div>
      </dl>
    );
  }
  if (isDemoReplayResult(photo.aiInspectionRaw)) {
    return (
      <dl className="client-ai-evidence-card demo">
        <div className="wide"><dt>資料來源</dt><dd>Demo 範例資料，非正式 AI 判定。</dd></div>
        <div><dt>示範角度</dt><dd>{ai.expected_view_match === "yes" || ai.expected_view_match === "not_applicable" ? "符合" : "需確認"}</dd></div>
        <div><dt>示範結果</dt><dd>{ai.retake_required ? "需補拍" : ai.flags.includes("manual_review_recommended") ? "需覆核" : "正常還車"}</dd></div>
        <div className="wide"><dt>訊息</dt><dd>{customerFacingPhotoMessage(photo) ?? ai.customer_message}</dd></div>
      </dl>
    );
  }
  const message = customerFacingPhotoMessage(photo) ?? ai.customer_message;

  return (
    <dl className="client-ai-evidence-card">
      <div><dt>看到車輛</dt><dd>{ai.flags.includes("view_not_evaluated") ? "未評估" : ai.is_vehicle_visible ? "是" : "否"}</dd></div>
      <div><dt>拍攝角度</dt><dd>{ai.expected_view_match === "yes" || ai.expected_view_match === "not_applicable" ? "符合" : "需確認"}</dd></div>
      <div><dt>照片清楚</dt><dd>{ai.flags.includes("quality_not_evaluated") ? "未評估" : ai.photo_quality.is_clear_enough ? "是" : "否"}</dd></div>
      <div><dt>需要補拍</dt><dd>{ai.retake_required ? "是" : "否"}</dd></div>
      <div className="wide"><dt>品質細項</dt><dd>{ai.flags.includes("quality_not_evaluated") ? "此模型只辨識刮痕／凹陷候選，清晰度與角度待人工確認。" : qualityDetailText(ai.photo_quality.problems)}</dd></div>
      <div className="wide"><dt>訊息</dt><dd>{message}</dd></div>
    </dl>
  );
}

function qualityDetailText(problems: string[]) {
  const problemSet = new Set(problems);
  const details = [
    problemSet.has("blurry") ? "可能模糊" : "清晰度足夠",
    problemSet.has("backlit") ? "可能逆光" : "未見明顯逆光",
    problemSet.has("too_dark") ? "光線過暗" : "亮度可用",
    problemSet.has("too_close") ? "距離太近" : "距離可用",
    problemSet.has("vehicle_not_fully_visible") ? "車身未完整入鏡" : "車身主要區域入鏡",
    problemSet.has("wrong_angle") ? "角度需確認" : "角度符合",
    problemSet.has("occluded") ? "可能有遮擋" : "未見明顯遮擋"
  ];
  return details.join("、");
}

function InlineNotice({ message, tone }: { message: string; tone: "info" | "warning" }) {
  return (
    <div className={`inline-notice ${tone}`}>
      <AlertCircle size={17} />
      <p>{message}</p>
    </div>
  );
}

function buildFallbackPhoto(angle: ClientPhotoAngle): ClientPhoto {
  return {
    id: photoIdForAngle(angle),
    angle,
    label: photoAngleLabels[angle],
    status: "missing"
  };
}

function rehomePhotoForAngle(photo: ClientPhoto, angle: ClientPhotoAngle, aiHint: string): ClientPhoto {
  return {
    ...photo,
    id: photoIdForAngle(angle),
    angle,
    label: photoAngleLabels[angle],
    status: "checking",
    aiHint,
    errorMessage: undefined,
    aiInspection: null,
    aiInspectionRaw: null
  };
}

function isRealAiResult(result: FinalPhotoInspectionResult | null | undefined) {
  return isFormalProvider(result?.ai_meta?.source) && typeof result?.ai_meta?.responseId === "string" && result.ai_meta.responseId.length > 0;
}

function isFormalProvider(source: string | null | undefined) {
  return source === "school-relay" || source === "openai" || source === "local-detector";
}

function photoIdForAngle(angle: ClientPhotoAngle) {
  return `photo-${angle}`;
}

function getAiPhotoForAngle(result: FinalPhotoInspectionResult, angle: ClientPhotoAngle) {
  const photoId = photoIdForAngle(angle);
  return result.photos.find((photo) => photo.photo_id === photoId) ?? result.photos.find((photo) => normalizeDetectedAngle(photo.detected_view) === angle) ?? null;
}

function statusFromAiPhoto(result: FinalPhotoInspectionResult, aiPhoto: FinalPhotoInspectionResult["photos"][number] | null, angle: ClientPhotoAngle): ClientPhotoStatus {
  if (isAiUnavailableResult(result)) return "ai_unavailable";
  if (!isRealAiResult(result) || !aiPhoto) return "needs_manual_review";
  if (missingAreaForAngle(angle) && result.missingAngles.includes(missingAreaForAngle(angle)!)) return "retake_required";
  if (aiPhoto.retake_required) return "retake_required";
  if (result.final_decision.status === "manual_review" || aiPhoto.flags.includes("manual_review_recommended")) return "manual_review";
  return "passed";
}

function hintFromAiPhoto(result: FinalPhotoInspectionResult, aiPhoto: FinalPhotoInspectionResult["photos"][number] | null, angle: ClientPhotoAngle) {
  if (isAiUnavailableResult(result)) return "尚未確認伺服器保存，照片保留於目前表單，請重試或人工處理。";
  if (isDemoReplayResult(result)) return `Demo 範例資料：${aiPhoto?.customer_message ?? result.final_decision.customer_message}`;
  if (!isRealAiResult(result)) return "尚未取得正式 AI 判定，請重新檢核或送客服人工覆核。";
  if (aiPhoto?.flags.includes("wrong_expected_view")) {
    return `可能放錯欄位：${aiPhoto.customer_message || wrongSlotMessage(angle)}請重新拍攝或移到正確欄位。`;
  }
  if (result.final_decision.status === "manual_review" || aiPhoto?.flags.includes("manual_review_recommended")) {
    return "照片內容、角度或畫質尚未確認，不能計為通過；請補拍或明確送人工覆核。";
  }
  const missingArea = missingAreaForAngle(angle);
  const missingIssue = result.detectedIssues.find((issue) => issue.issueType === "missing_photo" && issue.area === missingArea);
  if (missingIssue) return missingIssue.reason;
  return aiPhoto?.customer_message ?? result.final_decision.customer_message;
}

function customerFacingPhotoMessage(photo: ClientPhoto) {
  if (photo.status === "ai_unavailable" || isAiUnavailableResult(photo.aiInspectionRaw)) {
    return "尚未確認伺服器保存，照片保留於目前表單，請重試或人工處理。";
  }
  if (isDemoReplayResult(photo.aiInspectionRaw)) {
    return `Demo 範例資料：${photo.aiInspection?.customer_message ?? "此結果為 Demo Replay，非正式 AI 判定。"}`;
  }
  if (photo.status === "passed" && !isRealAiResult(photo.aiInspectionRaw)) {
    return "尚未取得正式 AI 判定，請重新檢核或送客服人工覆核。";
  }
  if (photo.aiInspection?.flags.includes("wrong_expected_view")) {
    return `可能放錯欄位，請重新拍攝或移到正確欄位。${photo.aiInspection.customer_message}`;
  }
  if (photo.status === "manual_review" || photo.status === "needs_manual_review" || photo.aiInspection?.flags.includes("manual_review_recommended")) {
    return "照片內容、角度或畫質尚未確認，不能計為通過；請補拍或明確送人工覆核。";
  }
  return photo.aiInspection?.customer_message ?? photo.errorMessage ?? photo.aiHint;
}

function missingAreaForAngle(angle: ClientPhotoAngle) {
  if (angle === "front" || angle === "rear" || angle === "left" || angle === "right" || angle === "interior" || angle === "dashboard") return angle;
  return null;
}

function displayPhotoStatus(photo: ClientPhoto): ClientPhotoStatus {
  if (isDemoReplayResult(photo.aiInspectionRaw)) return "demo_replay";
  if (isAiUnavailableResult(photo.aiInspectionRaw)) return "ai_unavailable";
  if (photo.status === "passed" && !isRealAiResult(photo.aiInspectionRaw)) return "needs_manual_review";
  return photo.status ?? "missing";
}

function isAiUnavailableResult(result: FinalPhotoInspectionResult | null | undefined) {
  return result?.ai_meta?.resultKind === "ai_unavailable";
}

function isDemoReplayResult(result: FinalPhotoInspectionResult | null | undefined) {
  return result?.ai_meta?.resultKind === "demo_replay" || result?.ai_meta?.source === "demo_replay";
}

function normalizeDetectedAngle(view: string): ClientPhotoAngle | null {
  if (view === "front" || view === "rear" || view === "interior" || view === "dashboard") return view;
  if (view === "left_side") return "left";
  if (view === "right_side") return "right";
  return null;
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

function buildSubmitState(submission: ClientReturnSubmission) {
  const blockers = getSubmitBlockers(submission);
  const hardBlockers = getHardSubmitBlockers(blockers);
  const manualReviewBlockers = getManualReviewSubmitBlockers(blockers);
  const missing = submission.photos.filter((photo) => photo.status === "missing").map((photo) => photo.angle);
  const checking = submission.photos
    .filter((photo) => photo.status === "checking" || photo.status === "compressing")
    .map((photo) => photo.angle);
  const retake = submission.photos.filter((photo) => photo.status === "retake_required").map((photo) => photo.angle);
  const failed = submission.photos.filter((photo) => photo.status === "failed" || photo.status === "uploaded").map((photo) => photo.angle);
  const manualReview = submission.photos
    .filter((photo) => photo.status === "manual_review" || photo.status === "needs_manual_review" || photo.status === "ai_unavailable")
    .map((photo) => photo.angle);
  const readyCount = getSubmitReadyCount(submission);

  return {
    blockers,
    hardBlockers,
    manualReviewBlockers,
    missing,
    checking,
    retake,
    failed,
    manualReview,
    needsConfirmation: [...new Set([...retake, ...failed, ...manualReview])],
    retakeReasons: blockers.filter((blocker) => blocker.code === "retake_required").flatMap((blocker) => blocker.reasons),
    readyCount
  };
}

function formatAngleList(angles: ClientPhotoAngle[]) {
  return angles.map((angle) => photoAngleLabels[angle]).join("、");
}

function blockerNotice(blocker: ReturnType<typeof getSubmitBlockers>[number]) {
  const angleText = blocker.angles.length > 0 ? `${formatAngleList(blocker.angles)}：` : "";
  const reasons = blocker.reasons.length > 0 ? `原因：${blocker.reasons.join("；")}` : "";
  return `${angleText}${blocker.message}${reasons ? ` ${reasons}` : ""}`;
}

function wrongSlotMessage(angle: ClientPhotoAngle) {
  return `此張照片不符合${photoAngleLabels[angle]}欄位。`;
}

function friendlyPhotoError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.trim()) return message;
  return CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE;
}

function fileToPreviewDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("照片讀取失敗"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}
