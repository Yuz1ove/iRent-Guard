import { Building2, Gauge, Headphones, Home, ShieldCheck, Smartphone } from "lucide-react";

const navItems = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/client", label: "客戶端", icon: Smartphone },
  { href: "/company", label: "公司端", icon: Building2 },
  { href: "/company/ops-dashboard", label: "營運儀表板", icon: Gauge },
  { href: "/company/customer-service", label: "客服摘要", icon: Headphones }
];

export function AppHeader() {
  const pathname = window.location.pathname;
  return (
    <header className="app-header">
      <a className="brand-link" href="/">
        <span className="brand-icon">
          <ShieldCheck size={22} />
        </span>
        <span>
          <strong>iRent Guard</strong>
          <small>AI 車況守護系統</small>
        </span>
      </a>
      <nav className="top-nav" aria-label="主要導覽">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/client" && pathname.startsWith("/client/"));
          return (
            <a className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={17} />
              {item.label}
            </a>
          );
        })}
      </nav>
    </header>
  );
}
