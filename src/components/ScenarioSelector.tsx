import type { ReturnCase } from "../types/assessment";

interface ScenarioSelectorProps {
  cases: ReturnCase[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ScenarioSelector({ cases, selectedId, onSelect }: ScenarioSelectorProps) {
  return (
    <div className="scenario-grid">
      {cases.map((item) => (
        <button
          className={item.id === selectedId ? "selected" : ""}
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.scenarioName}
        </button>
      ))}
    </div>
  );
}
