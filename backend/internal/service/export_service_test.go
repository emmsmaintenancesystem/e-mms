package service

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/emms/backend/internal/model"
	"github.com/xuri/excelize/v2"
)

func TestGenerateCSVWithUTF8BOM(t *testing.T) {
	now := time.Date(2026, 11, 20, 9, 15, 0, 0, time.UTC)
	rows := []model.ExportTicketRow{
		{
			TicketCode:       "MMS-202611-001",
			CreatedAt:        now,
			BuildingName:     "อาคารปฏิบัติการและเรียนรวม",
			FloorName:        "ชั้น 2",
			RoomName:         "ห้องบรรยายรวม 2 (1201)",
			LocationDetail:   "แอร์ตัวที่ 1 หน้าห้อง",
			CategoryName:     "ระบบเครื่องปรับอากาศและระบายอากาศ",
			ReporterTypeName: "นักศึกษา",
			Description:      "แอร์ไม่เย็นและมีน้ำหยด",
			Status:           model.StatusCompleted,
			StatusLabel:      model.ThaiStatusLabel(model.StatusCompleted),
			StatusNote:       "ล้างท่อน้ำทิ้งและเติมน้ำยาแอร์เรียบร้อย",
			TechnicianNames:  "นายสมชาย สายฟ้า",
			AcknowledgedAt:   &now,
			CompletedAt:      &now,
		},
	}

	csvBytes, err := GenerateCSV(rows)
	if err != nil {
		t.Fatalf("GenerateCSV failed: %v", err)
	}

	// Verify UTF-8 BOM (\xEF\xBB\xBF) is present at the very beginning
	if len(csvBytes) < 3 || csvBytes[0] != 0xEF || csvBytes[1] != 0xBB || csvBytes[2] != 0xBF {
		t.Fatalf("expected CSV to start with UTF-8 BOM (EF BB BF)")
	}

	content := string(csvBytes[3:])
	if !strings.Contains(content, "รหัสใบแจ้งซ่อม") || !strings.Contains(content, "MMS-202611-001") {
		t.Fatalf("CSV content missing expected Thai headers or ticket row:\n%s", content)
	}
}

func TestGenerateXLSXMultiSheet(t *testing.T) {
	now := time.Date(2026, 11, 20, 9, 15, 0, 0, time.UTC)
	summary := &model.ReportSummaryResponse{
		Filter: model.ReportFilter{Year: 2026, Month: 0},
		Overview: model.ReportOverview{
			TotalTickets:   10,
			OpenBacklog:    2,
			CompletedCount: 8,
			CompletionRate: 80.0,
		},
		ByCategory: []model.CategoryStatItem{
			{CategoryID: 1, CategoryName: "ระบบไฟฟ้าและแสงสว่าง", Total: 10, Completed: 8, OpenBacklog: 2, Percentage: 100},
		},
		ExecutiveMatrix: []model.ExecutiveMatrixRow{
			{CategoryID: 1, CategoryName: "ระบบไฟฟ้าและแสงสว่าง", Months: [12]int{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0}, Total: 10, Completed: 8, OpenBacklog: 2},
		},
	}
	rows := []model.ExportTicketRow{
		{
			TicketCode:       "MMS-202611-001",
			CreatedAt:        now,
			BuildingName:     "อาคารอำนวยการและบริหาร",
			FloorName:        "ชั้น 1",
			RoomName:         "ห้องสำนักงานบริหาร (101)",
			CategoryName:     "ระบบไฟฟ้าและแสงสว่าง",
			ReporterTypeName: "เจ้าหน้าที่",
			Description:      "เปลี่ยนหลอดไฟ",
			Status:           model.StatusCompleted,
			StatusLabel:      model.ThaiStatusLabel(model.StatusCompleted),
		},
	}

	xlsxBytes, err := GenerateXLSX(summary, rows)
	if err != nil {
		t.Fatalf("GenerateXLSX failed: %v", err)
	}

	wb, err := excelize.OpenReader(bytes.NewReader(xlsxBytes))
	if err != nil {
		t.Fatalf("failed to open generated XLSX: %v", err)
	}
	defer func() { _ = wb.Close() }()

	sheets := wb.GetSheetList()
	if len(sheets) != 3 {
		t.Fatalf("expected 3 sheets in XLSX, got %v", sheets)
	}
}
