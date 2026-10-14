import React from 'react';
import {demoCaseToCompanyReturnCase} from '../lib/demoApi';
import {CaseRecognitionPanel} from '../components/RecognitionWorkspace';
import { ArrowRight, Camera, CheckCircle2, MessageSquareText } from "lucide-react";
import { defaultClientSubmission, photoAngleLabels } from "../data/clientSubmissions";
import { clientPreCheck } from "../lib/assessmentEngine";
import type { ClientPhotoAngle, ClientReturnSubmission } from "../types/client";

export function ClientReturnResultPage() {
  const [submission,setSubmission] = React.useState(readSubmission);
  const syncedCaseId = new URLSearchParams(window.location.search).get("case") || sessionStorage.getItem("irentGuardLatestCaseId");
  const [loading,setLoading] = React.useState(Boolean(syncedCaseId));
  const [error,setError] = React.useState('');
  React.useEffect(()=>{let live=true;if(!syncedCaseId){setLoading(false);return;}setLoading(true);fetch('/api/demo/submissions/'+encodeURIComponent(syncedCaseId)).then(async r=>{if(!r.ok)throw new Error('無法讀取此案件的保存收據，請確認工作階段與服務連線。');return r.json();}).then(record=>{if(live)setSubmission(demoCaseToCompanyReturnCase(record).submission);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[syncedCaseId]);
  const preCheck = clientPreCheck(submission);
  const uploadedCount = submission.photos.filter((photo) => photo.status !== "missing").length;
  const passed = submission.photos.filter((photo) => photo.status === "passed" && hasFormalAiResult(photo.aiInspectionRaw)).map((photo) => photo.angle);
  const manualReview = submission.photos
    .filter((photo) => photo.status === "manual_review" || photo.status === "needs_manual_review" || photo.status === "ai_unavailable")
    .map((photo) => photo.angle);
  const aiUnavailable = submission.photos.filter((photo) => photo.status === "ai_unavailable" || photo.aiInspectionRaw?.ai_meta?.resultKind === "ai_unavailable").map((photo) => photo.angle);
  const retakeOrFailed = submission.photos
    .filter((photo) => photo.status === "retake_required" || photo.status === "failed" || photo.status === "uploaded")
    .map((photo) => photo.angle);
  if(loading)return <main className="page"><p role="status">正在從伺服器讀回案件收據與保存結果…</p></main>;
  if(error||!syncedCaseId)return <main className="page"><section className="panel-section"><h1>尚未讀到保存收據</h1><p role="alert">{error||'請先完成還車資料送出。'}</p><a href="/client/return" className="primary-button">返回還車流程</a></section></main>;

  return (
    <main className="page client-result-page">
      <section className="result-phone">
        <div className="phone-status">iRent Guard</div>
        <CheckCircle2 className="result-icon" size={48} />
        <h1>{manualReview.length || retakeOrFailed.length ? "照片已送人工覆核" : "還車紀錄已送出"}</h1>
        <p>案件編號：{submission.submissionId}</p>
        {manualReview.length || retakeOrFailed.length ? <p role="alert">已收件，尚未通過還車檢核。照片內容、車輛角度及畫質仍需人工確認；不代表車輛無損或可出租。</p> : null}
        <div className="result-list">
          <div><strong>車輛資訊</strong><span>{submission.vehicleId}｜{submission.vehicleModel}</span></div>
          <div><strong>還車站點</strong><span>{submission.returnStation}</span></div>
          <div><strong>已上傳照片</strong><span>{uploadedCount} / {submission.photos.length} 張</span></div>
          <div><strong>AI 初步狀態</strong><span>{preCheck.statusLabel}</span></div>
          <div><strong>公司端同步</strong><span>{syncedCaseId ? `已同步 ${syncedCaseId}` : "同步暫時失敗，請重新送出"}</span></div>
          <div><strong>已通過</strong><span>{passed.length > 0 ? formatAngles(passed) : "尚無"}</span></div>
          <div><strong>需人工覆核</strong><span>{manualReview.length > 0 ? formatAngles(manualReview) : "尚無"}</span></div>
          <div><strong>AI 暫時不可用</strong><span>{aiUnavailable.length > 0 ? formatAngles(aiUnavailable) : "尚無"}</span></div>
          <div><strong>需補拍或重試</strong><span>{retakeOrFailed.length > 0 ? formatAngles(retakeOrFailed) : "目前無補拍提醒"}</span></div>
        </div>
        <article className="client-check-card">
          <Camera size={18} />
          <p>{aiUnavailable.length > 0 ? "AI 檢核暫時不可用，您的照片已保存，將交由客服人工覆核。" : preCheck.hints[0]}</p>
        </article>
        <article className="client-check-card">
          <MessageSquareText size={18} />
          <p>{submission.textNote || submission.voiceNote || "未填寫額外備註"}</p>
        </article>
        <p className="client-note">此頁僅顯示租客需要知道的還車狀態；若需要客服協助，團隊會於必要時聯繫。</p>
        <a className="primary-button" href="/client">
          查看送出紀錄 <ArrowRight size={18} />
        </a>
      </section>
      <CaseRecognitionPanel caseId={syncedCaseId||submission.submissionId} returnTo={"/client/return-result?case="+encodeURIComponent(syncedCaseId||submission.submissionId)}/>
    </main>
  );
}

function formatAngles(angles: ClientPhotoAngle[]) {
  return angles.map((angle) => photoAngleLabels[angle]).join("、");
}

function readSubmission(): ClientReturnSubmission {
  const raw = sessionStorage.getItem("irentGuardClientSubmission");
  if (!raw) return defaultClientSubmission;
  try {
    return JSON.parse(raw) as ClientReturnSubmission;
  } catch {
    return defaultClientSubmission;
  }
}

function hasFormalAiResult(result: ClientReturnSubmission["photos"][number]["aiInspectionRaw"]) {
  const source = result?.ai_meta?.source;
  const responseId = result?.ai_meta?.responseId;
  return (source === "school-relay" || source === "openai") && typeof responseId === "string" && responseId.length > 0;
}
