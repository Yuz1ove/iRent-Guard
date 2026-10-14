import React from "react";
import { Camera, Check, Clipboard, ImageIcon, MessageCircleWarning, RefreshCcw, UserCheck } from "lucide-react";
import { statusLabels } from "../lib/formatters";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { patchDemoCase } from "../lib/demoApi";
import type { CompanyReturnCase } from "../types/company";
import type { ClientPhoto, ClientPhotoStatus } from "../types/client";
import { EvidenceCard } from "../components/EvidenceCard";
import { SupportPhotoInspectionPanel } from "../components/support/SupportPhotoInspectionPanel";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";

type ReplyMode = "default" | "soft" | "short";

export function CustomerServicePage() {
  const { cases, latestCase, refreshLatestCase } = useSharedCompanyCases();
  const [selectedId, setSelectedId] = React.useState("AST-20260629-0004");
  const autoSelectedLatestRef = React.useRef<string | null>(null);
  const [mode, setMode] = React.useState<ReplyMode>("default");
  const [copied, setCopied] = React.useState(false);
  const [manual, setManual] = React.useState(false);
  const [tracked, setTracked] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState("");
  const selected = cases.find((item) => item.assessmentId === selectedId) ?? cases[0];
  const reply = buildReply(selected, mode);
  const disputeLevel = selected.assessment.riskBreakdown.dispute >= 8 ? "高" : selected.assessment.riskBreakdown.dispute >= 4 ? "中" : "低";

  React.useEffect(() => {
    setMode("default");
    setCopied(false);
    setManual(false);
    setTracked(false);
    setStatusMessage("");
  }, [selectedId]);

  React.useEffect(() => {
    if (latestCase && autoSelectedLatestRef.current !== latestCase.assessmentId) {
      autoSelectedLatestRef.current = latestCase.assessmentId;
      setSelectedId(latestCase.assessmentId);
    }
  }, [latestCase]);

  async function copyReply() {
    try {
      await navigator.clipboard?.writeText(reply);
    } catch {
      // Clipboard permission can be unavailable in preview browsers.
    }
    setCopied(true);
    showStatus("客服建議回覆已複製");
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function markManualReview() {
    setManual((value) => !value);
    if (selected.submission.submissionId.startsWith("CASE-")) {
      await patchDemoCase(selected.submission.submissionId, { status: "under_review" });
      await refreshLatestCase();
    }
    showStatus(manual ? "已取消人工處理標記" : "已標記需人工處理");
  }

  function chooseMode(nextMode: ReplyMode) {
    setMode(nextMode);
    showStatus(nextMode === "soft" ? "已切換為更委婉版本" : nextMode === "short" ? "已切換為更簡短版本" : "已切換為標準版本");
  }

  function showStatus(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 1700);
  }

  return (
    <main className="page service-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Company customer service</p>
          <h1>公司端客服摘要工作台</h1>
        </div>
        <span className="live-indicator">Neutral response generator</span>
      </div>

      <section className="service-layout">
        <aside className="case-list">
          <h2>案件列表</h2>
          {cases.map((item) => (
            <button
              className={item.assessmentId === selectedId ? "selected" : ""}
              key={item.assessmentId}
              onClick={() => setSelectedId(item.assessmentId)}
              aria-pressed={item.assessmentId === selectedId}
              type="button"
            >
              <strong>{item.submission.orderId}</strong>
              <span>{item.submission.vehicleId}｜{item.scenarioName}</span>
              <small>問題類型：{getCaseIssueType(item)}</small>
              <small>最後更新：{new Date(item.auditTrail[item.auditTrail.length - 1].time).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</small>
              <div className="support-badges">
                <StatusBadge status={item.assessment.status} />
                <span className={`badge ${item.assessment.manualReviewRequired ? "warning" : "success"}`}>{item.assessment.manualReviewRequired ? "需人工覆核" : "可標準處理"}</span>
              </div>
            </button>
          ))}
        </aside>

        <section className="support-panel">
          <div className="support-header">
            <div>
              <p className="eyebrow">{selected.submission.vehicleId}</p>
              <h2>{selected.scenarioName}</h2>
              <p>{selected.submission.returnStation}｜{selected.submission.vehicleModel}</p>
            </div>
            <div className="support-badges">
              <span className={`badge ${disputeLevel === "高" ? "danger" : disputeLevel === "中" ? "warning" : "success"}`}>爭議風險 {disputeLevel}</span>
              <PriorityBadge priority={selected.assessment.dispatchPriority} />
            </div>
          </div>

          <CasePhotoAttachmentPanel photos={selected.submission.photos} />

          <div className="support-grid">
            <article className="support-card">
              <h3>租客原始描述</h3>
              <p>{[selected.submission.voiceNote, selected.submission.textNote, ...selected.submission.quickNotes].filter(Boolean).join("，") || "租客未留下額外描述。"}</p>
            </article>
            <article className="support-card">
              <h3>AI 整理後問題摘要</h3>
              <p>{selected.assessment.customerSummary}</p>
            </article>
          </div>

          <div className="support-grid">
            <article className="support-card">
              <h3>內部注意事項</h3>
              <p>涉及賠償或責任歸屬一律人工覆核；歷史問題不得直接判定新租客責任；安全風險優先處理。</p>
            </article>
            <article className="support-card">
              <h3>建議客服動作</h3>
              <p>目前車輛狀態為「{statusLabels[selected.assessment.status]}」。請保留照片、語音、車聯網與歷史工單，再依 evidence trail 回覆。</p>
            </article>
          </div>

          <SupportPhotoInspectionPanel caseId={selected.submission.submissionId} />

          <article className="support-card">
            <h3>系統證據鏈</h3>
            <div className="evidence-grid">
              {selected.assessment.evidenceCards.slice(0, 4).map((evidence) => <EvidenceCard evidence={evidence} key={evidence.id} />)}
            </div>
          </article>

          <article className="support-card ai-reply-card">
            <div className="section-heading inline">
              <div>
                <p className="eyebrow">AI suggested reply</p>
                <h3>AI 客服建議回覆</h3>
              </div>
              <span className="reply-mode">{mode === "soft" ? "更委婉版本" : mode === "short" ? "更簡短版本" : "標準版本"}</span>
            </div>
            <p>{reply}</p>
            {statusMessage ? <div className="support-action-status">{statusMessage}</div> : null}
            <div className="button-row">
              <button className="primary-button" onClick={copyReply} type="button">
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
                {copied ? "已複製" : "複製回覆"}
              </button>
              <button className={manual ? "secondary-button selected" : "secondary-button"} onClick={() => void markManualReview()} type="button">
                <UserCheck size={18} /> {manual ? "已標記人工" : "標記需人工處理"}
              </button>
              <button className={mode === "default" ? "secondary-button selected" : "secondary-button"} onClick={() => chooseMode("default")} type="button">
                <RefreshCcw size={18} /> 標準版本
              </button>
              <button className={mode === "soft" ? "secondary-button selected" : "secondary-button"} onClick={() => chooseMode("soft")} type="button">
                <RefreshCcw size={18} /> 更委婉版本
              </button>
              <button className={mode === "short" ? "secondary-button selected" : "secondary-button"} onClick={() => chooseMode("short")} type="button">
                <MessageCircleWarning size={18} /> 產生更簡短版本
              </button>
              <button className={tracked ? "secondary-button selected" : "secondary-button"} onClick={() => { setTracked(true); showStatus("已建立客服追蹤紀錄"); }} type="button">
                <Clipboard size={18} /> {tracked ? "已建立追蹤" : "建立客服追蹤紀錄"}
              </button>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function CasePhotoAttachmentPanel({ photos }: { photos: ClientPhoto[] }) {
  const attachedCount = photos.filter((photo) => getPhotoUrl(photo)).length;
  const visiblePhotos = photos.slice(0, 6);

  return (
    <article className="support-card case-photo-attachments">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">照片附件</p>
          <h3>還車照片附件</h3>
        </div>
        <span className="badge neutral">{attachedCount > 0 ? `${attachedCount} 張附圖` : "待附圖"}</span>
      </div>
      <div className="case-photo-grid">
        {visiblePhotos.map((photo) => {
          const photoUrl = getPhotoUrl(photo);
          return (
            <section className="case-photo-card" key={photo.id}>
              {photoUrl ? (
                <img alt={photo.label} src={photoUrl} />
              ) : (
                <div className="case-photo-placeholder">
                  <Camera size={22} />
                </div>
              )}
              <div>
                <strong><ImageIcon size={14} /> {photo.label}</strong>
                <span className={`badge ${photoStatusBadgeClass(photo.status)}`}>{photoStatusLabel(photo.status)}</span>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function buildReply(item: CompanyReturnCase, mode: ReplyMode) {
  if (mode === "short") {
    return `您好，訂單 ${item.submission.orderId} 已完成初步車況檢核。系統已保留相關照片、語音與車聯網紀錄；若需確認責任，將由客服人工覆核後再與您聯繫。`;
  }
  if (mode === "soft") {
    return `您好，謝謝您回報訂單 ${item.submission.orderId} 的車況。系統已收到您的還車資料，並依照片、備註、車聯網訊號與歷史紀錄進行初步整理。目前結果僅作為輔助判斷，我們會保留完整紀錄並安排後續確認，避免在資訊不足時直接判定責任。`;
  }
  return item.assessment.customerSummary;
}

function getCaseIssueType(item: CompanyReturnCase) {
  const text = [
    item.scenarioName,
    item.submission.voiceNote,
    item.submission.textNote,
    ...item.submission.quickNotes,
    ...item.assessment.evidenceCards.map((card) => card.title),
    ...item.assessment.recommendedActions.map((action) => `${action.label} ${action.description}`)
  ].join(" ");

  if (item.telematics.tirePressureLow || /胎壓|輪胎|左後輪|右後輪/.test(text)) return "胎壓異常";
  if (item.telematics.dtcWarning || /故障燈|警示燈|煞車|維修|安全/.test(text)) return "故障燈 / 維修風險";
  if (/垃圾|髒|汙|污|飲料|杯架|煙味|異味|清潔/.test(text)) return "車內髒污";
  if (/低電|低油|電量|油量|充電|補電|加油/.test(text)) return "低電量 / 低油量";
  if (/刮傷|凹陷|保險桿|車門|外觀|損傷|擦撞|掉漆/.test(text)) return "外觀損傷";
  if (/補拍|缺漏|照片/.test(text) && item.assessment.recommendedActions.some((action) => action.actionType === "retake_photo")) return "照片缺漏 / 需補拍";
  return item.scenarioName === "正常還車" ? "一般回報" : item.scenarioName;
}

function getPhotoUrl(photo: ClientPhoto) {
  return photo.imageUrl ?? photo.previewUrl ?? "";
}

function photoStatusLabel(status: ClientPhotoStatus) {
  const labels: Record<ClientPhotoStatus, string> = {
    missing: "未附圖",
    uploaded: "已附圖",
    checking: "AI 檢核中",
    passed: "已檢核",
    retake_required: "需補拍"
  };
  return labels[status];
}

function photoStatusBadgeClass(status: ClientPhotoStatus) {
  if (status === "passed") return "success";
  if (status === "retake_required" || status === "checking") return "warning";
  if (status === "uploaded") return "neutral";
  return "hold";
}
