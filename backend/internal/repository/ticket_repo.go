package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/emms/backend/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pgTicketRepo struct {
	pool *pgxpool.Pool
}

// NewTicketRepository creates a PostgreSQL-backed TicketRepository.
func NewTicketRepository(pool *pgxpool.Pool) TicketRepository {
	return &pgTicketRepo{pool: pool}
}

// CheckDuplicate checks for existing open tickets (pending, in_progress, waiting_parts)
// in the exact same room_id and category_id (and subcategory_id when provided) (ADR-005).
func (r *pgTicketRepo) CheckDuplicate(ctx context.Context, roomID int, categoryID int, subcategoryID int) ([]model.DuplicateTicketSummary, error) {
	query := `
		SELECT t.ticket_code, t.status, rm.name AS room_name, c.name AS category_name,
		       t.subcategory_id, sc.name AS subcategory_name,
		       t.location_detail, t.description, t.created_at
		FROM tickets t
		JOIN rooms rm ON rm.id = t.room_id
		JOIN categories c ON c.id = t.category_id
		LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
		WHERE t.room_id = $1
		  AND t.category_id = $2
		  AND ($3::int = 0 OR t.subcategory_id = $3)
		  AND t.status IN ('pending', 'in_progress', 'waiting_parts')
		ORDER BY t.created_at DESC
		LIMIT 5
	`
	rows, err := r.pool.Query(ctx, query, roomID, categoryID, subcategoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.DuplicateTicketSummary, 0)
	for rows.Next() {
		var item model.DuplicateTicketSummary
		if err := rows.Scan(
			&item.TicketCode,
			&item.Status,
			&item.RoomName,
			&item.CategoryName,
			&item.SubcategoryID,
			&item.SubcategoryName,
			&item.LocationDetail,
			&item.Description,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		item.StatusLabel = model.ThaiStatusLabel(item.Status)
		result = append(result, item)
	}
	return result, rows.Err()
}

// CreateTicket atomically creates a ticket (generating MMS-YYYYMM-NNN via next_ticket_code()),
// inserts 1-3 before photos, and logs the initial pending status.
func (r *pgTicketRepo) CreateTicket(ctx context.Context, input model.CreateTicketInput) (*model.Ticket, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	insertTicketSQL := `
		INSERT INTO tickets (
			building_id, floor_id, room_id, location_detail,
			category_id, subcategory_id, reporter_type_id, description, status
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
		RETURNING id
	`
	var ticketID int
	err = tx.QueryRow(ctx, insertTicketSQL,
		input.BuildingID,
		input.FloorID,
		input.RoomID,
		cleanNullStr(input.LocationDetail),
		input.CategoryID,
		input.SubcategoryID,
		input.ReporterTypeID,
		strings.TrimSpace(input.Description),
	).Scan(&ticketID)
	if err != nil {
		return nil, mapPgError(err)
	}

	insertPhotoSQL := `
		INSERT INTO ticket_photos (
			ticket_id, photo_type, storage_path, public_url,
			mime_type, file_size_bytes, display_order
		)
		VALUES ($1, 'before', $2, $3, $4, $5, $6)
	`
	for i, p := range input.Photos {
		order := p.DisplayOrder
		if order <= 0 {
			order = i + 1
		}
		if _, err := tx.Exec(ctx, insertPhotoSQL,
			ticketID,
			p.StoragePath,
			p.PublicURL,
			p.MimeType,
			p.FileSizeBytes,
			order,
		); err != nil {
			return nil, mapPgError(err)
		}
	}

	initialNote := "ผู้แจ้งซ่อมส่งรายการแจ้งซ่อมใหม่เข้าระบบ"
	insertLogSQL := `
		INSERT INTO ticket_status_logs (ticket_id, from_status, to_status, note)
		VALUES ($1, NULL, 'pending', $2)
	`
	if _, err := tx.Exec(ctx, insertLogSQL, ticketID, initialNote); err != nil {
		return nil, mapPgError(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, ticketID)
}

const baseTicketSelectSQL = `
	SELECT
		t.id, t.ticket_code,
		t.building_id, b.name AS building_name,
		t.floor_id, f.name AS floor_name,
		t.room_id, rm.code AS room_code, rm.name AS room_name,
		t.location_detail,
		t.category_id, c.name AS category_name,
		t.subcategory_id, sc.name AS subcategory_name,
		t.reporter_type_id, rt.name AS reporter_type_name,
		t.description, t.status, t.status_note,
		t.acknowledged_by_user_id, u_ack.display_name AS acknowledged_by_name, t.acknowledged_at,
		t.closed_by_user_id, u_cls.display_name AS closed_by_name, t.completed_at,
		t.created_at, t.updated_at
	FROM tickets t
	JOIN buildings b ON b.id = t.building_id
	JOIN floors f ON f.id = t.floor_id
	JOIN rooms rm ON rm.id = t.room_id
	JOIN categories c ON c.id = t.category_id
	LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
	JOIN reporter_types rt ON rt.id = t.reporter_type_id
	LEFT JOIN users u_ack ON u_ack.id = t.acknowledged_by_user_id
	LEFT JOIN users u_cls ON u_cls.id = t.closed_by_user_id
`

// GetByCode retrieves full ticket details (including photos, technicians, and timeline logs) by MMS-YYYYMM-NNN code.
func (r *pgTicketRepo) GetByCode(ctx context.Context, ticketCode string) (*model.Ticket, error) {
	code := model.NormalizeTicketCode(ticketCode)
	query := baseTicketSelectSQL + ` WHERE upper(t.ticket_code) = $1`
	t, err := r.scanSingleTicket(ctx, query, code)
	if err != nil {
		return nil, err
	}
	if err := r.populateTicketRelations(ctx, t, true); err != nil {
		return nil, err
	}
	return t, nil
}

// GetByID retrieves full ticket details (including photos, technicians, and timeline logs) by numeric ID.
func (r *pgTicketRepo) GetByID(ctx context.Context, id int) (*model.Ticket, error) {
	query := baseTicketSelectSQL + ` WHERE t.id = $1`
	t, err := r.scanSingleTicket(ctx, query, id)
	if err != nil {
		return nil, err
	}
	if err := r.populateTicketRelations(ctx, t, true); err != nil {
		return nil, err
	}
	return t, nil
}

func (r *pgTicketRepo) scanSingleTicket(ctx context.Context, query string, arg interface{}) (*model.Ticket, error) {
	var t model.Ticket
	err := r.pool.QueryRow(ctx, query, arg).Scan(
		&t.ID, &t.TicketCode,
		&t.BuildingID, &t.BuildingName,
		&t.FloorID, &t.FloorName,
		&t.RoomID, &t.RoomCode, &t.RoomName,
		&t.LocationDetail,
		&t.CategoryID, &t.CategoryName,
		&t.SubcategoryID, &t.SubcategoryName,
		&t.ReporterTypeID, &t.ReporterTypeName,
		&t.Description, &t.Status, &t.StatusNote,
		&t.AcknowledgedByUserID, &t.AcknowledgedByName, &t.AcknowledgedAt,
		&t.ClosedByUserID, &t.ClosedByName, &t.CompletedAt,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	t.StatusLabel = model.ThaiStatusLabel(t.Status)
	t.BeforePhotos = make([]model.TicketPhoto, 0)
	t.AfterPhotos = make([]model.TicketPhoto, 0)
	t.Technicians = make([]model.TicketTechnician, 0)
	t.StatusLogs = make([]model.TicketStatusLog, 0)
	return &t, nil
}

func (r *pgTicketRepo) populateTicketRelations(ctx context.Context, t *model.Ticket, includeLogs bool) error {
	// 1. Photos
	photoSQL := `
		SELECT id, ticket_id, photo_type, storage_path, public_url,
		       mime_type, file_size_bytes, display_order, uploaded_by_user_id, created_at
		FROM ticket_photos
		WHERE ticket_id = $1
		ORDER BY photo_type ASC, display_order ASC
	`
	pRows, err := r.pool.Query(ctx, photoSQL, t.ID)
	if err != nil {
		return err
	}
	defer pRows.Close()

	for pRows.Next() {
		var p model.TicketPhoto
		if err := pRows.Scan(
			&p.ID, &p.TicketID, &p.PhotoType, &p.StoragePath, &p.PublicURL,
			&p.MimeType, &p.FileSizeBytes, &p.DisplayOrder, &p.UploadedByUserID, &p.CreatedAt,
		); err != nil {
			return err
		}
		if p.PhotoType == model.PhotoTypeAfter {
			t.AfterPhotos = append(t.AfterPhotos, p)
		} else {
			t.BeforePhotos = append(t.BeforePhotos, p)
		}
	}
	if err := pRows.Err(); err != nil {
		return err
	}

	// 2. Assigned Technicians
	techSQL := `
		SELECT tt.ticket_id, tt.technician_id, tech.full_name, tech.nickname, tech.specialty, tt.assigned_at
		FROM ticket_technicians tt
		JOIN technicians tech ON tech.id = tt.technician_id
		WHERE tt.ticket_id = $1
		ORDER BY tech.sort_order ASC, tech.id ASC
	`
	tRows, err := r.pool.Query(ctx, techSQL, t.ID)
	if err != nil {
		return err
	}
	defer tRows.Close()

	for tRows.Next() {
		var tt model.TicketTechnician
		if err := tRows.Scan(&tt.TicketID, &tt.TechnicianID, &tt.FullName, &tt.Nickname, &tt.Specialty, &tt.AssignedAt); err != nil {
			return err
		}
		t.Technicians = append(t.Technicians, tt)
	}
	if err := tRows.Err(); err != nil {
		return err
	}

	if !includeLogs {
		return nil
	}

	// 3. Status Logs (Timeline)
	logSQL := `
		SELECT l.id, l.ticket_id, l.from_status, l.to_status, l.note,
		       l.changed_by_user_id, u.display_name AS changed_by_name, l.created_at
		FROM ticket_status_logs l
		LEFT JOIN users u ON u.id = l.changed_by_user_id
		WHERE l.ticket_id = $1
		ORDER BY l.created_at ASC, l.id ASC
	`
	lRows, err := r.pool.Query(ctx, logSQL, t.ID)
	if err != nil {
		return err
	}
	defer lRows.Close()

	for lRows.Next() {
		var l model.TicketStatusLog
		if err := lRows.Scan(
			&l.ID, &l.TicketID, &l.FromStatus, &l.ToStatus, &l.Note,
			&l.ChangedByUserID, &l.ChangedByName, &l.CreatedAt,
		); err != nil {
			return err
		}
		t.StatusLogs = append(t.StatusLogs, l)
	}
	return lRows.Err()
}

// ListPublicBoard returns the public summary board strictly WITHOUT photo URLs or internal admin notes (ADR-005).
func (r *pgTicketRepo) ListPublicBoard(ctx context.Context, limit int, status string, buildingID int) (*model.PublicBoardResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	countSQL := `
		SELECT COUNT(*)
		FROM tickets t
		WHERE ($1::text = '' OR t.status = $1)
		  AND ($2::int = 0 OR t.building_id = $2)
	`
	var total int
	if err := r.pool.QueryRow(ctx, countSQL, status, buildingID).Scan(&total); err != nil {
		return nil, err
	}

	query := `
		SELECT
			t.ticket_code,
			t.building_id, b.name AS building_name,
			f.name AS floor_name,
			rm.name AS room_name,
			t.location_detail,
			t.category_id, c.name AS category_name,
			t.subcategory_id, sc.name AS subcategory_name,
			t.status,
			t.created_at, t.updated_at
		FROM tickets t
		JOIN buildings b ON b.id = t.building_id
		JOIN floors f ON f.id = t.floor_id
		JOIN rooms rm ON rm.id = t.room_id
		JOIN categories c ON c.id = t.category_id
		LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
		WHERE ($1::text = '' OR t.status = $1)
		  AND ($2::int = 0 OR t.building_id = $2)
		ORDER BY t.created_at DESC
		LIMIT $3
	`
	rows, err := r.pool.Query(ctx, query, status, buildingID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.PublicBoardItem, 0)
	for rows.Next() {
		var item model.PublicBoardItem
		if err := rows.Scan(
			&item.TicketCode,
			&item.BuildingID, &item.BuildingName,
			&item.FloorName,
			&item.RoomName,
			&item.LocationDetail,
			&item.CategoryID, &item.CategoryName,
			&item.SubcategoryID, &item.SubcategoryName,
			&item.Status,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.StatusLabel = model.ThaiStatusLabel(item.Status)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &model.PublicBoardResponse{
		Items: items,
		Total: total,
	}, nil
}

// ListStaffTickets queries tickets with full filtering and pagination for Technician, Reporter, and Admin views.
func (r *pgTicketRepo) ListStaffTickets(ctx context.Context, filter model.TicketFilter) (*model.PaginatedTicketsResponse, error) {
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	searchPattern := ""
	if s := strings.TrimSpace(filter.Search); s != "" {
		searchPattern = "%" + s + "%"
	}

	whereClause := `
		WHERE ($1::text = '' OR t.status = $1)
		  AND ($2::int = 0 OR t.building_id = $2)
		  AND ($3::int = 0 OR t.floor_id = $3)
		  AND ($4::int = 0 OR t.room_id = $4)
		  AND ($5::int = 0 OR t.category_id = $5)
		  AND ($6::int = 0 OR EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $6)
		  AND ($7::int = 0 OR EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int = $7)
		  AND ($8::text = '' OR (
		       t.ticket_code ILIKE $8
		       OR t.description ILIKE $8
		       OR rm.name ILIKE $8
		       OR COALESCE(t.location_detail, '') ILIKE $8
		       OR COALESCE(sc.name, '') ILIKE $8
		  ))
		  AND ($9::int = 0 OR t.subcategory_id = $9)
	`

	countSQL := `
		SELECT COUNT(*)
		FROM tickets t
		JOIN rooms rm ON rm.id = t.room_id
		LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
	` + whereClause

	var total int
	err := r.pool.QueryRow(ctx, countSQL,
		filter.Status,
		filter.BuildingID,
		filter.FloorID,
		filter.RoomID,
		filter.CategoryID,
		filter.Year,
		filter.Month,
		searchPattern,
		filter.SubcategoryID,
	).Scan(&total)
	if err != nil {
		return nil, err
	}

	listSQL := baseTicketSelectSQL + whereClause + `
		ORDER BY
			CASE t.status
				WHEN 'pending' THEN 1
				WHEN 'in_progress' THEN 2
				WHEN 'waiting_parts' THEN 3
				WHEN 'completed' THEN 4
				WHEN 'unrepairable' THEN 5
				WHEN 'cancelled' THEN 6
				ELSE 7
			END ASC,
			t.created_at DESC
		LIMIT $10 OFFSET $11
	`

	rows, err := r.pool.Query(ctx, listSQL,
		filter.Status,
		filter.BuildingID,
		filter.FloorID,
		filter.RoomID,
		filter.CategoryID,
		filter.Year,
		filter.Month,
		searchPattern,
		filter.SubcategoryID,
		filter.Limit,
		filter.Offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.Ticket, 0)
	ticketIndex := make(map[int]int)
	ticketIDs := make([]int, 0)

	for rows.Next() {
		var t model.Ticket
		if err := rows.Scan(
			&t.ID, &t.TicketCode,
			&t.BuildingID, &t.BuildingName,
			&t.FloorID, &t.FloorName,
			&t.RoomID, &t.RoomCode, &t.RoomName,
			&t.LocationDetail,
			&t.CategoryID, &t.CategoryName,
			&t.SubcategoryID, &t.SubcategoryName,
			&t.ReporterTypeID, &t.ReporterTypeName,
			&t.Description, &t.Status, &t.StatusNote,
			&t.AcknowledgedByUserID, &t.AcknowledgedByName, &t.AcknowledgedAt,
			&t.ClosedByUserID, &t.ClosedByName, &t.CompletedAt,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		t.StatusLabel = model.ThaiStatusLabel(t.Status)
		t.BeforePhotos = make([]model.TicketPhoto, 0)
		t.AfterPhotos = make([]model.TicketPhoto, 0)
		t.Technicians = make([]model.TicketTechnician, 0)

		ticketIndex[t.ID] = len(items)
		ticketIDs = append(ticketIDs, t.ID)
		items = append(items, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Batch load photos and assigned technicians for returned tickets
	if len(ticketIDs) > 0 {
		pRows, err := r.pool.Query(ctx, `
			SELECT id, ticket_id, photo_type, storage_path, public_url,
			       mime_type, file_size_bytes, display_order, uploaded_by_user_id, created_at
			FROM ticket_photos
			WHERE ticket_id = ANY($1)
			ORDER BY ticket_id ASC, photo_type ASC, display_order ASC
		`, ticketIDs)
		if err != nil {
			return nil, err
		}
		defer pRows.Close()

		for pRows.Next() {
			var p model.TicketPhoto
			if err := pRows.Scan(
				&p.ID, &p.TicketID, &p.PhotoType, &p.StoragePath, &p.PublicURL,
				&p.MimeType, &p.FileSizeBytes, &p.DisplayOrder, &p.UploadedByUserID, &p.CreatedAt,
			); err != nil {
				return nil, err
			}
			if idx, ok := ticketIndex[p.TicketID]; ok {
				if p.PhotoType == model.PhotoTypeAfter {
					items[idx].AfterPhotos = append(items[idx].AfterPhotos, p)
				} else {
					items[idx].BeforePhotos = append(items[idx].BeforePhotos, p)
				}
			}
		}
		if err := pRows.Err(); err != nil {
			return nil, err
		}

		tRows, err := r.pool.Query(ctx, `
			SELECT tt.ticket_id, tt.technician_id, tech.full_name, tech.nickname, tech.specialty, tt.assigned_at
			FROM ticket_technicians tt
			JOIN technicians tech ON tech.id = tt.technician_id
			WHERE tt.ticket_id = ANY($1)
			ORDER BY tt.ticket_id ASC, tech.sort_order ASC, tech.id ASC
		`, ticketIDs)
		if err != nil {
			return nil, err
		}
		defer tRows.Close()

		for tRows.Next() {
			var tt model.TicketTechnician
			if err := tRows.Scan(&tt.TicketID, &tt.TechnicianID, &tt.FullName, &tt.Nickname, &tt.Specialty, &tt.AssignedAt); err != nil {
				return nil, err
			}
			if idx, ok := ticketIndex[tt.TicketID]; ok {
				items[idx].Technicians = append(items[idx].Technicians, tt)
			}
		}
		if err := tRows.Err(); err != nil {
			return nil, err
		}
	}

	return &model.PaginatedTicketsResponse{
		Items:  items,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}, nil
}

// AcknowledgeTicket implements the 1-click "รับทราบงาน" button for any technician on the team (ADR-006).
func (r *pgTicketRepo) AcknowledgeTicket(ctx context.Context, ticketID int, userID int, note *string) (*model.Ticket, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentStatus string
	err = tx.QueryRow(ctx, "SELECT status FROM tickets WHERE id = $1 FOR UPDATE", ticketID).Scan(&currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	ackNote := cleanNullStr(note)
	if ackNote == nil {
		defaultNote := "ทีมช่างกดรับทราบงานและกำลังเข้าตรวจสอบหน้างาน"
		ackNote = &defaultNote
	}

	updateSQL := `
		UPDATE tickets
		SET status = 'in_progress',
		    status_note = COALESCE($1, status_note),
		    acknowledged_by_user_id = COALESCE(acknowledged_by_user_id, $2),
		    acknowledged_at = COALESCE(acknowledged_at, now())
		WHERE id = $3
	`
	if _, err := tx.Exec(ctx, updateSQL, ackNote, userID, ticketID); err != nil {
		return nil, mapPgError(err)
	}

	logSQL := `
		INSERT INTO ticket_status_logs (ticket_id, from_status, to_status, note, changed_by_user_id)
		VALUES ($1, $2, 'in_progress', $3, $4)
	`
	if _, err := tx.Exec(ctx, logSQL, ticketID, currentStatus, ackNote, userID); err != nil {
		return nil, mapPgError(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, ticketID)
}

// UpdateTicketStatus executes a transactional status transition across the 6 allowed statuses,
// recording assigned technicians, after-repair photos, and status timeline logs (ADR-006).
func (r *pgTicketRepo) UpdateTicketStatus(ctx context.Context, input model.UpdateStatusInput) (*model.Ticket, error) {
	if !model.IsValidTicketStatus(input.ToStatus) {
		return nil, fmt.Errorf("%w: invalid status %s", ErrInvalidInput, input.ToStatus)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentStatus string
	err = tx.QueryRow(ctx, "SELECT status FROM tickets WHERE id = $1 FOR UPDATE", input.TicketID).Scan(&currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	notePtr := cleanNullStr(input.Note)

	switch input.ToStatus {
	case model.StatusInProgress:
		updateSQL := `
			UPDATE tickets
			SET status = $1,
			    status_note = $2,
			    acknowledged_by_user_id = COALESCE(acknowledged_by_user_id, $3),
			    acknowledged_at = COALESCE(acknowledged_at, now())
			WHERE id = $4
		`
		if _, err := tx.Exec(ctx, updateSQL, input.ToStatus, notePtr, input.ActorUserID, input.TicketID); err != nil {
			return nil, mapPgError(err)
		}

	case model.StatusCompleted, model.StatusUnrepairable:
		updateSQL := `
			UPDATE tickets
			SET status = $1,
			    status_note = $2,
			    acknowledged_by_user_id = COALESCE(acknowledged_by_user_id, $3),
			    acknowledged_at = COALESCE(acknowledged_at, now()),
			    closed_by_user_id = $3,
			    completed_at = now()
			WHERE id = $4
		`
		if _, err := tx.Exec(ctx, updateSQL, input.ToStatus, notePtr, input.ActorUserID, input.TicketID); err != nil {
			return nil, mapPgError(err)
		}

	default:
		updateSQL := `
			UPDATE tickets
			SET status = $1,
			    status_note = $2
			WHERE id = $3
		`
		if _, err := tx.Exec(ctx, updateSQL, input.ToStatus, notePtr, input.TicketID); err != nil {
			return nil, mapPgError(err)
		}
	}

	// Update assigned technicians when provided (mandatory for completed & unrepairable)
	if len(input.TechnicianIDs) > 0 {
		if _, err := tx.Exec(ctx, "DELETE FROM ticket_technicians WHERE ticket_id = $1", input.TicketID); err != nil {
			return nil, mapPgError(err)
		}
		seenTech := make(map[int]bool)
		for _, techID := range input.TechnicianIDs {
			if techID <= 0 || seenTech[techID] {
				continue
			}
			seenTech[techID] = true
			if _, err := tx.Exec(ctx, `
				INSERT INTO ticket_technicians (ticket_id, technician_id)
				VALUES ($1, $2)
			`, input.TicketID, techID); err != nil {
				return nil, mapPgError(err)
			}
		}
	}

	// Insert after-repair photos when provided (mandatory 1-3 photos for completed)
	if len(input.AfterPhotos) > 0 {
		if _, err := tx.Exec(ctx, "DELETE FROM ticket_photos WHERE ticket_id = $1 AND photo_type = 'after'", input.TicketID); err != nil {
			return nil, mapPgError(err)
		}
		insertPhotoSQL := `
			INSERT INTO ticket_photos (
				ticket_id, photo_type, storage_path, public_url,
				mime_type, file_size_bytes, display_order, uploaded_by_user_id
			)
			VALUES ($1, 'after', $2, $3, $4, $5, $6, $7)
		`
		for i, p := range input.AfterPhotos {
			order := p.DisplayOrder
			if order <= 0 {
				order = i + 1
			}
			if _, err := tx.Exec(ctx, insertPhotoSQL,
				input.TicketID,
				p.StoragePath,
				p.PublicURL,
				p.MimeType,
				p.FileSizeBytes,
				order,
				input.ActorUserID,
			); err != nil {
				return nil, mapPgError(err)
			}
		}
	}

	// Append status timeline log
	logSQL := `
		INSERT INTO ticket_status_logs (ticket_id, from_status, to_status, note, changed_by_user_id)
		VALUES ($1, $2, $3, $4, $5)
	`
	if _, err := tx.Exec(ctx, logSQL, input.TicketID, currentStatus, input.ToStatus, notePtr, input.ActorUserID); err != nil {
		return nil, mapPgError(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, input.TicketID)
}
