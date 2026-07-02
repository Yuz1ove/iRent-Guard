import React from "react";
import { createRoot } from "react-dom/client";
import { AppHeader } from "./components/AppHeader";
import { ClientLandingPage } from "./pages/ClientLandingPage";
import { ClientReturnPage } from "./pages/ClientReturnPage";
import { ClientReturnResultPage } from "./pages/ClientReturnResultPage";
import { CompanyLandingPage } from "./pages/CompanyLandingPage";
import { CustomerServicePage } from "./pages/CustomerServicePage";
import { DemoClientPage } from "./pages/DemoClientPage";
import { DemoCompanyPage } from "./pages/DemoCompanyPage";
import { LandingPage } from "./pages/LandingPage";
import { OpsDashboardPage } from "./pages/OpsDashboardPage";
import { ReturnReviewPage } from "./pages/ReturnReviewPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import "./styles.css";

function App() {
  const [path, setPath] = React.useState(window.location.pathname);

  React.useEffect(() => {
    const handleNavigation = () => setPath(window.location.pathname);
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return;
      event.preventDefault();
      window.history.pushState({}, "", href);
      handleNavigation();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", handleNavigation);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("popstate", handleNavigation);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  React.useEffect(() => {
    const redirects: Record<string, string> = {
      "/return-review": "/company/return-review",
      "/ops-dashboard": "/company/ops-dashboard",
      "/customer-service": "/company/customer-service"
    };
    const nextPath = redirects[path];
    if (!nextPath) return;
    window.history.replaceState({}, "", nextPath);
    setPath(nextPath);
  }, [path]);

  return (
    <>
      <AppHeader />
      {path === "/client" ? (
        <ClientLandingPage />
      ) : path === "/demo/client" ? (
        <DemoClientPage />
      ) : path === "/demo/company" ? (
        <DemoCompanyPage />
      ) : path === "/client/return" ? (
        <ClientReturnPage />
      ) : path === "/client/return-result" ? (
        <ClientReturnResultPage />
      ) : path === "/company" ? (
        <CompanyLandingPage />
      ) : path === "/company/return-review" ? (
        <ReturnReviewPage />
      ) : path === "/company/ops-dashboard" ? (
        <OpsDashboardPage />
      ) : path === "/company/customer-service" ? (
        <CustomerServicePage />
      ) : path === "/company/work-orders" ? (
        <WorkOrdersPage />
      ) : (
        <LandingPage />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
