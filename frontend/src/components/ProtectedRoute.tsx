import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, StaffRole } from '../types/api';

interface ProtectedRouteProps {
  allowedRoles: StaffRole[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  children,
}) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#9BA3B8]">
        <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
        <p className="text-sm font-medium">กำลังตรวจสอบสิทธิ์ผู้ใช้งาน...</p>
      </div>
    );
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to="/staff/login" state={{ from: returnTo }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="max-w-lg mx-auto my-16 px-4">
        <div className="emms-card p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#FF7A1A]/15 border border-[#FF7A1A]/40 text-[#FF7A1A] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[#F3F5FA]">
            ไม่มีสิทธิ์เข้าถึงหน้านี้
          </h2>
          <p className="text-sm text-[#9BA3B8]">
            บัญชีของคุณ (<strong className="text-[#F3F5FA]">{user.display_name}</strong>)
            มีบทบาทเป็น <strong className="text-[#5A8BFF]">{ROLE_LABELS[user.role]}</strong>{' '}
            ซึ่งไม่ได้รับอนุญาตให้เข้าถึงเมนูนี้
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link to="/staff/tickets" className="emms-btn-primary text-sm">
              ไปที่คิวงานซ่อม
            </Link>
            <Link to="/" className="emms-btn-secondary text-sm">
              กลับหน้าแรก
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
