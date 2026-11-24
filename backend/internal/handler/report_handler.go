package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/emms/backend/internal/model"
	"github.com/emms/backend/internal/repository"
	"github.com/emms/backend/internal/service"
)

// ReportHandler serves statistical reporting endpoints for Reporter and Admin roles (ADR-008).
type ReportHandler struct {
	reportRepo repository.ReportRepository
}

func NewReportHandler(reportRepo repository.ReportRepository) *ReportHandler {
	return &ReportHandler{reportRepo: reportRepo}
}

func parseReportFilterFromQuery(r *http.Request) (model.ReportFilter, error) {
	bkk := time.FixedZone("ICT", 7*3600)
	currentYear := time.Now().In(bkk).Year()

	year := parseIntQuery(r, "year", currentYear)
	month := parseIntQuery(r, "month", 0)
	buildingID := parseIntQuery(r, "building_id", 0)
	categoryID := parseIntQuery(r, "category_id", 0)
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	if status != "" && !model.IsValidTicketStatus(status) {
		return model.ReportFilter{}, fmt.Errorf("สถานะที่ใช้กรองรายงานไม่ถูกต้อง")
	}

	return model.ReportFilter{
		Year:       year,
		Month:      month,
		BuildingID: buildingID,
		CategoryID: categoryID,
		Status:     status,
	}, nil
}

// GetSummary returns the full statistical report payload (Overview, 6-Status breakdown,
// Monthly Trend, Category ranking, Building & Hotspot Rooms ranking, Executive Cross-Tab
// Matrix Building x Month x Category, and Technician Performance).
func (h *ReportHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	filter, err := parseReportFilterFromQuery(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	summary, err := h.reportRepo.GetReportSummary(r.Context(), filter)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	WriteJSON(w, http.StatusOK, summary)
}

// ExportCSV generates and downloads a UTF-8 with BOM CSV file of matching tickets.
func (h *ReportHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	filter, err := parseReportFilterFromQuery(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := h.reportRepo.ListTicketsForExport(r.Context(), filter)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	csvBytes, err := service.GenerateCSV(rows)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "ไม่สามารถสร้างไฟล์ CSV ได้")
		return
	}

	filename := fmt.Sprintf("emms_report_%d", filter.Year)
	if filter.Month >= 1 && filter.Month <= 12 {
		filename = fmt.Sprintf("%s_%02d", filename, filter.Month)
	}
	filename += ".csv"

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(csvBytes)
}

// ExportXLSX generates and downloads a 3-sheet executive Excel (.xlsx) report.
func (h *ReportHandler) ExportXLSX(w http.ResponseWriter, r *http.Request) {
	filter, err := parseReportFilterFromQuery(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	summary, err := h.reportRepo.GetReportSummary(r.Context(), filter)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	rows, err := h.reportRepo.ListTicketsForExport(r.Context(), filter)
	if err != nil {
		HandleRepoError(w, err, "")
		return
	}

	xlsxBytes, err := service.GenerateXLSX(summary, rows)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "ไม่สามารถสร้างไฟล์ Excel (.xlsx) ได้")
		return
	}

	filename := fmt.Sprintf("emms_report_%d", filter.Year)
	if filter.Month >= 1 && filter.Month <= 12 {
		filename = fmt.Sprintf("%s_%02d", filename, filter.Month)
	}
	filename += ".xlsx"

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(xlsxBytes)
}
