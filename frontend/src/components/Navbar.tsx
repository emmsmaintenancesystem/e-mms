import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Home,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types/api';

export const Navbar: React.FC = () => {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Close mobile menu automatically whenever route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const desktopNavLinkClass = (path: string) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
      isActive(path)
        ? 'bg-[#2F6BFF] text-white shadow-sm shadow-[#2F6BFF]/30'
        : 'text-[#9BA3B8] hover:text-[#F3F5FA] hover:bg-[#171A29]'
    }`;

  const mobileNavLinkClass = (path: string) =>
    `flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
      isActive(path)
        ? 'bg-[#2F6BFF] text-white shadow-sm shadow-[#2F6BFF]/30'
        : 'text-[#F3F5FA] bg-[#090A10]/60 hover:bg-[#171A29] border border-[#1E2235]'
    }`;

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-[#090A10]/95 backdrop-blur-md border-b border-[#1E2235] no-print">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-xl bg-[#2F6BFF] flex items-center justify-center text-white shadow-md shadow-[#2F6BFF]/25 group-hover:bg-[#2457DB] transition-colors">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-[#F3F5FA]">
                  e-MMS
                </span>
                <span className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#2F6BFF]/15 text-[#5A8BFF] border border-[#2F6BFF]/30">
                  Online Maintenance
                </span>
              </div>
              <p className="text-[11px] text-[#9BA3B8] leading-tight">
                ระบบซ่อมบำรุงออนไลน์
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links (md and up) */}
          <nav className="hidden md:flex items-center gap-1.5">
            <Link to="/" className={desktopNavLinkClass('/')}>
              <Home className="w-4 h-4 shrink-0" />
              <span>หน้าแรก</span>
            </Link>

            <Link to="/repair" className={desktopNavLinkClass('/repair')}>
              <Wrench className="w-4 h-4 shrink-0" />
              <span>แจ้งซ่อม</span>
            </Link>

            <Link to="/track" className={desktopNavLinkClass('/track')}>
              <Search className="w-4 h-4 shrink-0" />
              <span>ติดตามสถานะ</span>
            </Link>

            {user ? (
              <>
                <div className="h-5 w-px bg-[#1E2235] mx-1" />

                <Link
                  to="/staff/tickets"
                  className={desktopNavLinkClass('/staff/tickets')}
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span>คิวงานซ่อม</span>
                </Link>

                {hasRole('reporter', 'admin') && (
                  <Link
                    to="/staff/reports"
                    className={desktopNavLinkClass('/staff/reports')}
                  >
                    <BarChart3 className="w-4 h-4 shrink-0" />
                    <span>รายงานสถิติ</span>
                  </Link>
                )}

                {hasRole('admin') && (
                  <Link
                    to="/staff/admin"
                    className={desktopNavLinkClass('/staff/admin')}
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span>ตั้งค่าระบบ</span>
                  </Link>
                )}

                <div className="flex items-center gap-2 pl-2 ml-1 border-l border-[#1E2235]">
                  <div className="hidden lg:flex flex-col text-right">
                    <span className="text-xs font-bold text-[#F3F5FA] leading-tight">
                      {user.display_name}
                    </span>
                    <span className="text-[11px] text-[#5A8BFF] leading-tight">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#171A29] hover:bg-rose-500/20 text-[#9BA3B8] hover:text-rose-300 border border-[#1E2235] transition-colors"
                    title="ออกจากระบบ"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ออก</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="h-5 w-px bg-[#1E2235] mx-1" />
                <Link
                  to="/staff/login"
                  className={desktopNavLinkClass('/staff/login')}
                  title="เข้าสู่ระบบสำหรับช่าง ผู้บริหาร และผู้ดูแลระบบ"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>เจ้าหน้าที่</span>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Controls (< md): Quick Repair Button + Hamburger Toggle */}
          <div className="flex md:hidden items-center gap-2">
            {location.pathname !== '/repair' && (
              <Link
                to="/repair"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#2F6BFF] text-white shadow-sm"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>แจ้งซ่อม</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="เปิดเมนูนำทาง"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#121420] border border-[#1E2235] text-[#F3F5FA] hover:border-[#2F6BFF]"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-[#FF7A1A]" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Drawer (< md) */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#121420] border-t border-[#1E2235] px-4 py-4 space-y-3 shadow-2xl">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#9BA3B8] px-1">
              เมนูสำหรับผู้แจ้งซ่อมทั่วไป
            </p>
            <Link to="/" className={mobileNavLinkClass('/')}>
              <Home className="w-4 h-4 text-[#5A8BFF]" />
              <span>หน้าแรก (ข่าวสารและเมนูหลัก)</span>
            </Link>
            <Link to="/repair" className={mobileNavLinkClass('/repair')}>
              <Wrench className="w-4 h-4 text-[#5A8BFF]" />
              <span>แจ้งซ่อมบำรุงออนไลน์</span>
            </Link>
            <Link to="/track" className={mobileNavLinkClass('/track')}>
              <Search className="w-4 h-4 text-[#5A8BFF]" />
              <span>ติดตามสถานะ / กระดานงานซ่อม</span>
            </Link>
          </div>

          <div className="pt-2 border-t border-[#1E2235] space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#9BA3B8] px-1">
              เมนูสำหรับเจ้าหน้าที่ (Staff)
            </p>

            {user ? (
              <>
                <div className="bg-[#090A10] border border-[#1E2235] rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#2F6BFF]" />
                    <div>
                      <p className="text-xs font-bold text-[#F3F5FA]">
                        {user.display_name}
                      </p>
                      <p className="text-[11px] text-[#5A8BFF]">
                        {ROLE_LABELS[user.role]}
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  to="/staff/tickets"
                  className={mobileNavLinkClass('/staff/tickets')}
                >
                  <ClipboardList className="w-4 h-4 text-[#5A8BFF]" />
                  <span>คิวงานซ่อมบำรุง</span>
                </Link>

                {hasRole('reporter', 'admin') && (
                  <Link
                    to="/staff/reports"
                    className={mobileNavLinkClass('/staff/reports')}
                  >
                    <BarChart3 className="w-4 h-4 text-[#5A8BFF]" />
                    <span>รายงานสถิติผู้บริหาร</span>
                  </Link>
                )}

                {hasRole('admin') && (
                  <Link
                    to="/staff/admin"
                    className={mobileNavLinkClass('/staff/admin')}
                  >
                    <Settings className="w-4 h-4 text-[#5A8BFF]" />
                    <span>ตั้งค่าระบบ (Admin)</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30"
                >
                  <LogOut className="w-4 h-4" />
                  <span>ออกจากระบบเจ้าหน้าที่</span>
                </button>
              </>
            ) : (
              <Link
                to="/staff/login"
                className={mobileNavLinkClass('/staff/login')}
              >
                <LogIn className="w-4 h-4 text-[#5A8BFF]" />
                <span>เข้าสู่ระบบสำหรับเจ้าหน้าที่</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
