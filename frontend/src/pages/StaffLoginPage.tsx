import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, KeyRound, Loader2, Lock, LogIn, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const StaffLoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fromPath = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (user) {
      if (fromPath) {
        navigate(fromPath, { replace: true });
      } else if (user.role === 'reporter') {
        navigate('/staff/reports', { replace: true });
      } else {
        navigate('/staff/tickets', { replace: true });
      }
    }
  }, [user, fromPath, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMsg('กรุณากรอกชื่อผู้ใช้ (Username) และรหัสผ่าน (Password)');
      return;
    }

    setIsSubmitting(true);
    try {
      const loggedInUser = await login(cleanUser, password);
      if (fromPath) {
        navigate(fromPath, { replace: true });
      } else if (loggedInUser.role === 'reporter') {
        navigate('/staff/reports', { replace: true });
      } else {
        navigate('/staff/tickets', { replace: true });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="emms-card p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#2F6BFF]/15 border border-[#2F6BFF]/30 text-[#2F6BFF] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA]">
            เข้าสู่ระบบเจ้าหน้าที่ (e-MMS)
          </h1>
          <p className="text-xs text-[#9BA3B8]">
            สำหรับทีมช่างซ่อมบำรุง (Technician), ผู้บริหารดูรายงานสถิติ (Reporter)
            และผู้ดูแลระบบ (Admin)
          </p>
        </div>

        {fromPath && (
          <div className="bg-[#2F6BFF]/10 border border-[#2F6BFF]/30 rounded-xl px-3.5 py-2.5 text-xs text-[#5A8BFF]">
            กรุณาเข้าสู่ระบบเพื่อเปิดดูรายละเอียดและจัดการใบแจ้งซ่อมที่เลือก
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
              ชื่อผู้ใช้ (Username)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3" />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="เช่น tech, reporter หรือ admin"
                className="emms-input pl-10 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#9BA3B8] absolute left-3.5 top-3" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="emms-input pl-10 text-sm"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-[#FF7A1A]/15 border border-[#FF7A1A] text-[#FF984D] rounded-xl p-3 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#FF7A1A] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="emms-btn-primary w-full py-3 text-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังตรวจสอบข้อมูล...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบ</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[#1E2235] text-center space-y-2">
          <p className="text-[11px] text-[#9BA3B8]">
            กรณีลืมรหัสผ่านหรือต้องการขอเปิดบัญชีใหม่ กรุณาติดต่อผู้ดูแลระบบ (Admin)
          </p>
          <Link
            to="/"
            className="inline-block text-xs font-semibold text-[#5A8BFF] hover:underline"
          >
            ← กลับไปยังหน้าแจ้งซ่อมสาธารณะ (ไม่ต้องล็อกอิน)
          </Link>
        </div>
      </div>
    </div>
  );
};
