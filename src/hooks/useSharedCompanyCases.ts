import React from "react";
import { companyReturnCases } from "../data/companyCases";
import { demoCaseToCompanyReturnCase, fetchLatestDemoCase } from "../lib/demoApi";
import type { CompanyReturnCase } from "../types/company";

export function useSharedCompanyCases() {
  const [latestCase, setLatestCase] = React.useState<CompanyReturnCase | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null);

  const refreshLatestCase = React.useCallback(async () => {
    const demoCase = await fetchLatestDemoCase();
    if (!demoCase) {
      setLatestCase(null);
      return;
    }
    setLatestCase(demoCaseToCompanyReturnCase(demoCase));
    setLastUpdatedAt(demoCase.updatedAt);
  }, []);

  React.useEffect(() => {
    void refreshLatestCase();
    const timer = window.setInterval(() => void refreshLatestCase(), 3000);
    return () => window.clearInterval(timer);
  }, [refreshLatestCase]);

  const cases = React.useMemo(() => {
    if (!latestCase) return companyReturnCases;
    return [latestCase, ...companyReturnCases.filter((item) => item.assessmentId !== latestCase.assessmentId)];
  }, [latestCase]);

  return { cases, latestCase, lastUpdatedAt, refreshLatestCase };
}
