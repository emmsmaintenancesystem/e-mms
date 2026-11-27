package service

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"github.com/emms/backend/internal/model"
	"github.com/xuri/excelize/v2"
)

var bkkZone = time.FixedZone("ICT", 7*3600)

// GenerateCSV exports ticket rows as a UTF-8 with BOM CSV file so Microsoft Excel
// renders Thai characters accurately out-of-the-box (ADR-008).
func GenerateCSV(tickets []model.ExportTicketRow) ([]byte, error) {
	var buf bytes.Buffer
	// Prepend UTF-8 BOM (\xEF\xBB\xBF)
	buf.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(&buf)

	headers := []string{
		"รหัสใบแจ้งซ่อม",
		"วันที่แจ้งซ่อม",
		"อาคาร",
		"ชั้น",
		"ห้อง/บริเวณ",
		"รายละเอียดจุดย่อย",
		"หมวดหมู่งานซ่อม",
		"หมวดหมู่ย่อย/รายการอุปกรณ์",
		"ประเภทผู้แจ้ง",
		"อาการ/รายละเอียดปัญหา",
		"สถานะ",
		"หมายเหตุ/สรุปผลการซ่อม",
		"ช่างผู้ปฏิบัติงาน",
		"เวลารับทราบงาน",
		"เวลาปิดงาน",
	}
	if err := w.Write(headers); err != nil {
		return nil, err
	}

	for _, t := range tickets {
		subcat := t.SubcategoryName
		if subcat == "" {
			subcat = "-"
		}
		record := []string{
			t.TicketCode,
			formatThaiDateTime(&t.CreatedAt),
			t.BuildingName,
			t.FloorName,
			t.RoomName,
			t.LocationDetail,
			t.CategoryName,
			subcat,
			t.ReporterTypeName,
			t.Description,
			t.StatusLabel,
			t.StatusNote,
			t.TechnicianNames,
			formatThaiDateTime(t.AcknowledgedAt),
			formatThaiDateTime(t.CompletedAt),
		}
		if err := w.Write(record); err != nil {
			return nil, err
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// GenerateXLSX builds a multi-sheet executive Excel workbook (.xlsx) containing:
// 1. สรุปภาพรวมสถิติ (Summary & Breakdowns)
// 2. ตารางไขว้ผู้บริหาร (Executive Cross-Tab Matrix: หมวดหมู่ x 12 เดือน)
// 3. รายการใบแจ้งซ่อม (Raw Ticket List)
func GenerateXLSX(summary *model.ReportSummaryResponse, tickets []model.ExportTicketRow) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	sheetSummary := "สรุปภาพรวมสถิติ"
	sheetMatrix := "ตารางไขว้ผู้บริหาร"
	sheetTickets := "รายการใบแจ้งซ่อม"

	defaultSheet := f.GetSheetName(0)
	_ = f.SetSheetName(defaultSheet, sheetSummary)
	_, _ = f.NewSheet(sheetMatrix)
	_, _ = f.NewSheet(sheetTickets)

	// Sheet 1: สรุปภาพรวมสถิติ
	if summary != nil {
		writeSummarySheet(f, sheetSummary, summary)
		writeMatrixSheet(f, sheetMatrix, summary)
	}

	// Sheet 3: รายการใบแจ้งซ่อม
	writeTicketsSheet(f, sheetTickets, tickets)

	var out bytes.Buffer
	if err := f.Write(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func writeSummarySheet(f *excelize.File, sheet string, s *model.ReportSummaryResponse) {
	_ = f.SetCellValue(sheet, "A1", "รายงานสรุปสถิติงานซ่อมบำรุงออนไลน์ (e-MMS)")
	periodText := fmt.Sprintf("ประจำปี ค.ศ. %d (พ.ศ. %d)", s.Filter.Year, s.Filter.Year+543)
	if s.Filter.Month >= 1 && s.Filter.Month <= 12 {
		periodText = fmt.Sprintf("%s เดือนที่ %d", periodText, s.Filter.Month)
	}
	_ = f.SetCellValue(sheet, "A2", periodText)

	// Overview Metrics
	_ = f.SetCellValue(sheet, "A4", "ตัวชี้วัดภาพรวม (Overview)")
	_ = f.SetCellValue(sheet, "B4", "ค่าสถิติ")

	overviewRows := []struct {
		Label string
		Val   interface{}
	}{
		{"จำนวนใบแจ้งซ่อมทั้งหมด (รายการ)", s.Overview.TotalTickets},
		{"งานค้างรอดำเนินการรวม (รายการ)", s.Overview.OpenBacklog},
		{"- แจ้งซ่อมใหม่ (รายการ)", s.Overview.PendingCount},
		{"- รับทราบงาน / กำลังซ่อม (รายการ)", s.Overview.InProgressCount},
		{"- รออะไหล่ / ส่งซ่อมภายนอก (รายการ)", s.Overview.WaitingPartsCount},
		{"ซ่อมเสร็จสิ้น (รายการ)", s.Overview.CompletedCount},
		{"ไม่สามารถซ่อมได้ (รายการ)", s.Overview.UnrepairableCount},
		{"ยกเลิกรายการ (รายการ)", s.Overview.CancelledCount},
		{"อัตราการซ่อมสำเร็จ (%)", s.Overview.CompletionRate},
		{"เวลาตอบสนองรับทราบงานเฉลี่ย (นาที)", s.Overview.AvgAckMinutes},
		{"เวลาดำเนินการซ่อมเสร็จเฉลี่ย (ชั่วโมง)", s.Overview.AvgResolveHours},
	}

	rowIdx := 5
	for _, r := range overviewRows {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), r.Label)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), r.Val)
		rowIdx++
	}

	// Category Breakdown
	rowIdx += 2
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), "สถิติแยกตามหมวดหมู่งานซ่อม")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), "รวมทั้งหมด")
	_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), "งานค้าง")
	_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), "ซ่อมเสร็จ")
	_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), "ซ่อมไม่ได้")
	_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), "สัดส่วน (%)")
	rowIdx++

	for _, c := range s.ByCategory {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), c.CategoryName)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), c.Total)
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), c.OpenBacklog)
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), c.Completed)
		_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), c.Unrepairable)
		_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), c.Percentage)
		rowIdx++
	}

	// Subcategory Breakdown
	if len(s.BySubcategory) > 0 {
		rowIdx += 2
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), "สถิติเจาะลึกหมวดหมู่ย่อย / รายการอุปกรณ์")
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), "หมวดหมู่หลัก")
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), "รวมทั้งหมด")
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), "งานค้าง")
		_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), "ซ่อมเสร็จ")
		_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), "ซ่อมไม่ได้")
		_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", rowIdx), "สัดส่วน (%)")
		rowIdx++

		for _, sc := range s.BySubcategory {
			_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), sc.SubcategoryName)
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), sc.CategoryName)
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), sc.Total)
			_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), sc.OpenBacklog)
			_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), sc.Completed)
			_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), sc.Unrepairable)
			_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", rowIdx), sc.Percentage)
			rowIdx++
		}
	}

	// Technician Performance
	rowIdx += 2
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), "สถิติผลการปฏิบัติงานของช่าง")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), "ชื่อเล่น")
	_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), "ความเชี่ยวชาญ")
	_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), "งานที่รับผิดชอบรวม")
	_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), "ซ่อมเสร็จ")
	_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), "ซ่อมไม่ได้")
	_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", rowIdx), "เวลาปิดงานเฉลี่ย (ชม.)")
	rowIdx++

	for _, tech := range s.ByTechnician {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), tech.FullName)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), tech.Nickname)
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), tech.Specialty)
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), tech.TotalAssigned)
		_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), tech.CompletedCount)
		_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), tech.Unrepairable)
		_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", rowIdx), tech.AvgResolveHours)
		rowIdx++
	}

	_ = f.SetColWidth(sheet, "A", "A", 42)
	_ = f.SetColWidth(sheet, "B", "G", 18)
}

