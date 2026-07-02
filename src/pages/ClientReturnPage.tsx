import React from "react";
import { ArrowLeft, ArrowRight, Camera, Check, FlaskConical, Images, Mic, RotateCcw, Send } from "lucide-react";
import { buildEmptySubmission, photoAngleLabels, requiredPhotoAngles } from "../data/clientSubmissions";
import { clientPreCheck } from "../lib/assessmentEngine";
import { CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE, fetchAiPrecheck, inspectCustomerPhotos, postDemoSubmission, runPhotoAiSmokeTest } from "../lib/demoApi";
import type { PhotoAiSmokeTestResult } from "../lib/demoApi";
import type { ClientPhotoAngle, ClientPhotoStatus, ClientReturnSubmission } from "../types/client";
import type { ExpectedVehicleView, FinalPhotoInspectionResult } from "../types/photoInspection";

const quickOptions = ["車況正常", "車內有垃圾", "電量/油量偏低", "發現刮傷", "胎壓或警示燈異常", "車況原本就有問題"];
const stepLabels = ["確認車輛", "上傳還車照片", "語音或文字備註", "AI 初步檢查", "送出完成"];

const statusLabels: Record<ClientPhotoStatus, string> = {
  missing: "未上傳",
  uploaded: "尚未檢核",
  checking: "AI 檢核中",
  retake_required: "需要補拍",
  passed: "通過"
};

