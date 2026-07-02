import React from "react";
import { CheckCircle2, ClipboardList, Filter, Wrench } from "lucide-react";
import { useSharedCompanyCases } from "../hooks/useSharedCompanyCases";
import { patchDemoCase } from "../lib/demoApi";
import type { DispatchPriority, RecommendedAction } from "../types/assessment";
import type { CompanyReturnCase } from "../types/company";

const roleLabels: Record<string, string> = {
  customer: "租客",
  ops: "營運",
  cleaning_team: "清潔團隊",
  maintenance_team: "維修團隊",
  customer_service: "客服"
};

const typeLabels: Record<string, string> = {
  cleaning: "清潔",
  charge_or_refuel: "補電/加油",
  repair: "維修",
  retake_photo: "複拍",
  manual_review: "人工覆核",
  reassign_booking: "改派",
  keep_booking: "放行"
};

export function WorkOrdersPage() {
  const [toast, setToast] = React.useState("");
  const { cases, latestCase, lastUpdatedAt, refreshLatestCase } = useSharedCompanyCases();
  const workOrders = cases.flatMap((item) =>
    item.assessment.recommendedActions
      .filter((action) => action.actionType !== "keep_booking")
      .map((action, index) => buildWorkOrder(item, action, index))
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  async function updateLatestCaseStatus(status: "work_order_created" | "resolved") {
    if (latestCase?.submission.submissionId.startsWith("CASE-")) {
      await patchDemoCase(latestCase.submission.submissionId, { status });
      await refreshLatestCase();
    }
  }

  return (
    <main className="page work-orders-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Company work orders</p>
          <h1>公司端工單派工</h1>
        </div>
        <span className="live-indicator"><ClipboardList size={16} /> {lastUpdatedAt ? "Shared actions synced" : "Actions synced"}</span>
      </div>

      <section className="batch-bar">
        <button className="secondary-button" onClick={() => showToast(`目前顯示 ${workOrders.length} 筆由 assessment actions 產生的工單`)} type="button"><Filter size={18} /> 全部工單</button>
        <button className="primary-button" onClick={() => { void updateLatestCaseStatus("work_order_created"); showToast("已將待處理維修工單加入派工佇列"); }} type="button"><Wrench size={18} /> 批次建立維修工單</button>
        <button className="secondary-button" onClick={() => { void updateLatestCaseStatus("resolved"); showToast("已匯出今日工單與 AI action 對照 JSON"); }} type="button"><CheckCircle2 size={18} /> 匯出今日 AI 判讀紀錄</button>
      </section>

      <section className="work-order-table-shell">
        <table className="work-order-table">
          <thead>
            <tr>
              <th>工單編號</th>
              <th>類型</th>
              <th>車號 / 站點</th>
              <th>來源 Assessment</th>
              <th>優先序</th>
              <th>預估處理</th>
              <th>負責角色</th>
              <th>影響下一筆</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((order) => (
              <tr key={order.id}>
                <td><strong>{order.id}</strong></td>
                <td>{typeLabels[order.type]}</td>
                <td>{order.vehicleId}<small>{order.station}</small></td>
                <td>{order.assessmentId}</td>
                <td><span className={`badge priority-${order.priority}`}>{priorityText(order.priority)}</span></td>
                <td>{order.estimatedMinutes} 分鐘</td>
                <td>{roleLabels[order.ownerRole]}</td>
                <td>{order.blockingNextBooking ? "是" : "否"}</td>
                <td>{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

function buildWorkOrder(item: CompanyReturnCase, action: RecommendedAction, index: number) {
  return {
    id: `WO-${item.assessmentId.replace("AST-", "")}-${index + 1}`,
    type: action.actionType,
    vehicleId: item.submission.vehicleId,
    station: item.submission.returnStation,
    assessmentId: item.assessmentId,
    priority: action.priority,
    estimatedMinutes: action.estimatedMinutes,
    ownerRole: action.ownerRole,
    blockingNextBooking: action.blockingNextBooking,
    status: workOrderStatus(action, index)
  };
}

function workOrderStatus(action: RecommendedAction, index: number) {
  if (action.actionType === "manual_review" && !action.blockingNextBooking) return "已取消";
  if (action.blockingNextBooking) return "待處理";
  if (action.actionType === "retake_photo") return "已完成";
  if (index % 5 === 4) return "已取消";
  return "處理中";
}

function priorityText(priority: DispatchPriority) {
  return priority === "critical" ? "最高" : priority === "high" ? "高" : priority === "medium" ? "中" : "低";
}