func writeMatrixSheet(f *excelize.File, sheet string, s *model.ReportSummaryResponse) {
	_ = f.SetCellValue(sheet, "A1", fmt.Sprintf("ตารางไขว้สถิติผู้บริหาร (หมวดหมู่ x รายเดือน) ประจำปี %d (พ.ศ. %d)", s.Filter.Year, s.Filter.Year+543))

	headers := []string{
		"หมวดหมู่งานซ่อม",
		"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
		"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
		"รวมทั้งปี", "ซ่อมเสร็จ", "งานค้าง",
	}

	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, 3)
		_ = f.SetCellValue(sheet, cell, h)
	}

	rowIdx := 4
	for _, r := range s.ExecutiveMatrix {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), r.CategoryName)
		for m := 0; m < 12; m++ {
			cell, _ := excelize.CoordinatesToCellName(m+2, rowIdx)
			_ = f.SetCellValue(sheet, cell, r.Months[m])
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("N%d", rowIdx), r.Total)
		_ = f.SetCellValue(sheet, fmt.Sprintf("O%d", rowIdx), r.Completed)
		_ = f.SetCellValue(sheet, fmt.Sprintf("P%d", rowIdx), r.OpenBacklog)
		rowIdx++
	}

	// Second matrix: Building x 12 Months
	rowIdx += 2
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), "ตารางไขว้สถิติแยกตามอาคาร x รายเดือน")
	rowIdx++
	headers[0] = "อาคาร"
	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx)
		_ = f.SetCellValue(sheet, cell, h)
	}
	rowIdx++
	for _, r := range s.BuildingMonthMatrix {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), r.BuildingName)
		for m := 0; m < 12; m++ {
			cell, _ := excelize.CoordinatesToCellName(m+2, rowIdx)
			_ = f.SetCellValue(sheet, cell, r.Months[m])
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("N%d", rowIdx), r.Total)
		_ = f.SetCellValue(sheet, fmt.Sprintf("O%d", rowIdx), r.Completed)
		_ = f.SetCellValue(sheet, fmt.Sprintf("P%d", rowIdx), r.OpenBacklog)
		rowIdx++
	}

	_ = f.SetColWidth(sheet, "A", "A", 38)
	_ = f.SetColWidth(sheet, "B", "P", 12)
}

