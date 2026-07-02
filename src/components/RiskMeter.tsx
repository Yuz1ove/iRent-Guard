import type { CSSProperties } from "react";

interface RiskMeterProps {
  score: number;
  label?: string;
  size?: number;
}

export function RiskMeter({ score, label = "總風險分數", size = 148 }: RiskMeterProps) {
  const color = score >= 70 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 30 ? "#facc15" : "#22c55e";
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <div className="risk-meter" style={{ "--risk-color": color, "--risk-size": `${size}px` } as CSSProperties}>
      <div className="risk-ring">
        <svg aria-hidden="true" viewBox="0 0 100 100">
          <circle className="risk-track" cx="50" cy="50" r={radius} />
          <circle
            className="risk-progress"
            cx="50"
            cy="50"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="risk-value">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>
      <p>{label}</p>
    </div>
  );
}