export function ClientReturnPage() {
  const [step, setStep] = React.useState(0);
  const [submission, setSubmission] = React.useState<ClientReturnSubmission>(() => buildEmptySubmission());
  const [remoteHints, setRemoteHints] = React.useState<string[]>([]);
  const [photoBatchMessage, setPhotoBatchMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const preCheck = React.useMemo(() => clientPreCheck(submission), [submission]);

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
    setSubmission((current) => ({ ...current, [key]: value }));
  }

  async function handlePhoto(angle: ClientPhotoAngle, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = await fileToPreviewDataUrl(file);
    const photoLabel = photoAngleLabels[angle];
    const capturedAt = new Date().toISOString();
    setPhotoBatchMessage("");
    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((photo) =>
        photo.angle === angle
          ? {
              ...photo,
              previewUrl,
              imageUrl: previewUrl,
              status: "checking",
              aiHint: "AI 檢核中：正在判斷角度、清晰度、髒污與損傷",
              aiInspection: null,
              aiInspectionRaw: null
            }
          : photo
      )
    }));

    try {
      const result = await inspectCustomerPhotos({
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
            imageUrl: previewUrl,
            expectedView: expectedViewForAngle(angle),
            stage: "return",
            capturedAt,
            note: `${photoLabel} 還車照片 ${submission.textNote || submission.voiceNote || ""}`
          }
        ]
      });
      const aiPhoto = getAiPhotoForAngle(result, angle);
      const nextStatus = statusFromAiPhoto(result, aiPhoto, angle);

      setSubmission((current) => {
        return {
          ...current,
          photos: current.photos.map((photo) =>
            photo.angle === angle
              ? {
                  ...photo,
                  status: nextStatus,
                  aiHint: hintFromAiPhoto(result, aiPhoto, angle),
                  aiInspection: aiPhoto,
                  aiInspectionRaw: result
                }
              : photo
          )
        };
      });
    } catch (error) {
      console.warn("[client-photo-inspection] failed", error);
      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          photo.angle === angle
            ? {
                ...photo,
                status: "uploaded",
                aiHint: CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE,
                aiInspection: null,
                aiInspectionRaw: null
              }
            : photo
        )
      }));
    }
  }

  async function handleBatchPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.currentTarget.value = "";
    if (files.length === 0) return;

    const selectedAngles = requiredPhotoAngles.slice(0, Math.min(files.length, requiredPhotoAngles.length));
    const capturedAt = new Date().toISOString();
    const selected = await Promise.all(
      selectedAngles.map(async (angle, index) => ({
        angle,
        previewUrl: await fileToPreviewDataUrl(files[index]),
        fileName: files[index].name
      }))
    );

    setPhotoBatchMessage(
      files.length >= requiredPhotoAngles.length
        ? "6 張照片已送出 AI 批次檢核。"
        : `${selected.length} 張照片已送出 AI 批次檢核。`
    );
    setSubmission((current) => ({
      ...current,
      photos: current.photos.map((photo) => {
        const selectedPhoto = selected.find((item) => item.angle === photo.angle);
        if (!selectedPhoto) return photo;
        return {
          ...photo,
          previewUrl: selectedPhoto.previewUrl,
          imageUrl: selectedPhoto.previewUrl,
          status: "checking",
          aiHint: "AI 批次檢核中：正在比對角度、清晰度、髒污與損傷",
          aiInspection: null,
          aiInspectionRaw: null
        };
      })
    }));

    try {
      const result = await inspectCustomerPhotos({
        caseId: submission.submissionId,
        rentalId: submission.orderId,
        userId: "demo-customer",
        expectedVehicle: {
          plate: submission.vehicleId,
          makeModel: submission.vehicleModel,
          color: null
        },
        requireCompleteInspection: selected.length >= requiredPhotoAngles.length,
        requiredAngles: ["front", "rear", "left", "right", "interior"],
        photos: selected.map((item) => ({
          id: photoIdForAngle(item.angle),
          imageUrl: item.previewUrl,
          expectedView: expectedViewForAngle(item.angle),
          stage: "return",
          capturedAt,
          note: `${photoAngleLabels[item.angle]} 還車照片 ${submission.textNote || submission.voiceNote || ""}`
        }))
      });

      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) => {
          if (!selectedAngles.includes(photo.angle)) return photo;
          const aiPhoto = getAiPhotoForAngle(result, photo.angle);
          return {
            ...photo,
            status: statusFromAiPhoto(result, aiPhoto, photo.angle),
            aiHint: hintFromAiPhoto(result, aiPhoto, photo.angle),
            aiInspection: aiPhoto,
            aiInspectionRaw: result
          };
        })
      }));
      setPhotoBatchMessage(result.customerMessage || result.final_decision.customer_message);
    } catch (error) {
      console.warn("[client-photo-batch-inspection] failed", error);
      const message = CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE;
      setPhotoBatchMessage(message);
      setSubmission((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          selectedAngles.includes(photo.angle)
            ? {
                ...photo,
                status: "uploaded",
                aiHint: message,
                aiInspection: null,
                aiInspectionRaw: null
              }
            : photo
        )
      }));
    }
  }

  function toggleQuickNote(note: string) {
    setSubmission((current) => ({
      ...current,
      quickNotes: current.quickNotes.includes(note)
        ? current.quickNotes.filter((item) => item !== note)
        : [...current.quickNotes, note]
    }));
  }

  async function submitReturn() {
    setSubmitting(true);
    const submitted: ClientReturnSubmission = {
      ...submission,
      submittedAt: new Date().toISOString(),
      submissionId: submission.submissionId || `SUB-${submission.orderId}`
    };
    try {
      const demoCase = await postDemoSubmission(submitted);
      sessionStorage.setItem("irentGuardLatestCaseId", demoCase.caseId);
    } catch {
      // Keep the client demo usable even if the local API is unavailable.
    }
    sessionStorage.setItem("irentGuardClientSubmission", JSON.stringify(submitted));
    setSubmitting(false);
    window.history.pushState({}, "", "/client/return-result");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="page client-return-page">
      <section className="mobile-workflow">
        <div className="app-stepper">
          {stepLabels.map((label, index) => (
            <button className={index === step ? "active" : index < step ? "done" : ""} key={label} onClick={() => setStep(index)} type="button">
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="phone-workspace">
          <div className="phone-status">iRent 還車檢查</div>

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
              <div className="batch-upload-row">
                <label className="batch-upload-button">
                  <Images size={18} />
                  <span>一次選取 6 張</span>
                  <input accept="image/*" multiple type="file" onChange={handleBatchPhotos} />
                </label>
                {photoBatchMessage ? <p>{photoBatchMessage}</p> : null}
              </div>
              <div className="client-photo-grid">
                {requiredPhotoAngles.map((angle) => {
                  const photo = submission.photos.find((item) => item.angle === angle);
                  const expectedView = expectedViewForAngle(angle);
                  const realAiResult = isRealAiResult(photo?.aiInspectionRaw);
                  return (
                    <label className={`client-photo-tile ${photo?.status ?? "missing"}`} key={angle}>
                      <input accept="image/*" type="file" onChange={(event) => handlePhoto(angle, event)} />
                      {photo?.previewUrl ? <img alt={photoAngleLabels[angle]} src={photo.previewUrl} /> : <Camera size={24} />}
                      <strong>{photoAngleLabels[angle]}</strong>
                      <span>{statusLabels[photo?.status ?? "missing"]}</span>
                      {photo?.aiInspection ? (
                        <div className={`photo-ai-mini ${realAiResult ? "" : "not-real"}`}>
                          <span>要求拍攝：{viewLabel(expectedView)}</span>
                          <span>AI 判斷：{realAiResult ? viewLabel(photo.aiInspection.detected_view) : "無正式判定"}</span>
                          {realAiResult ? (
                            <>
                              <span>品質 {Math.round(photo.aiInspection.photo_quality.score * 100)}%</span>
                              <span>髒污 {levelLabel(photo.aiInspection.cleanliness.level)}</span>
                              <span>損傷 {levelLabel(photo.aiInspection.damage.level)}</span>
                            </>
                          ) : (
                            <span className="full">尚未取得正式 AI 判定</span>
                          )}
                        </div>
                      ) : null}
                      {photo?.aiHint ? <small>{photo.aiHint}</small> : null}
                      {photo?.aiInspectionRaw ? <AiDebugBlock result={photo.aiInspectionRaw} /> : null}
                    </label>
                  );
                })}
              </div>
              <PhotoAiSmokeTestPanel />
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
                  <button className={submission.quickNotes.includes(note) ? "selected" : ""} key={note} onClick={() => toggleQuickNote(note)} type="button">
                    {note}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="app-panel">
              <h1>AI 初步檢查</h1>
              <div className="client-check-card">
                <strong>{preCheck.statusLabel}</strong>
                {[...new Set([...preCheck.hints, ...remoteHints, ...submission.photos.map((photo) => photo.aiHint).filter(Boolean)])].map((hint) => <p key={hint}>{hint}</p>)}
              </div>
              <div className="neutral-rules">
                <p>此紀錄將提供營運人員後續覆核。</p>
                <p>若車況為取車前已存在，請於備註中補充說明。</p>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="app-panel">
              <h1>送出完成</h1>
              <label className="ack-row">
                <input type="checkbox" checked={submission.clientAcknowledgement} onChange={(event) => update("clientAcknowledgement", event.target.checked)} />
                我確認已依 App 指示完成還車照片與備註。
              </label>
              <div className="client-check-card">
                <strong>還車紀錄準備送出</strong>
                <p>案件編號：{submission.submissionId}</p>
                <p>AI 初步狀態：{preCheck.statusLabel}</p>
                <p>客服將於必要時聯繫。</p>
              </div>
            </section>
          ) : null}

          <div className="workflow-actions">
            <button className="secondary-button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button">
              <ArrowLeft size={18} /> 返回
            </button>
            {step < 4 ? (
              <button className="primary-button" onClick={() => setStep((value) => Math.min(4, value + 1))} type="button">
                下一步 <ArrowRight size={18} />
              </button>
            ) : (
              <button className="primary-button" onClick={submitReturn} type="button">
                {submitting ? "送出中" : "送出還車紀錄"} <Send size={18} />
              </button>
            )}
          </div>
        </div>

        <aside className="client-side-summary">
          <h2>客戶端 AI 提醒</h2>
          {preCheck.hints.map((hint) => <p key={hint}>{hint}</p>)}
          <button className="secondary-button" onClick={() => setSubmission(buildEmptySubmission())} type="button">
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

function AiDebugBlock({ result }: { result: FinalPhotoInspectionResult }) {
  const realAiResult = isRealAiResult(result);

  return (
    <details className="photo-ai-debug">
      <summary>AI debug</summary>
      {!realAiResult ? <p className="ai-warning">此結果不是正式 AI 判定，不能顯示通過。</p> : null}
      <dl>
        <div>
          <dt>AI 來源</dt>
          <dd>{result.ai_meta?.source ?? "unknown"}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{result.ai_meta?.model ?? "-"}</dd>
        </div>
        <div>
          <dt>Response ID</dt>
          <dd>{result.ai_meta?.responseId ?? "-"}</dd>
        </div>
        <div>
          <dt>產生時間</dt>
          <dd>{result.ai_meta?.generatedAt ?? "-"}</dd>
        </div>
      </dl>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </details>
  );
}

function PhotoAiSmokeTestPanel() {
  const [file, setFile] = React.useState<File | null>(null);
  const [expectedView, setExpectedView] = React.useState<ExpectedVehicleView>("front");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PhotoAiSmokeTestResult | null>(null);
  const [error, setError] = React.useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("請先選擇圖片。");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      setResult(await runPhotoAiSmokeTest({ file, expectedView }));
    } catch (err) {
      console.warn("[photo-ai-smoke-test] failed", err);
      setError(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="photo-ai-smoke-panel" onSubmit={handleSubmit}>
      <div className="tool-heading">
        <FlaskConical size={18} />
        <strong>Photo AI Smoke Test</strong>
      </div>
      <input accept="image/*" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <label>
        expectedView
        <select value={expectedView} onChange={(event) => setExpectedView(event.target.value as ExpectedVehicleView)}>
          <option value="front">front</option>
          <option value="rear">rear</option>
          <option value="front_or_rear">front_or_rear</option>
          <option value="any">any</option>
        </select>
      </label>
      <button className="secondary-button" disabled={loading} type="submit">
        <FlaskConical size={16} /> {loading ? "檢核中" : "執行測試"}
      </button>
      {error ? <p className="ai-warning">{error}</p> : null}
      {result ? (
        <div className="smoke-result">
          {!isFormalProvider(result.ai_meta.source) || !result.ai_meta.responseId ? (
            <p className="ai-warning">此結果不是正式 AI 判定，不能顯示通過。</p>
          ) : null}
          <dl>
            <div>
              <dt>AI 來源</dt>
              <dd>{result.ai_meta.source}</dd>
            </div>
            <div>
              <dt>Response ID</dt>
              <dd>{result.ai_meta.responseId}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{result.ai_meta.model}</dd>
            </div>
            <div>
              <dt>overall_status</dt>
              <dd>{result.overall_status}</dd>
            </div>
            <div>
              <dt>is_vehicle_visible</dt>
              <dd>{String(result.is_vehicle_visible)}</dd>
            </div>
            <div>
              <dt>detected_view</dt>
              <dd>{result.detected_view}</dd>
            </div>
            <div>
              <dt>expected_view_match</dt>
              <dd>{result.expected_view_match}</dd>
            </div>
            <div>
              <dt>retake_required</dt>
              <dd>{String(result.retake_required)}</dd>
            </div>
          </dl>
          <p>{result.customer_message}</p>
          <p>{result.evidence}</p>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </form>
  );
}

function isRealAiResult(result: FinalPhotoInspectionResult | null | undefined) {
  return isFormalProvider(result?.ai_meta?.source) && typeof result?.ai_meta?.responseId === "string" && result.ai_meta.responseId.length > 0;
}

function isFormalProvider(source: string | null | undefined) {
  return source === "school-relay" || source === "openai";
}

function photoIdForAngle(angle: ClientPhotoAngle) {
  return `photo-${angle}`;
}

function getAiPhotoForAngle(result: FinalPhotoInspectionResult, angle: ClientPhotoAngle) {
  const photoId = photoIdForAngle(angle);
  return result.photos.find((photo) => photo.photo_id === photoId) ?? result.photos.find((photo) => normalizeDetectedAngle(photo.detected_view) === angle) ?? null;
}

function statusFromAiPhoto(result: FinalPhotoInspectionResult, aiPhoto: FinalPhotoInspectionResult["photos"][number] | null, angle: ClientPhotoAngle): ClientPhotoStatus {
  if (!isRealAiResult(result) || !aiPhoto) return "uploaded";
  if (missingAreaForAngle(angle) && result.missingAngles.includes(missingAreaForAngle(angle)!)) return "retake_required";
  return aiPhoto.retake_required ? "retake_required" : "passed";
}

function hintFromAiPhoto(result: FinalPhotoInspectionResult, aiPhoto: FinalPhotoInspectionResult["photos"][number] | null, angle: ClientPhotoAngle) {
  if (!isRealAiResult(result)) return "尚未取得正式 AI 判定，不能顯示通過。";
  const missingArea = missingAreaForAngle(angle);
  const missingIssue = result.detectedIssues.find((issue) => issue.issueType === "missing_photo" && issue.area === missingArea);
  if (missingIssue) return missingIssue.reason;
  return aiPhoto?.customer_message ?? result.final_decision.customer_message;
}

function missingAreaForAngle(angle: ClientPhotoAngle) {
  if (angle === "dashboard") return "interior";
  if (angle === "front" || angle === "rear" || angle === "left" || angle === "right" || angle === "interior") return angle;
  return null;
}

function normalizeDetectedAngle(view: string): ClientPhotoAngle | null {
  if (view === "front" || view === "rear" || view === "interior") return view;
  if (view === "left_side") return "left";
  if (view === "right_side") return "right";
  return null;
}

function expectedViewForAngle(angle: ClientPhotoAngle): ExpectedVehicleView {
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  return "any";
}

function viewLabel(view: string) {
  const map: Record<string, string> = {
    front: "車頭",
    rear: "車尾",
    left_side: "左側",
    right_side: "右側",
    interior: "內裝",
    wheel: "輪胎",
    unknown: "不明",
    any: "任意車輛角度",
    front_or_rear: "車頭或車尾"
  };

  return map[view] ?? view;
}

function levelLabel(level: string) {
  const map: Record<string, string> = {
    none: "無",
    minor: "輕微",
    moderate: "中度",
    severe: "嚴重",
    unknown: "不明"
  };

  return map[level] ?? level;
}

function fileToPreviewDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("照片讀取失敗"));
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const image = new Image();
      image.onerror = () => resolve(raw);
      image.onload = () => {
        const maxSize = 900;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(raw);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
