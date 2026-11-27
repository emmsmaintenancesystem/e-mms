import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Flame,
  Loader2,
  Printer,
  RefreshCw,
  Table,
  Users,
} from 'lucide-react';
import {
  downloadReportFile,
  fetchPublicMasterData,
  fetchReportSummary,
} from '../lib/apiClient';
import {
  ALL_TICKET_STATUSES,
  Building,
  Category,
  ReportSummaryResponse,
  STATUS_META,
  THAI_MONTHS_FULL,
  THAI_MONTHS_SHORT,
} from '../types/api';

export const StaffReportsPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => [currentYear, currentYear - 1, currentYear - 2, currentYear + 1],
    [currentYear]
  );

  // Filter State
  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(0); // 0 = ทั้งปี
  const [buildingId, setBuildingId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [status, setStatus] = useState<string>('');

  // Master Data for Filters
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Report Data State
  const [report, setReport] = useState<ReportSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<'csv' | 'xlsx' | null>(null);

  useEffect(() => {
    fetchPublicMasterData()
      .then((res) => {
        setBuildings(res.buildings || []);
        setCategories(res.categories || []);
      })
      .catch(() => {});
  }, []);

  const loadReport = () => {
    setIsLoading(true);
    setErrorMsg(null);
    fetchReportSummary({
      year,
      month: month > 0 ? month : undefined,
      building_id: buildingId > 0 ? buildingId : undefined,
      category_id: categoryId > 0 ? categoryId : undefined,
      status: status || undefined,
    })
      .then((res) => {
        setReport(res);
      })
      .catch((err) => {
        setErrorMsg(
          err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลรายงานสถิติได้'
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, buildingId, categoryId, status]);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExportingType(format);
    try {
      await downloadReportFile(format, {
        year,
        month: month > 0 ? month : undefined,
        building_id: buildingId > 0 ? buildingId : undefined,
        category_id: categoryId > 0 ? categoryId : undefined,
        status: status || undefined,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถส่งออกไฟล์รายงานได้');
    } finally {
      setExportingType(null);
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const selectedBuildingName = useMemo(() => {
    if (buildingId <= 0) return 'ทุกอาคาร';
    return buildings.find((b) => b.id === buildingId)?.name || 'เฉพาะอาคารที่เลือก';
  }, [buildingId, buildings]);

  const selectedCategoryName = useMemo(() => {
    if (categoryId <= 0) return 'ทุกหมวดหมู่งานซ่อม';
    return categories.find((c) => c.id === categoryId)?.name || 'เฉพาะหมวดหมู่ที่เลือก';
  }, [categoryId, categories]);

  const selectedPeriodLabel = useMemo(() => {
    const buddhistYear = year + 543;
    if (month >= 1 && month <= 12) {
      return `เดือน${THAI_MONTHS_FULL[month - 1]} พ.ศ. ${buddhistYear} (${year})`;
    }
    return `ประจำปี พ.ศ. ${buddhistYear} (${year} - ทั้ง 12 เดือน)`;
  }, [year, month]);

  // Compute Executive Matrix column totals (Jan..Dec)
  const matrixMonthTotals = useMemo(() => {
    const totals = Array(12).fill(0) as number[];
    if (!report?.executive_matrix) return totals;
    for (const row of report.executive_matrix) {
      for (let m = 0; m < 12; m++) {
        totals[m] += row.months?.[m] || 0;
      }
    }
    return totals;
  }, [report]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6 print-container">
      {/* =====================================================================
          Print-Only Executive Report Header (Crisp Black on White via @media print)
         ===================================================================== */}
      <div className="print-only border-b-2 border-black pb-3 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">
              รายงานสถิติการบริหารจัดการงานซ่อมบำรุงออนไลน์ (e-MMS Executive Report)
            </h1>
            <p className="text-sm mt-0.5">
              ช่วงเวลา: <strong>{selectedPeriodLabel}</strong> | อาคาร:{' '}
              <strong>{selectedBuildingName}</strong> | หมวดหมู่:{' '}
              <strong>{selectedCategoryName}</strong>
            </p>
          </div>
          <div className="text-right text-xs">
            <p>พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          Screen Header & Export Action Bar (.no-print)
         ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA] flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#2F6BFF]" />
            รายงานสถิติและตารางวิเคราะห์ระดับผู้บริหาร
          </h1>
          <p className="text-xs sm:text-sm text-[#9BA3B8] mt-0.5">
            สรุปภาพรวมงานซ่อมรายเดือน/รายปี ตารางไขว้อาคาร × เดือน × หมวดหมู่
            พร้อมส่งออกไฟล์ Excel (.xlsx), CSV และพิมพ์ PDF พื้นขาว
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={exportingType !== null}
            onClick={() => handleExport('xlsx')}
            className="emms-btn-primary text-xs px-3.5 py-2.5"
          >
            {exportingType === 'xlsx' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Export Excel (.xlsx 3 ชีต)</span>
          </button>

          <button
            type="button"
            disabled={exportingType !== null}
            onClick={() => handleExport('csv')}
            className="emms-btn-secondary text-xs px-3.5 py-2.5"
          >
            {exportingType === 'csv' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 text-emerald-400" />
            )}
            <span>Export CSV (UTF-8 ภาษาไทย)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPDF}
            className="emms-btn-secondary text-xs px-3.5 py-2.5"
          >
            <Printer className="w-4 h-4 text-[#5A8BFF]" />
            <span>พิมพ์ / Save PDF (พื้นขาว)</span>
          </button>

          <button
            type="button"
            onClick={loadReport}
            className="emms-btn-secondary text-xs p-2.5"
            title="รีเฟรชข้อมูลสถิติ"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          Filter Bar (.no-print)
         ===================================================================== */}
      <div className="emms-card p-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#9BA3B8] mb-1">
              ปี (ค.ศ. / พ.ศ.)
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="emms-select text-xs py-2"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  ปี {y} (พ.ศ. {y + 543})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9BA3B8] mb-1">
              เดือน
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="emms-select text-xs py-2"
            >
              <option value={0}>ทั้งปี (ม.ค. – ธ.ค.)</option>
              {THAI_MONTHS_FULL.map((mName, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {idx + 1}. {mName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9BA3B8] mb-1">
              อาคาร
            </label>
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(Number(e.target.value))}
              className="emms-select text-xs py-2"
            >
              <option value={0}>ทุกอาคาร</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9BA3B8] mb-1">
              หมวดหมู่งานซ่อม
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="emms-select text-xs py-2"
            >
              <option value={0}>ทุกหมวดหมู่</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9BA3B8] mb-1">
              สถานะใบงาน
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="emms-select text-xs py-2"
            >
              <option value="">ทุกสถานะ (6 สถานะ)</option>
              {ALL_TICKET_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_META[st].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading & Error Handling */}
      {isLoading ? (
        <div className="emms-card p-12 flex flex-col items-center justify-center gap-3 text-[#9BA3B8]">
          <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
          <p className="text-sm">กำลังประมวลผลตารางสถิติผู้บริหาร...</p>
        </div>
      ) : errorMsg || !report ? (
        <div className="emms-card p-6 border-[#FF7A1A]/40 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#FF7A1A] mx-auto" />
          <p className="text-sm font-bold text-[#F3F5FA]">
            {errorMsg || 'ไม่พบข้อมูลรายงาน'}
          </p>
          <button
            type="button"
            onClick={loadReport}
            className="emms-btn-primary text-xs mx-auto"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* =================================================================
              1. KPI Overview Cards
             ================================================================= */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="emms-card p-4 sm:p-5 space-y-1">
              <span className="text-xs font-semibold text-[#9BA3B8]">
                รายการแจ้งซ่อมทั้งหมด
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#F3F5FA]">
                {report.overview.total_tickets.toLocaleString()}
              </div>
              <p className="text-[11px] text-[#5A8BFF]">
                {selectedPeriodLabel}
              </p>
            </div>

            <div className="emms-card p-4 sm:p-5 space-y-1 border-[#FF7A1A]/40">
              <span className="text-xs font-semibold text-[#FF984D]">
                งานค้างสะสม (Backlog)
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#FF7A1A]">
                {report.overview.open_backlog.toLocaleString()}
              </div>
              <p className="text-[11px] text-[#9BA3B8]">
                ใหม่ {report.overview.pending_count} • กำลังซ่อม{' '}
                {report.overview.in_progress_count} • รออะไหล่{' '}
                {report.overview.waiting_parts_count}
              </p>
            </div>

            <div className="emms-card p-4 sm:p-5 space-y-1">
              <span className="text-xs font-semibold text-[#9BA3B8]">
                ซ่อมเสร็จสิ้น (Completed)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                  {report.overview.completed_count.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-300">
                  ({report.overview.completion_rate.toFixed(1)}%)
                </span>
              </div>
              <p className="text-[11px] text-[#9BA3B8]">
                ซ่อมไม่ได้ {report.overview.unrepairable_count} • ยกเลิก{' '}
                {report.overview.cancelled_count}
              </p>
            </div>

            <div className="emms-card p-4 sm:p-5 space-y-1">
              <span className="text-xs font-semibold text-[#9BA3B8] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#2F6BFF]" />
                เวลาตอบสนอง / ซ่อมเฉลี่ย
              </span>
              <div className="text-lg sm:text-xl font-black text-[#F3F5FA]">
                รับงาน {report.overview.avg_ack_minutes.toFixed(0)} นาที
              </div>
              <p className="text-xs font-semibold text-[#5A8BFF]">
                ซ่อมเสร็จเฉลี่ย {report.overview.avg_resolve_hours.toFixed(1)} ชั่วโมง
              </p>
            </div>
          </div>

          {/* =================================================================
              2. Executive Cross-Tab Matrix A: หมวดหมู่งานซ่อม × 12 เดือน (ม.ค.–ธ.ค.)
             ================================================================= */}
          <div className="emms-card p-5 space-y-3 print-break-avoid">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                  <Table className="w-5 h-5 text-[#2F6BFF]" />
                  ตารางไขว้ผู้บริหาร 1: สรุปจำนวนงานซ่อมแยกตามหมวดหมู่ × รายเดือน (ม.ค.–ธ.ค.{' '}
                  {year + 543})
                </h2>
                <p className="text-xs text-[#9BA3B8]">
                  ขอบเขตอาคาร: <strong className="text-[#F3F5FA]">{selectedBuildingName}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                    <th className="py-2.5 px-3 text-left font-bold">หมวดหมู่งานซ่อม</th>
                    {THAI_MONTHS_SHORT.map((m, i) => (
                      <th key={i} className="py-2.5 px-2 text-center font-semibold">
                        {m}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-center font-bold text-[#F3F5FA]">
                      รวมทั้งสิ้น
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold text-emerald-400">
                      ซ่อมเสร็จ
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold text-[#FF984D]">
                      งานค้าง
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2235]">
                  {report.executive_matrix && report.executive_matrix.length > 0 ? (
                    report.executive_matrix.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA] whitespace-nowrap">
                          {row.category_name}
                        </td>
                        {Array.from({ length: 12 }).map((_, mIdx) => {
                          const val = row.months?.[mIdx] || 0;
                          return (
                            <td
                              key={mIdx}
                              className={`py-2.5 px-2 text-center font-mono ${
                                val > 0
                                  ? 'text-[#F3F5FA] font-bold'
                                  : 'text-[#9BA3B8]/40'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-center font-mono font-extrabold text-[#5A8BFF]">
                          {row.total}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono font-bold text-emerald-400">
                          {row.completed}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#FF984D]">
                          {row.open_backlog}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={16} className="py-6 text-center text-[#9BA3B8]">
                        ไม่มีข้อมูลในตารางไขว้สำหรับตัวกรองนี้
                      </td>
                    </tr>
                  )}
                </tbody>
                {report.executive_matrix && report.executive_matrix.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#1E2235] bg-[#090A10] font-bold text-[#F3F5FA]">
                      <td className="py-2.5 px-3">รวมทุกหมวดหมู่</td>
                      {matrixMonthTotals.map((t, i) => (
                        <td key={i} className="py-2.5 px-2 text-center font-mono">
                          {t}
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-center font-mono text-[#5A8BFF]">
                        {report.executive_matrix.reduce((acc, r) => acc + r.total, 0)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-emerald-400">
                        {report.executive_matrix.reduce(
                          (acc, r) => acc + r.completed,
                          0
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-[#FF984D]">
                        {report.executive_matrix.reduce(
                          (acc, r) => acc + r.open_backlog,
                          0
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* =================================================================
              3. Executive Cross-Tab Matrix B: อาคาร × หมวดหมู่ × 12 เดือน (ม.ค.–ธ.ค.)
             ================================================================= */}
          {report.building_month_matrix &&
            report.building_month_matrix.length > 0 && (
              <div className="emms-card p-5 space-y-3 print-break-avoid">
                <div>
                  <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#2F6BFF]" />
                    ตารางไขว้ผู้บริหาร 2: แยกตามอาคาร × หมวดหมู่งานซ่อม × รายเดือน (ม.ค.–ธ.ค.{' '}
                    {year + 543})
                  </h2>
                  <p className="text-xs text-[#9BA3B8]">
                    แสดงการกระจายตัวของปัญหาแต่ละหมวดหมู่ในแต่ละอาคารตลอดทั้งปี
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                        <th className="py-2.5 px-3 text-left font-bold">อาคาร</th>
                        <th className="py-2.5 px-3 text-left font-bold">หมวดหมู่งานซ่อม</th>
                        {THAI_MONTHS_SHORT.map((m, i) => (
                          <th key={i} className="py-2.5 px-2 text-center font-semibold">
                            {m}
                          </th>
                        ))}
                        <th className="py-2.5 px-2.5 text-center font-bold text-[#F3F5FA]">
                          รวม
                        </th>
                        <th className="py-2.5 px-2 text-center font-bold text-emerald-400">
                          เสร็จ
                        </th>
                        <th className="py-2.5 px-2 text-center font-bold text-[#FF984D]">
                          ค้าง
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2235]">
                      {report.building_month_matrix.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#171A29]">
                          <td className="py-2 px-3 font-semibold text-[#F3F5FA] whitespace-nowrap">
                            {row.building_name || '-'}
                          </td>
                          <td className="py-2 px-3 text-[#F3F5FA] whitespace-nowrap">
                            {row.category_name}
                          </td>
                          {Array.from({ length: 12 }).map((_, mIdx) => {
                            const val = row.months?.[mIdx] || 0;
                            return (
                              <td
                                key={mIdx}
                                className={`py-2 px-2 text-center font-mono ${
                                  val > 0
                                    ? 'text-[#F3F5FA] font-bold'
                                    : 'text-[#9BA3B8]/40'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-[#5A8BFF]">
                            {row.total}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-emerald-400">
                            {row.completed}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-[#FF984D]">
                            {row.open_backlog}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* =================================================================
              4. 6-Status Breakdown & Monthly Trend Side-by-Side
             ================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 6-Status Breakdown Table */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#2F6BFF]" />
                สรุปจำนวนงานแยกตามสถานะทั้ง 6 สถานะ
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">สถานะงานซ่อม</th>
                      <th className="py-2.5 px-3 text-right">จำนวน (งาน)</th>
                      <th className="py-2.5 px-3 text-right">สัดส่วน (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.status_breakdown?.map((item) => (
                      <tr key={item.status} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.status_label}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#F3F5FA]">
                          {item.count.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#5A8BFF]">
                          {item.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Monthly Trend Table */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#2F6BFF]" />
                สถิติปริมาณงานซ่อมรายเดือน (ปี พ.ศ. {year + 543})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">เดือน</th>
                      <th className="py-2.5 px-2 text-right">ทั้งหมด</th>
                      <th className="py-2.5 px-2 text-right text-emerald-400">
                        ซ่อมเสร็จ
                      </th>
                      <th className="py-2.5 px-2 text-right text-[#FF984D]">
                        งานค้าง
                      </th>
                      <th className="py-2.5 px-2 text-right">ซ่อมไม่ได้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.monthly_trend?.map((m) => (
                      <tr key={m.month} className="hover:bg-[#171A29]">
                        <td className="py-2 px-3 font-medium text-[#F3F5FA]">
                          {m.month_label}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-[#F3F5FA]">
                          {m.total}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400">
                          {m.completed}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#FF984D]">
                          {m.open_backlog}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#9BA3B8]">
                          {m.unrepairable}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* =================================================================
              5. Category Ranking & Building Breakdown Side-by-Side
             ================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA]">
                อันดับหมวดหมู่งานซ่อมที่ถูกแจ้งสูงสุด
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">หมวดหมู่</th>
                      <th className="py-2.5 px-2 text-right">รวม</th>
                      <th className="py-2.5 px-2 text-right text-emerald-400">
                        ซ่อมเสร็จ
                      </th>
                      <th className="py-2.5 px-2 text-right text-[#FF984D]">ค้าง</th>
                      <th className="py-2.5 px-2 text-right">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.by_category?.map((c) => (
                      <tr key={c.category_id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {c.category_name}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-[#F3F5FA]">
                          {c.total}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                          {c.completed}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[#FF984D]">
                          {c.open_backlog}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[#5A8BFF]">
                          {c.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Building */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA]">
                สถิติปริมาณงานซ่อมแยกตามอาคาร
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">อาคาร</th>
                      <th className="py-2.5 px-2 text-right">รวม</th>
                      <th className="py-2.5 px-2 text-right text-emerald-400">
                        ซ่อมเสร็จ
                      </th>
                      <th className="py-2.5 px-2 text-right text-[#FF984D]">ค้าง</th>
                      <th className="py-2.5 px-2 text-right">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.by_building?.map((b) => (
                      <tr key={b.building_id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {b.building_name}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-[#F3F5FA]">
                          {b.total}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                          {b.completed}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[#FF984D]">
                          {b.open_backlog}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[#5A8BFF]">
                          {b.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* =================================================================
              5.1 Subcategory Drill-Down Breakdown (สถิติเจาะลึกหมวดหมู่ย่อย / รายการอุปกรณ์)
             ================================================================= */}
          {report.by_subcategory && report.by_subcategory.length > 0 && (
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-[#F3F5FA]">
                    สถิติเจาะลึกแยกตามหมวดหมู่ย่อย / รายการอุปกรณ์ (Subcategory Breakdown)
                  </h2>
                  <p className="text-xs text-[#9BA3B8]">
                    แสดงจำนวนงานซ่อมแยกตามอุปกรณ์ย่อย (เช่น หลอดไฟ, ปลั๊กไฟ, สวิตช์ไฟ) ภายใต้{' '}
                    <strong className="text-[#5A8BFF]">{selectedCategoryName}</strong>
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">หมวดหมู่ย่อย / อุปกรณ์</th>
                      <th className="py-2.5 px-3 text-left">สังกัดหมวดหมู่หลัก</th>
                      <th className="py-2.5 px-2 text-right">รวม</th>
                      <th className="py-2.5 px-2 text-right text-emerald-400">
                        ซ่อมเสร็จ
                      </th>
                      <th className="py-2.5 px-2 text-right text-[#FF984D]">งานค้าง</th>
                      <th className="py-2.5 px-2 text-right">ซ่อมไม่ได้</th>
                      <th className="py-2.5 px-2 text-right">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.by_subcategory.map((sc) => (
                      <tr key={sc.subcategory_id} className="hover:bg-[#171A29]">
                        <td className="py-2 px-3 font-semibold text-[#F3F5FA]">
                          {sc.subcategory_name}
                        </td>
                        <td className="py-2 px-3 text-[#9BA3B8]">
                          {sc.category_name}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-[#F3F5FA]">
                          {sc.total}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400">
                          {sc.completed}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#FF984D]">
                          {sc.open_backlog}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#9BA3B8]">
                          {sc.unrepairable}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#5A8BFF]">
                          {sc.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              6. Top Hotspot Rooms & Technician Performance Side-by-Side
             ================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Rooms Hotspot */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#FF7A1A]" />
                ห้อง / บริเวณที่ถูกแจ้งซ่อมบ่อยที่สุด (Hotspot Rooms)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">ห้อง / บริเวณ</th>
                      <th className="py-2.5 px-2 text-left">อาคาร / ชั้น</th>
                      <th className="py-2.5 px-2 text-left">ปัญหาหลัก</th>
                      <th className="py-2.5 px-2 text-right">จำนวนครั้ง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.top_rooms && report.top_rooms.length > 0 ? (
                      report.top_rooms.map((r) => (
                        <tr key={r.room_id} className="hover:bg-[#171A29]">
                          <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                            {r.room_code ? `[${r.room_code}] ` : ''}
                            {r.room_name}
                          </td>
                          <td className="py-2.5 px-2 text-[#9BA3B8]">
                            {r.building_name} • {r.floor_name}
                          </td>
                          <td className="py-2.5 px-2 text-[#5A8BFF]">
                            {r.top_category || '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-[#FF984D]">
                            {r.total}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-[#9BA3B8]">
                          ยังไม่มีข้อมูลห้องที่แจ้งซ่อมในช่วงเวลานี้
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Technician Performance Table */}
            <div className="emms-card p-5 space-y-3 print-break-avoid">
              <h2 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#2F6BFF]" />
                สถิติการปฏิบัติงานของทีมช่างซ่อมบำรุง
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] bg-[#090A10] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">ชื่อ-นามสกุลช่าง</th>
                      <th className="py-2.5 px-2 text-right">รวมงานที่ลง</th>
                      <th className="py-2.5 px-2 text-right text-emerald-400">
                        ซ่อมเสร็จ
                      </th>
                      <th className="py-2.5 px-2 text-right">ซ่อมไม่ได้</th>
                      <th className="py-2.5 px-2 text-right">เฉลี่ย (ชม.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {report.by_technician && report.by_technician.length > 0 ? (
                      report.by_technician.map((t) => (
                        <tr key={t.technician_id} className="hover:bg-[#171A29]">
                          <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                            {t.full_name}
                            {t.nickname ? ` (${t.nickname})` : ''}
                            {t.specialty && (
                              <span className="block text-[11px] text-[#9BA3B8] font-normal">
                                {t.specialty}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-[#F3F5FA]">
                            {t.total_assigned}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                            {t.completed_count}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-[#9BA3B8]">
                            {t.unrepairable_count}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-[#5A8BFF]">
                            {t.avg_resolve_hours.toFixed(1)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-[#9BA3B8]">
                          ยังไม่มีข้อมูลช่างในระบบ
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
