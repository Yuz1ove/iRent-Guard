import type { RiskBreakdown, RiskBreakdownItem, RiskScoreFormula } from "../types/assessment";

type RiskBreakdownCategory = "damage" | "cleanliness" | "energy" | "safety" | "dispute";

const labels: Record<RiskBreakdownCategory, string> = {
  damage: "外觀/車損",
  cleanliness: "車內清潔",
  energy: "能源狀態",
  safety: "安全/車聯網",
  dispute: "爭議風險"
};

const maxScores: Record<RiskBreakdownCategory, number> = {
  damage: 30,
  cleanliness: 15,
  energy: 20,
  safety: 25,
  dispute: 10
};

const categoryKeys = Object.keys(labels) as RiskBreakdownCategory[];

export function RiskBreakdown({ breakdown }: { breakdown: RiskBreakdown }) {
  const formula = normalizeFormula(breakdown);
  const lineItems = normalizeLineItems(breakdown);

  return (
    <div className="risk-breakdown">
      <div className="risk-formula">
        <div className="risk-formula-header">
          <span className="badge neutral">{breakdown.scoreDisclaimer ?? "Demo 模擬分數，非正式判責結果"}</span>
          <strong>finalRisk = baseScore + photoRisk + noteRisk + orderPressureRisk - mitigationScore</strong>
        </div>
        <dl className="risk-formula-grid">
          <div><dt>baseScore</dt><dd>+{formula.baseScore}</dd></div>
          <div><dt>photoRisk</dt><dd>+{formula.photoRisk}</dd></div>
          <div><dt>noteRisk</dt><dd>+{formula.noteRisk}</dd></div>
          <div><dt>orderPressureRisk</dt><dd>+{formula.orderPressureRisk}</dd></div>
          <div><dt>mitigationScore</dt><dd>-{formula.mitigationScore}</dd></div>
        </dl>
        <div className="risk-score-line">
          <span>顯示分數：<strong>{formula.finalRisk} / 100</strong></span>
          <span>原始累積：<strong>{formula.rawScore}</strong>{formula.clamped ? "（已依上限 clamp）" : ""}</span>
        </div>
      </div>

      <div className="risk-source-list" aria-label="風險分數來源">
        {lineItems.map((item) => (
          <div className={item.points < 0 ? "risk-source-item mitigation" : "risk-source-item"} key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </div>
            <b>{formatPoints(item.points)}</b>
          </div>
        ))}
      </div>

      <div className="risk-category-bars" aria-label="五大風險類別">
        {categoryKeys.map((key) => {
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
    </div>
  );
}

function normalizeFormula(breakdown: RiskBreakdown): RiskScoreFormula {
  if (breakdown.formula) return breakdown.formula;
  const photoRisk = breakdown.damage + breakdown.cleanliness;
  const noteRisk = breakdown.energy + breakdown.safety + breakdown.dispute;
  const rawScore = photoRisk + noteRisk;
  const finalRisk = Math.max(0, Math.min(100, rawScore));
  return {
    baseScore: 0,
    photoRisk,
    noteRisk,
    orderPressureRisk: 0,
    mitigationScore: 0,
    rawScore,
    finalRisk,
    clamped: rawScore !== finalRisk
  };
}

function normalizeLineItems(breakdown: RiskBreakdown): RiskBreakdownItem[] {
  if (breakdown.lineItems?.length) return breakdown.lineItems;
  return categoryKeys
    .filter((key) => breakdown[key] > 0)
    .map((key) => ({
      id: `legacy-${key}`,
      label: labels[key],
      description: "由既有五大風險分類回推的 Demo 模擬來源。",
      points: breakdown[key],
      component: key === "damage" || key === "cleanliness" ? "photoRisk" : "noteRisk",
      category: key
    }));
}

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : `${points}`;
}
