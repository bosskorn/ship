import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Menu } from 'tdesign-react';
import {
  ChartBarIcon,
  ErrorCircleIcon,
  HelpCircleIcon,
  HistoryIcon,
  LocationIcon,
  MapIcon,
  MoneyIcon,
  ViewListIcon,
  SettingIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { getSession, logout, onSession, Session } from './lib/api';
import { AuditPage } from './pages/AuditPage';
import { DriversPage } from './pages/DriversPage';
import { KpiPage } from './pages/KpiPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { PricingPage } from './pages/PricingPage';
import { RiskPage } from './pages/RiskPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';
import { ZonesPage } from './pages/ZonesPage';

const NAV = [
  { path: '/live', label: 'Live Operations', icon: <MapIcon /> },
  { path: '/orders', label: 'ออเดอร์', icon: <ViewListIcon /> },
  { path: '/drivers', label: 'คนขับ', icon: <UserIcon /> },
  { path: '/kpis', label: 'KPI / Unit economics', icon: <ChartBarIcon /> },
  { path: '/pricing', label: 'ราคา / GP / Surge', icon: <MoneyIcon /> },
  { path: '/zones', label: 'พื้นที่ให้บริการ', icon: <LocationIcon /> },
  { path: '/risk', label: 'ความเสี่ยง / Fraud', icon: <ErrorCircleIcon /> },
  { path: '/support', label: 'ซัพพอร์ต', icon: <HelpCircleIcon /> },
  { path: '/settings', label: 'ตั้งค่าแพลตฟอร์ม', icon: <SettingIcon />, admin: true },
  { path: '/audit', label: 'Audit log', icon: <HistoryIcon />, admin: true },
];

export function App() {
  const [session, setSessionState] = useState<Session | null>(getSession());
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    const off = onSession(setSessionState);
    return () => {
      off();
    };
  }, []);

  if (!session) return <LoginPage />;
  const isAdmin = session.user.role === 'ADMIN';
  const current = NAV.find((n) => loc.pathname.startsWith(n.path));

  return (
    <div className="app-shell">
      <aside className="app-side">
        <div className="app-brand">
          <span className="mark">S</span> Ship Ops
        </div>
        <Menu value={current?.path} onChange={(v) => nav(String(v))} style={{ width: '100%', flex: 1 }}>
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
            <Menu.MenuItem key={n.path} value={n.path} icon={n.icon}>
              {n.label}
            </Menu.MenuItem>
          ))}
        </Menu>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <h1>{current?.label ?? ''}</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="muted">
              {session.user.displayName ?? ''} · {session.user.role}
            </span>
            <Button size="small" variant="outline" onClick={() => void logout()}>
              ออกจากระบบ
            </Button>
          </div>
        </header>
        <div className="app-content">
          <Routes>
            <Route path="/live" element={<LivePage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/drivers" element={<DriversPage isAdmin={isAdmin} />} />
            <Route path="/kpis" element={<KpiPage />} />
            <Route path="/pricing" element={<PricingPage isAdmin={isAdmin} />} />
            <Route path="/zones" element={<ZonesPage isAdmin={isAdmin} />} />
            <Route path="/risk" element={<RiskPage />} />
            <Route path="/support" element={<SupportPage />} />
            {isAdmin && <Route path="/settings" element={<SettingsPage />} />}
            {isAdmin && <Route path="/audit" element={<AuditPage />} />}
            <Route path="*" element={<Navigate to="/live" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
