import type { RiskBreakdown } from "../types/assessment";

const labels: Record<keyof RiskBreakdown, string> = {
  damage: "外觀/車損",
  cleanliness: "車內清潔",
  energy: "能源狀態",
  safety: "安全/車聯網",
  dispute: "爭議風險"
};

const maxScores: Record<keyof RiskBreakdown, number> = {
  damage: 30,
  cleanliness: 15,
  energy: 20,
  safety: 25,
  dispute: 10
};

export function RiskBreakdown({ breakdown }: { breakdown: RiskBreakdown }) {
  return (
    <div className="risk-breakdown">
      {(Object.keys(labels) as Array<keyof RiskBreakdown>).map((key) => {
        const value = breakdown[key];
        const percent = (value / maxScores[key]) * 100;
        return (
          <div className="breakdown-row" key={key}>
            <div>
              <span>{labels[key]}</span>
              <strong>
                {value}/{maxScores[key]}
              </strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
