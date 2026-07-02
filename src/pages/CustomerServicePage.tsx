import React from "react";
import { Check, Clipboard, MessageCircleWarning, RefreshCcw, UserCheck } from "lucide-react";
import { statusLabels } from "../lib/formatters";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { patchDemoCase } from "../lib/demoApi";
import type { CompanyReturnCase } from "../types/company";
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
  const selected = cases.find((item) => item.assessmentId === selectedId) ?? cases[0];
  const reply = buildReply(selected, mode);
  const disputeLevel = selected.assessment.riskBreakdown.dispute >= 8 ? "高" : selected.assessment.riskBreakdown.dispute >= 4 ? "中" : "低";

  React.useEffect(() => {
    setMode("default");
    setCopied(false);
    setManual(false);
    setTracked(false);
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
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function markManualReview() {
    setManual((value) => !value);
    if (selected.submission.submissionId.startsWith("CASE-")) {
      await patchDemoCase(selected.submission.submissionId, { status: "under_review" });
      await refreshLatestCase();
    }
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
              type="button"
            >
              <strong>{item.submission.orderId}</strong>
              <span>{item.submission.vehicleId}｜{item.scenarioName}</span>
              <small>問題類型：{item.assessment.evidenceCards[0]?.title ?? "一般回報"}</small>
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
            <div className="button-row">
              <button className="primary-button" onClick={copyReply} type="button">
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
                {copied ? "已複製" : "複製回覆"}
              </button>
              <button className={manual ? "secondary-button selected" : "secondary-button"} onClick={() => void markManualReview()} type="button">
                <UserCheck size={18} /> {manual ? "已標記人工" : "標記需人工處理"}
              </button>
              <button className="secondary-button" onClick={() => setMode("soft")} type="button">
                <RefreshCcw size={18} /> 產生更委婉版本
              </button>
              <button className="secondary-button" onClick={() => setMode("short")} type="button">
                <MessageCircleWarning size={18} /> 產生更簡短版本
              </button>
              <button className={tracked ? "secondary-button selected" : "secondary-button"} onClick={() => setTracked(true)} type="button">
                <Clipboard size={18} /> {tracked ? "已建立追蹤" : "建立客服追蹤紀錄"}
              </button>
            </div>
          </article>
        </section>
      </section>
    </main>
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
