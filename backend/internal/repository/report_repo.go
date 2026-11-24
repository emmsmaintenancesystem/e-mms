package repository

import (
	"context"
	"math"
	"time"

	"github.com/emms/backend/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

var thaiShortMonths = [12]string{
	"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
}

type pgReportRepo struct {
	pool *pgxpool.Pool
}

// NewReportRepository creates a PostgreSQL-backed ReportRepository.
func NewReportRepository(pool *pgxpool.Pool) ReportRepository {
	return &pgReportRepo{pool: pool}
}

func normalizeReportFilter(f model.ReportFilter) model.ReportFilter {
	if f.Year <= 0 {
		bkk := time.FixedZone("ICT", 7*3600)
		f.Year = time.Now().In(bkk).Year()
	}
	if f.Month < 0 || f.Month > 12 {
		f.Month = 0
	}
	return f
}

// GetReportSummary builds the comprehensive executive statistical report (ADR-008):
// - Overview & SLA durations
// - 6-Status breakdown
// - 12-Month trend
// - Category ranking
// - Building & Hotspot Rooms ranking
// - Executive Cross-Tab Matrices (Category x 12 Months and Building x 12 Months)
// - Technician performance
func (r *pgReportRepo) GetReportSummary(ctx context.Context, filter model.ReportFilter) (*model.ReportSummaryResponse, error) {
	filter = normalizeReportFilter(filter)

	resp := &model.ReportSummaryResponse{
		Filter:              filter,
		StatusBreakdown:     make([]model.StatusStatItem, 0, 6),
		MonthlyTrend:        make([]model.MonthlyTrendItem, 12),
		ByCategory:          make([]model.CategoryStatItem, 0),
		ByBuilding:          make([]model.BuildingStatItem, 0),
		TopRooms:            make([]model.RoomHotspotItem, 0),
		ExecutiveMatrix:     make([]model.ExecutiveMatrixRow, 0),
		BuildingMonthMatrix: make([]model.ExecutiveMatrixRow, 0),
		ByTechnician:        make([]model.TechnicianStatItem, 0),
	}

	// 1. Overview & Status counts
	overviewSQL := `
		SELECT
			COUNT(*) AS total_tickets,
			COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress', 'waiting_parts')) AS open_backlog,
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
			COUNT(*) FILTER (WHERE status = 'waiting_parts') AS waiting_parts_count,
			COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
			COUNT(*) FILTER (WHERE status = 'unrepairable') AS unrepairable_count,
			COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
			COALESCE(AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at)) / 60.0)
				FILTER (WHERE acknowledged_at IS NOT NULL AND acknowledged_at >= created_at), 0) AS avg_ack_minutes,
			COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0)
				FILTER (WHERE completed_at IS NOT NULL AND completed_at >= created_at AND status = 'completed'), 0) AS avg_resolve_hours
		FROM tickets t
		WHERE EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
		  AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
		  AND ($3::int = 0 OR t.building_id = $3)
		  AND ($4::int = 0 OR t.category_id = $4)
		  AND ($5::text = '' OR t.status = $5)
	`
	var ov model.ReportOverview
	err := r.pool.QueryRow(ctx, overviewSQL,
		filter.Year, filter.Month, filter.BuildingID, filter.CategoryID, filter.Status,
	).Scan(
		&ov.TotalTickets,
		&ov.OpenBacklog,
		&ov.PendingCount,
		&ov.InProgressCount,
		&ov.WaitingPartsCount,
		&ov.CompletedCount,
		&ov.UnrepairableCount,
		&ov.CancelledCount,
		&ov.AvgAckMinutes,
		&ov.AvgResolveHours,
	)
	if err != nil {
		return nil, err
	}
	ov.AvgAckMinutes = round2(ov.AvgAckMinutes)
	ov.AvgResolveHours = round2(ov.AvgResolveHours)
	if ov.TotalTickets > 0 {
		ov.CompletionRate = round2(float64(ov.CompletedCount) * 100.0 / float64(ov.TotalTickets))
	}
	resp.Overview = ov

	// 2. Status Breakdown (all 6 canonical statuses)
	statusCounts := map[string]int{
		model.StatusPending:      ov.PendingCount,
		model.StatusInProgress:   ov.InProgressCount,
		model.StatusWaitingParts: ov.WaitingPartsCount,
		model.StatusCompleted:    ov.CompletedCount,
		model.StatusUnrepairable: ov.UnrepairableCount,
		model.StatusCancelled:    ov.CancelledCount,
	}
	for _, st := range model.AllStatuses {
		cnt := statusCounts[st]
		pct := 0.0
		if ov.TotalTickets > 0 {
			pct = round2(float64(cnt) * 100.0 / float64(ov.TotalTickets))
		}
		resp.StatusBreakdown = append(resp.StatusBreakdown, model.StatusStatItem{
			Status:      st,
			StatusLabel: model.ThaiStatusLabel(st),
			Count:       cnt,
			Percentage:  pct,
		})
	}

	// 3. Monthly Trend (Jan..Dec for the selected year)
	for m := 1; m <= 12; m++ {
		resp.MonthlyTrend[m-1] = model.MonthlyTrendItem{
			Month:      m,
			MonthLabel: thaiShortMonths[m-1],
		}
	}
	trendSQL := `
		SELECT
			EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int AS m,
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_backlog,
			COUNT(*) FILTER (WHERE t.status = 'completed') AS completed,
			COUNT(*) FILTER (WHERE t.status = 'unrepairable') AS unrepairable,
			COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
		FROM tickets t
		WHERE EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
		  AND ($2::int = 0 OR t.building_id = $2)
		  AND ($3::int = 0 OR t.category_id = $3)
		  AND ($4::text = '' OR t.status = $4)
		GROUP BY m
		ORDER BY m ASC
	`
	tRows, err := r.pool.Query(ctx, trendSQL, filter.Year, filter.BuildingID, filter.CategoryID, filter.Status)
	if err != nil {
		return nil, err
	}
	defer tRows.Close()
	for tRows.Next() {
		var m, total, openB, comp, unrep, canc int
		if err := tRows.Scan(&m, &total, &openB, &comp, &unrep, &canc); err != nil {
			return nil, err
		}
		if m >= 1 && m <= 12 {
			resp.MonthlyTrend[m-1].Total = total
			resp.MonthlyTrend[m-1].OpenBacklog = openB
			resp.MonthlyTrend[m-1].Completed = comp
			resp.MonthlyTrend[m-1].Unrepairable = unrep
			resp.MonthlyTrend[m-1].Cancelled = canc
		}
	}
	if err := tRows.Err(); err != nil {
		return nil, err
	}

	// 4. Breakdown by Category
	catSQL := `
		SELECT
			c.id, COALESCE(c.code, ''), c.name,
			COUNT(t.id) AS total,
			COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_backlog,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed,
			COUNT(t.id) FILTER (WHERE t.status = 'unrepairable') AS unrepairable,
			COUNT(t.id) FILTER (WHERE t.status = 'cancelled') AS cancelled
		FROM categories c
		LEFT JOIN tickets t ON t.category_id = c.id
			AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
			AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
			AND ($3::int = 0 OR t.building_id = $3)
			AND ($4::text = '' OR t.status = $4)
		WHERE ($5::int = 0 OR c.id = $5)
		GROUP BY c.id, c.code, c.name, c.sort_order
		ORDER BY total DESC, c.sort_order ASC, c.id ASC
	`
	cRows, err := r.pool.Query(ctx, catSQL, filter.Year, filter.Month, filter.BuildingID, filter.Status, filter.CategoryID)
	if err != nil {
		return nil, err
	}
	defer cRows.Close()
	for cRows.Next() {
		var item model.CategoryStatItem
		if err := cRows.Scan(
			&item.CategoryID, &item.CategoryCode, &item.CategoryName,
			&item.Total, &item.OpenBacklog, &item.Completed, &item.Unrepairable, &item.Cancelled,
		); err != nil {
			return nil, err
		}
		if ov.TotalTickets > 0 {
			item.Percentage = round2(float64(item.Total) * 100.0 / float64(ov.TotalTickets))
		}
		resp.ByCategory = append(resp.ByCategory, item)
	}
	if err := cRows.Err(); err != nil {
		return nil, err
	}

	// 5. Breakdown by Building
	bldSQL := `
		SELECT
			b.id, COALESCE(b.code, ''), b.name,
			COUNT(t.id) AS total,
			COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_backlog,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed,
			COUNT(t.id) FILTER (WHERE t.status = 'unrepairable') AS unrepairable,
			COUNT(t.id) FILTER (WHERE t.status = 'cancelled') AS cancelled
		FROM buildings b
		LEFT JOIN tickets t ON t.building_id = b.id
			AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
			AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
			AND ($3::int = 0 OR t.category_id = $3)
			AND ($4::text = '' OR t.status = $4)
		WHERE ($5::int = 0 OR b.id = $5)
		GROUP BY b.id, b.code, b.name, b.sort_order
		ORDER BY total DESC, b.sort_order ASC, b.id ASC
	`
	bRows, err := r.pool.Query(ctx, bldSQL, filter.Year, filter.Month, filter.CategoryID, filter.Status, filter.BuildingID)
	if err != nil {
		return nil, err
	}
	defer bRows.Close()
	for bRows.Next() {
		var item model.BuildingStatItem
		if err := bRows.Scan(
			&item.BuildingID, &item.BuildingCode, &item.BuildingName,
			&item.Total, &item.OpenBacklog, &item.Completed, &item.Unrepairable, &item.Cancelled,
		); err != nil {
			return nil, err
		}
		if ov.TotalTickets > 0 {
			item.Percentage = round2(float64(item.Total) * 100.0 / float64(ov.TotalTickets))
		}
		resp.ByBuilding = append(resp.ByBuilding, item)
	}
	if err := bRows.Err(); err != nil {
		return nil, err
	}

	// 6. Top 10 Hotspot Rooms (ห้อง/บริเวณที่ถูกแจ้งซ่อมบ่อยที่สุด)
	roomSQL := `
		SELECT
			rm.id, COALESCE(rm.code, ''), rm.name, f.name AS floor_name, b.name AS building_name,
			COUNT(t.id) AS total,
			COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_backlog,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed,
			COALESCE((
				SELECT c2.name
				FROM tickets t2
				JOIN categories c2 ON c2.id = t2.category_id
				WHERE t2.room_id = rm.id
				  AND EXTRACT(YEAR FROM t2.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
				GROUP BY c2.name
				ORDER BY COUNT(*) DESC
				LIMIT 1
			), '-') AS top_category
		FROM tickets t
		JOIN rooms rm ON rm.id = t.room_id
		JOIN floors f ON f.id = t.floor_id
		JOIN buildings b ON b.id = t.building_id
		WHERE EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
		  AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
		  AND ($3::int = 0 OR t.building_id = $3)
		  AND ($4::int = 0 OR t.category_id = $4)
		  AND ($5::text = '' OR t.status = $5)
		GROUP BY rm.id, rm.code, rm.name, f.name, b.name
		ORDER BY total DESC, open_backlog DESC, rm.id ASC
		LIMIT 10
	`
	rmRows, err := r.pool.Query(ctx, roomSQL, filter.Year, filter.Month, filter.BuildingID, filter.CategoryID, filter.Status)
	if err != nil {
		return nil, err
	}
	defer rmRows.Close()
	for rmRows.Next() {
		var item model.RoomHotspotItem
		if err := rmRows.Scan(
			&item.RoomID, &item.RoomCode, &item.RoomName, &item.FloorName, &item.BuildingName,
			&item.Total, &item.OpenBacklog, &item.Completed, &item.TopCategory,
		); err != nil {
			return nil, err
		}
		resp.TopRooms = append(resp.TopRooms, item)
	}
	if err := rmRows.Err(); err != nil {
		return nil, err
	}

	// 7. Executive Cross-Tab Matrix 1: Category x 12 Months (filtered by Year and optional BuildingID)
	catMatrixSQL := `
		SELECT
			c.id, c.name,
			COALESCE(EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int, 0) AS m,
			COUNT(t.id) AS cnt,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS comp_cnt,
			COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_cnt
		FROM categories c
		LEFT JOIN tickets t ON t.category_id = c.id
			AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
			AND ($2::int = 0 OR t.building_id = $2)
			AND ($3::text = '' OR t.status = $3)
		WHERE ($4::int = 0 OR c.id = $4)
		GROUP BY c.id, c.name, c.sort_order, m
		ORDER BY c.sort_order ASC, c.id ASC, m ASC
	`
	cmRows, err := r.pool.Query(ctx, catMatrixSQL, filter.Year, filter.BuildingID, filter.Status, filter.CategoryID)
	if err != nil {
		return nil, err
	}
	defer cmRows.Close()

	catMatrixMap := make(map[int]*model.ExecutiveMatrixRow)
	catOrder := make([]int, 0)
	for cmRows.Next() {
		var catID, m, cnt, compCnt, openCnt int
		var catName string
		if err := cmRows.Scan(&catID, &catName, &m, &cnt, &compCnt, &openCnt); err != nil {
			return nil, err
		}
		row, exists := catMatrixMap[catID]
		if !exists {
			row = &model.ExecutiveMatrixRow{
				BuildingID:   filter.BuildingID,
				CategoryID:   catID,
				CategoryName: catName,
			}
			catMatrixMap[catID] = row
			catOrder = append(catOrder, catID)
		}
		if m >= 1 && m <= 12 {
			row.Months[m-1] += cnt
			row.Total += cnt
			row.Completed += compCnt
			row.OpenBacklog += openCnt
		}
	}
	if err := cmRows.Err(); err != nil {
		return nil, err
	}
	for _, id := range catOrder {
		resp.ExecutiveMatrix = append(resp.ExecutiveMatrix, *catMatrixMap[id])
	}

	// 8. Executive Cross-Tab Matrix 2: Building x 12 Months (filtered by Year and optional CategoryID)
	bldMatrixSQL := `
		SELECT
			b.id, b.name,
			COALESCE(EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int, 0) AS m,
			COUNT(t.id) AS cnt,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS comp_cnt,
			COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress', 'waiting_parts')) AS open_cnt
		FROM buildings b
		LEFT JOIN tickets t ON t.building_id = b.id
			AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
			AND ($2::int = 0 OR t.category_id = $2)
			AND ($3::text = '' OR t.status = $3)
		WHERE ($4::int = 0 OR b.id = $4)
		GROUP BY b.id, b.name, b.sort_order, m
		ORDER BY b.sort_order ASC, b.id ASC, m ASC
	`
	bmRows, err := r.pool.Query(ctx, bldMatrixSQL, filter.Year, filter.CategoryID, filter.Status, filter.BuildingID)
	if err != nil {
		return nil, err
	}
	defer bmRows.Close()

	bldMatrixMap := make(map[int]*model.ExecutiveMatrixRow)
	bldOrder := make([]int, 0)
	for bmRows.Next() {
		var bldID, m, cnt, compCnt, openCnt int
		var bldName string
		if err := bmRows.Scan(&bldID, &bldName, &m, &cnt, &compCnt, &openCnt); err != nil {
			return nil, err
		}
		row, exists := bldMatrixMap[bldID]
		if !exists {
			row = &model.ExecutiveMatrixRow{
				BuildingID:   bldID,
				BuildingName: bldName,
				CategoryName: bldName,
			}
			bldMatrixMap[bldID] = row
			bldOrder = append(bldOrder, bldID)
		}
		if m >= 1 && m <= 12 {
			row.Months[m-1] += cnt
			row.Total += cnt
			row.Completed += compCnt
			row.OpenBacklog += openCnt
		}
	}
	if err := bmRows.Err(); err != nil {
		return nil, err
	}
	for _, id := range bldOrder {
		resp.BuildingMonthMatrix = append(resp.BuildingMonthMatrix, *bldMatrixMap[id])
	}

	// 9. Technician Performance Breakdown
	techSQL := `
		SELECT
			tech.id,
			tech.full_name,
			COALESCE(tech.nickname, ''),
			COALESCE(tech.specialty, ''),
			COUNT(t.id) AS total_assigned,
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed_count,
			COUNT(t.id) FILTER (WHERE t.status = 'unrepairable') AS unrepairable_count,
			COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600.0)
				FILTER (WHERE t.completed_at IS NOT NULL AND t.completed_at >= t.created_at AND t.status = 'completed'), 0) AS avg_resolve_hours
		FROM technicians tech
		LEFT JOIN ticket_technicians tt ON tt.technician_id = tech.id
		LEFT JOIN tickets t ON t.id = tt.ticket_id
			AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
			AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
			AND ($3::int = 0 OR t.building_id = $3)
			AND ($4::int = 0 OR t.category_id = $4)
		WHERE tech.is_active = true OR t.id IS NOT NULL
		GROUP BY tech.id, tech.full_name, tech.nickname, tech.specialty, tech.sort_order
		ORDER BY completed_count DESC, total_assigned DESC, tech.sort_order ASC, tech.id ASC
	`
	techRows, err := r.pool.Query(ctx, techSQL, filter.Year, filter.Month, filter.BuildingID, filter.CategoryID)
	if err != nil {
		return nil, err
	}
	defer techRows.Close()

	for techRows.Next() {
		var item model.TechnicianStatItem
		if err := techRows.Scan(
			&item.TechnicianID,
			&item.FullName,
			&item.Nickname,
			&item.Specialty,
			&item.TotalAssigned,
			&item.CompletedCount,
			&item.Unrepairable,
			&item.AvgResolveHours,
		); err != nil {
			return nil, err
		}
		item.AvgResolveHours = round2(item.AvgResolveHours)
		resp.ByTechnician = append(resp.ByTechnician, item)
	}

	return resp, techRows.Err()
}

// ListTicketsForExport retrieves all matching ticket rows for CSV and Excel (.xlsx) export.
func (r *pgReportRepo) ListTicketsForExport(ctx context.Context, filter model.ReportFilter) ([]model.ExportTicketRow, error) {
	filter = normalizeReportFilter(filter)

	query := `
		SELECT
			t.ticket_code,
			t.created_at,
			b.name AS building_name,
			f.name AS floor_name,
			rm.name AS room_name,
			COALESCE(t.location_detail, ''),
			c.name AS category_name,
			rt.name AS reporter_type_name,
			t.description,
			t.status,
			COALESCE(t.status_note, ''),
			COALESCE((
				SELECT string_agg(tech.full_name, ', ' ORDER BY tech.sort_order ASC, tech.id ASC)
				FROM ticket_technicians tt
				JOIN technicians tech ON tech.id = tt.technician_id
				WHERE tt.ticket_id = t.id
			), ''),
			t.acknowledged_at,
			t.completed_at
		FROM tickets t
		JOIN buildings b ON b.id = t.building_id
		JOIN floors f ON f.id = t.floor_id
		JOIN rooms rm ON rm.id = t.room_id
		JOIN categories c ON c.id = t.category_id
		JOIN reporter_types rt ON rt.id = t.reporter_type_id
		WHERE EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $1
		  AND ($2::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $2)
		  AND ($3::int = 0 OR t.building_id = $3)
		  AND ($4::int = 0 OR t.category_id = $4)
		  AND ($5::text = '' OR t.status = $5)
		ORDER BY t.created_at DESC
	`

	rows, err := r.pool.Query(ctx, query,
		filter.Year, filter.Month, filter.BuildingID, filter.CategoryID, filter.Status,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.ExportTicketRow, 0)
	for rows.Next() {
		var row model.ExportTicketRow
		if err := rows.Scan(
			&row.TicketCode,
			&row.CreatedAt,
			&row.BuildingName,
			&row.FloorName,
			&row.RoomName,
			&row.LocationDetail,
			&row.CategoryName,
			&row.ReporterTypeName,
			&row.Description,
			&row.Status,
			&row.StatusNote,
			&row.TechnicianNames,
			&row.AcknowledgedAt,
			&row.CompletedAt,
		); err != nil {
			return nil, err
		}
		row.StatusLabel = model.ThaiStatusLabel(row.Status)
		result = append(result, row)
	}
	return result, rows.Err()
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
