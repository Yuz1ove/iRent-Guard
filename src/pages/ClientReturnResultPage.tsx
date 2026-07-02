import { ArrowRight, Camera, CheckCircle2, MessageSquareText } from "lucide-react";
import { defaultClientSubmission } from "../data/clientSubmissions";
import { clientPreCheck } from "../lib/assessmentEngine";
import type { ClientReturnSubmission } from "../types/client";

export function ClientReturnResultPage() {
  const submission = readSubmission();
  const preCheck = clientPreCheck(submission);
  const uploadedCount = submission.photos.filter((photo) => photo.status !== "missing").length;

  return (
    <main className="page client-result-page">
      <section className="result-phone">
        <div className="phone-status">iRent Guard</div>
        <CheckCircle2 className="result-icon" size={48} />
        <h1>還車紀錄已送出</h1>
        <p>案件編號：{submission.submissionId}</p>
        <div className="result-list">
          <div><strong>車輛資訊</strong><span>{submission.vehicleId}｜{submission.vehicleModel}</span></div>
          <div><strong>還車站點</strong><span>{submission.returnStation}</span></div>
          <div><strong>已上傳照片</strong><span>{uploadedCount} / {submission.photos.length} 張</span></div>
          <div><strong>AI 初步狀態</strong><span>{preCheck.statusLabel}</span></div>
          <div><strong>是否需要補拍</strong><span>{preCheck.retakePhotoAngles.length > 0 ? "建議補充部分角度" : "目前無補拍提醒"}</span></div>
        </div>
        <article className="client-check-card">
          <Camera size={18} />
          <p>{preCheck.hints[0]}</p>
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
    </main>
  );
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
