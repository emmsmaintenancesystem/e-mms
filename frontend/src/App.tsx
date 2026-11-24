import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { PublicRepairPage } from './pages/PublicRepairPage';
import { PublicTrackPage } from './pages/PublicTrackPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffTicketsPage } from './pages/StaffTicketsPage';
import { StaffReportsPage } from './pages/StaffReportsPage';
import { StaffAdminPage } from './pages/StaffAdminPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="min-h-screen flex flex-col bg-[#090A10] text-[#F3F5FA]">
          <Navbar />

          <main className="flex-1">
            <Routes>
              {/* Public Guest Routes (Zero PII, No Login Required) */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/repair" element={<PublicRepairPage />} />
              <Route path="/track" element={<PublicTrackPage />} />
              <Route path="/track/:code" element={<PublicTrackPage />} />

              {/* Staff Login */}
              <Route path="/staff/login" element={<StaffLoginPage />} />

              {/* Staff Protected Routes */}
              <Route
                path="/staff/tickets"
                element={
                  <ProtectedRoute
                    allowedRoles={['technician', 'reporter', 'admin']}
                  >
                    <StaffTicketsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/staff/reports"
                element={
                  <ProtectedRoute allowedRoles={['reporter', 'admin']}>
                    <StaffReportsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/staff/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <StaffAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <footer className="border-t border-[#1E2235] bg-[#090A10] py-4 px-4 text-center text-xs text-[#9BA3B8] no-print">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>
                <strong className="text-[#F3F5FA]">e-MMS</strong> —
                ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์ (e-MaintenanceManagementSystem)
              </span>
              <span>
                PDPA Compliant (Zero PII) • WebP Auto-Compression
              </span>
            </div>
          </footer>
        </div>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