func writeTicketsSheet(f *excelize.File, sheet string, tickets []model.ExportTicketRow) {
	headers := []string{
		"ลำดับ",
		"รหัสใบแจ้งซ่อม",
		"วันที่แจ้งซ่อม",
		"อาคาร",
		"ชั้น",
		"ห้อง/บริเวณ",
		"รายละเอียดจุดย่อย",
		"หมวดหมู่งานซ่อม",
		"หมวดหมู่ย่อย/รายการอุปกรณ์",
		"ประเภทผู้แจ้ง",
		"อาการ/รายละเอียดปัญหา",
		"สถานะ",
		"หมายเหตุ/สรุปผลการซ่อม",
		"ช่างผู้ปฏิบัติงาน",
		"เวลารับทราบงาน",
		"เวลาปิดงาน",
	}

	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	for i, t := range tickets {
		rowNum := i + 2
		subcat := t.SubcategoryName
		if subcat == "" {
			subcat = "-"
		}
		values := []interface{}{
			strconv.Itoa(i + 1),
			t.TicketCode,
			formatThaiDateTime(&t.CreatedAt),
			t.BuildingName,
			t.FloorName,
			t.RoomName,
			t.LocationDetail,
			t.CategoryName,
			subcat,
			t.ReporterTypeName,
			t.Description,
			t.StatusLabel,
			t.StatusNote,
			t.TechnicianNames,
			formatThaiDateTime(t.AcknowledgedAt),
			formatThaiDateTime(t.CompletedAt),
		}
		for colIdx, v := range values {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowNum)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	_ = f.SetColWidth(sheet, "A", "A", 8)
	_ = f.SetColWidth(sheet, "B", "C", 20)
	_ = f.SetColWidth(sheet, "D", "H", 26)
	_ = f.SetColWidth(sheet, "J", "M", 34)
	_ = f.SetColWidth(sheet, "N", "O", 20)
}

func formatThaiDateTime(ts *time.Time) string {
	if ts == nil || ts.IsZero() {
		return "-"
	}
	return ts.In(bkkZone).Format("2006-01-02 15:04")
}
