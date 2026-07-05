import type { CaseAssessment } from "../types/assessment";
import { decisionLabels, minutesLabel } from "../lib/formatters";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import type { KeyboardEvent } from "react";

interface VehicleTableProps {
  rows: CaseAssessment[];
  selectedId: string;
  onSelect: (id: string) => void;
  descending: boolean;
  onToggleSort: () => void;
}

export function VehicleTable({ rows, selectedId, onSelect, descending, onToggleSort }: VehicleTableProps) {
  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(id);
  }

  return (
    <div className="table-shell">
      <table className="vehicle-table">
        <colgroup>
          <col className="col-vehicle" />
          <col className="col-location" />
          <col className="col-next" />
          <col className="col-risk" />
          <col className="col-status" />
          <col className="col-decision" />
          <col className="col-priority" />
        </colgroup>
        <thead>
          <tr>
            <th>車號</th>
            <th>地點</th>
            <th>下一筆訂單</th>
            <th>
              <button className="table-sort" onClick={onToggleSort} type="button">
                風險分數 {descending ? "↓" : "↑"}
              </button>
            </th>
            <th>狀態</th>
            <th>建議處置</th>
            <th>派工</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ returnCase, assessment }) => (
            <tr
              aria-label={`查看 ${returnCase.vehicleId} 案件詳情`}
              aria-selected={returnCase.id === selectedId}
              className={returnCase.id === selectedId ? "active" : ""}
              key={returnCase.id}
              onClick={() => onSelect(returnCase.id)}
              onKeyDown={(event) => handleRowKeyDown(event, returnCase.id)}
              role="button"
              tabIndex={0}
            >
              <td className="vehicle-cell">
                <strong>{returnCase.vehicleId}</strong>
                <small>{returnCase.model}</small>
              </td>
              <td className="truncate-cell">{returnCase.location}</td>
              <td className="numeric-cell">{minutesLabel(returnCase.nextBookingMinutes)}</td>
              <td className="numeric-cell">
                <strong className="risk-number">{assessment.riskScore}</strong>
              </td>
              <td>
                <StatusBadge status={assessment.status} />
              </td>
              <td className="truncate-cell">{decisionLabels[assessment.nextBookingDecision]}</td>
              <td className="priority-cell">
                <PriorityBadge priority={assessment.dispatchPriority} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
