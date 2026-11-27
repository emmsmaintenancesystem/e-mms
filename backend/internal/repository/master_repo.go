package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/emms/backend/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pgMasterRepo struct {
	pool *pgxpool.Pool
}

// NewMasterRepository creates a PostgreSQL-backed MasterRepository.
func NewMasterRepository(pool *pgxpool.Pool) MasterRepository {
	return &pgMasterRepo{pool: pool}
}

func (r *pgMasterRepo) Ping(ctx context.Context) error {
	var one int
	return r.pool.QueryRow(ctx, "SELECT 1").Scan(&one)
}

// =============================================================================
// 1. Public Master Data & Active Technicians
// =============================================================================

func (r *pgMasterRepo) GetPublicMasterData(ctx context.Context) (*model.PublicMasterDataResponse, error) {
	buildings, err := r.listBuildingsByActive(ctx, true)
	if err != nil {
		return nil, err
	}
	floors, err := r.listFloorsInternal(ctx, 0, true)
	if err != nil {
		return nil, err
	}
	rooms, err := r.listRoomsInternal(ctx, 0, 0, true)
	if err != nil {
		return nil, err
	}
	categories, err := r.listCategoriesByActive(ctx, true)
	if err != nil {
		return nil, err
	}
	subcategories, err := r.listSubcategoriesInternal(ctx, 0, true)
	if err != nil {
		return nil, err
	}
	reporterTypes, err := r.listReporterTypesByActive(ctx, true)
	if err != nil {
		return nil, err
	}

	return &model.PublicMasterDataResponse{
		Buildings:     buildings,
		Floors:        floors,
		Rooms:         rooms,
		Categories:    categories,
		Subcategories: subcategories,
		ReporterTypes: reporterTypes,
	}, nil
}

func (r *pgMasterRepo) ListActiveTechnicians(ctx context.Context) ([]model.Technician, error) {
	return r.listTechniciansByActive(ctx, true)
}

// =============================================================================
// 2. Authentication Queries
// =============================================================================

func (r *pgMasterRepo) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	query := `
		SELECT id, username, password_hash, display_name, role, is_active, last_login_at, created_at, updated_at
		FROM users
		WHERE lower(username) = lower($1)
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, strings.TrimSpace(username)).Scan(
		&u.ID,
		&u.Username,
		&u.PasswordHash,
		&u.DisplayName,
		&u.Role,
		&u.IsActive,
		&u.LastLoginAt,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *pgMasterRepo) GetUserByID(ctx context.Context, id int) (*model.User, error) {
	query := `
		SELECT id, username, password_hash, display_name, role, is_active, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID,
		&u.Username,
		&u.PasswordHash,
		&u.DisplayName,
		&u.Role,
		&u.IsActive,
		&u.LastLoginAt,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *pgMasterRepo) UpdateUserLastLogin(ctx context.Context, userID int) error {
	_, err := r.pool.Exec(ctx, "UPDATE users SET last_login_at = now() WHERE id = $1", userID)
	return err
}

// =============================================================================
// 3. Buildings CRUD
// =============================================================================

func (r *pgMasterRepo) ListBuildings(ctx context.Context) ([]model.Building, error) {
	return r.listBuildingsByActive(ctx, false)
}

func (r *pgMasterRepo) listBuildingsByActive(ctx context.Context, onlyActive bool) ([]model.Building, error) {
	query := `
		SELECT id, code, name, sort_order, is_active, created_at, updated_at
		FROM buildings
		WHERE ($1::boolean = false OR is_active = true)
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.pool.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Building, 0)
	for rows.Next() {
		var b model.Building
		if err := rows.Scan(&b.ID, &b.Code, &b.Name, &b.SortOrder, &b.IsActive, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateBuilding(ctx context.Context, b *model.Building) (*model.Building, error) {
	query := `
		INSERT INTO buildings (code, name, sort_order, is_active)
		VALUES ($1, $2, $3, $4)
		RETURNING id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Building
	err := r.pool.QueryRow(ctx, query, cleanNullStr(b.Code), strings.TrimSpace(b.Name), b.SortOrder, b.IsActive).
		Scan(&out.ID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateBuilding(ctx context.Context, b *model.Building) (*model.Building, error) {
	query := `
		UPDATE buildings
		SET code = $1, name = $2, sort_order = $3, is_active = $4
		WHERE id = $5
		RETURNING id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Building
	err := r.pool.QueryRow(ctx, query, cleanNullStr(b.Code), strings.TrimSpace(b.Name), b.SortOrder, b.IsActive, b.ID).
		Scan(&out.ID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 4. Floors CRUD
// =============================================================================

func (r *pgMasterRepo) ListFloors(ctx context.Context, buildingID int) ([]model.Floor, error) {
	return r.listFloorsInternal(ctx, buildingID, false)
}

func (r *pgMasterRepo) listFloorsInternal(ctx context.Context, buildingID int, onlyActive bool) ([]model.Floor, error) {
	query := `
		SELECT f.id, f.building_id, b.name AS building_name, f.name, f.sort_order, f.is_active, f.created_at, f.updated_at
		FROM floors f
		JOIN buildings b ON b.id = f.building_id
		WHERE ($1::int = 0 OR f.building_id = $1)
		  AND ($2::boolean = false OR (f.is_active = true AND b.is_active = true))
		ORDER BY b.sort_order ASC, f.sort_order ASC, f.id ASC
	`
	rows, err := r.pool.Query(ctx, query, buildingID, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Floor, 0)
	for rows.Next() {
		var f model.Floor
		if err := rows.Scan(&f.ID, &f.BuildingID, &f.BuildingName, &f.Name, &f.SortOrder, &f.IsActive, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error) {
	query := `
		INSERT INTO floors (building_id, name, sort_order, is_active)
		VALUES ($1, $2, $3, $4)
		RETURNING id, building_id, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Floor
	err := r.pool.QueryRow(ctx, query, f.BuildingID, strings.TrimSpace(f.Name), f.SortOrder, f.IsActive).
		Scan(&out.ID, &out.BuildingID, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateFloor(ctx context.Context, f *model.Floor) (*model.Floor, error) {
	query := `
		UPDATE floors
		SET building_id = $1, name = $2, sort_order = $3, is_active = $4
		WHERE id = $5
		RETURNING id, building_id, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Floor
	err := r.pool.QueryRow(ctx, query, f.BuildingID, strings.TrimSpace(f.Name), f.SortOrder, f.IsActive, f.ID).
		Scan(&out.ID, &out.BuildingID, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 5. Rooms CRUD
// =============================================================================

func (r *pgMasterRepo) ListRooms(ctx context.Context, floorID int, buildingID int) ([]model.Room, error) {
	return r.listRoomsInternal(ctx, floorID, buildingID, false)
}

func (r *pgMasterRepo) listRoomsInternal(ctx context.Context, floorID int, buildingID int, onlyActive bool) ([]model.Room, error) {
	query := `
		SELECT rm.id, rm.floor_id, f.name AS floor_name, f.building_id, b.name AS building_name,
		       rm.code, rm.name, rm.sort_order, rm.is_active, rm.created_at, rm.updated_at
		FROM rooms rm
		JOIN floors f ON f.id = rm.floor_id
		JOIN buildings b ON b.id = f.building_id
		WHERE ($1::int = 0 OR rm.floor_id = $1)
		  AND ($2::int = 0 OR f.building_id = $2)
		  AND ($3::boolean = false OR (rm.is_active = true AND f.is_active = true AND b.is_active = true))
		ORDER BY b.sort_order ASC, f.sort_order ASC, rm.sort_order ASC, rm.id ASC
	`
	rows, err := r.pool.Query(ctx, query, floorID, buildingID, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Room, 0)
	for rows.Next() {
		var rm model.Room
		if err := rows.Scan(
			&rm.ID, &rm.FloorID, &rm.FloorName, &rm.BuildingID, &rm.BuildingName,
			&rm.Code, &rm.Name, &rm.SortOrder, &rm.IsActive, &rm.CreatedAt, &rm.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, rm)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateRoom(ctx context.Context, rm *model.Room) (*model.Room, error) {
	query := `
		INSERT INTO rooms (floor_id, code, name, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, floor_id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Room
	err := r.pool.QueryRow(ctx, query, rm.FloorID, cleanNullStr(rm.Code), strings.TrimSpace(rm.Name), rm.SortOrder, rm.IsActive).
		Scan(&out.ID, &out.FloorID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateRoom(ctx context.Context, rm *model.Room) (*model.Room, error) {
	query := `
		UPDATE rooms
		SET floor_id = $1, code = $2, name = $3, sort_order = $4, is_active = $5
		WHERE id = $6
		RETURNING id, floor_id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.Room
	err := r.pool.QueryRow(ctx, query, rm.FloorID, cleanNullStr(rm.Code), strings.TrimSpace(rm.Name), rm.SortOrder, rm.IsActive, rm.ID).
		Scan(&out.ID, &out.FloorID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 6. Categories CRUD
// =============================================================================

func (r *pgMasterRepo) ListCategories(ctx context.Context) ([]model.Category, error) {
	return r.listCategoriesByActive(ctx, false)
}

func (r *pgMasterRepo) listCategoriesByActive(ctx context.Context, onlyActive bool) ([]model.Category, error) {
	query := `
		SELECT id, code, name, description, sort_order, is_active, created_at, updated_at
		FROM categories
		WHERE ($1::boolean = false OR is_active = true)
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.pool.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Category, 0)
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.Description, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateCategory(ctx context.Context, c *model.Category) (*model.Category, error) {
	query := `
		INSERT INTO categories (code, name, description, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, code, name, description, sort_order, is_active, created_at, updated_at
	`
	var out model.Category
	err := r.pool.QueryRow(ctx, query, cleanNullStr(c.Code), strings.TrimSpace(c.Name), cleanNullStr(c.Description), c.SortOrder, c.IsActive).
		Scan(&out.ID, &out.Code, &out.Name, &out.Description, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateCategory(ctx context.Context, c *model.Category) (*model.Category, error) {
	query := `
		UPDATE categories
		SET code = $1, name = $2, description = $3, sort_order = $4, is_active = $5
		WHERE id = $6
		RETURNING id, code, name, description, sort_order, is_active, created_at, updated_at
	`
	var out model.Category
	err := r.pool.QueryRow(ctx, query, cleanNullStr(c.Code), strings.TrimSpace(c.Name), cleanNullStr(c.Description), c.SortOrder, c.IsActive, c.ID).
		Scan(&out.ID, &out.Code, &out.Name, &out.Description, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 6.1 Subcategories CRUD
// =============================================================================

func (r *pgMasterRepo) ListSubcategories(ctx context.Context, categoryID int) ([]model.Subcategory, error) {
	return r.listSubcategoriesInternal(ctx, categoryID, false)
}

func (r *pgMasterRepo) listSubcategoriesInternal(ctx context.Context, categoryID int, onlyActive bool) ([]model.Subcategory, error) {
	query := `
		SELECT sc.id, sc.category_id, c.name AS category_name,
		       sc.code, sc.name, sc.description, sc.sort_order, sc.is_active, sc.created_at, sc.updated_at
		FROM subcategories sc
		JOIN categories c ON c.id = sc.category_id
		WHERE ($1::int = 0 OR sc.category_id = $1)
		  AND ($2::boolean = false OR (sc.is_active = true AND c.is_active = true))
		ORDER BY c.sort_order ASC, sc.sort_order ASC, sc.id ASC
	`
	rows, err := r.pool.Query(ctx, query, categoryID, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Subcategory, 0)
	for rows.Next() {
		var sc model.Subcategory
		if err := rows.Scan(
			&sc.ID, &sc.CategoryID, &sc.CategoryName,
			&sc.Code, &sc.Name, &sc.Description, &sc.SortOrder, &sc.IsActive, &sc.CreatedAt, &sc.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, sc)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error) {
	query := `
		INSERT INTO subcategories (category_id, code, name, description, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, category_id, code, name, description, sort_order, is_active, created_at, updated_at
	`
	var out model.Subcategory
	err := r.pool.QueryRow(ctx, query,
		sc.CategoryID,
		cleanNullStr(sc.Code),
		strings.TrimSpace(sc.Name),
		cleanNullStr(sc.Description),
		sc.SortOrder,
		sc.IsActive,
	).Scan(&out.ID, &out.CategoryID, &out.Code, &out.Name, &out.Description, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateSubcategory(ctx context.Context, sc *model.Subcategory) (*model.Subcategory, error) {
	query := `
		UPDATE subcategories
		SET category_id = $1, code = $2, name = $3, description = $4, sort_order = $5, is_active = $6
		WHERE id = $7
		RETURNING id, category_id, code, name, description, sort_order, is_active, created_at, updated_at
	`
	var out model.Subcategory
	err := r.pool.QueryRow(ctx, query,
		sc.CategoryID,
		cleanNullStr(sc.Code),
		strings.TrimSpace(sc.Name),
		cleanNullStr(sc.Description),
		sc.SortOrder,
		sc.IsActive,
		sc.ID,
	).Scan(&out.ID, &out.CategoryID, &out.Code, &out.Name, &out.Description, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 7. Reporter Types CRUD
// =============================================================================

func (r *pgMasterRepo) ListReporterTypes(ctx context.Context) ([]model.ReporterType, error) {
	return r.listReporterTypesByActive(ctx, false)
}

func (r *pgMasterRepo) listReporterTypesByActive(ctx context.Context, onlyActive bool) ([]model.ReporterType, error) {
	query := `
		SELECT id, code, name, sort_order, is_active, created_at, updated_at
		FROM reporter_types
		WHERE ($1::boolean = false OR is_active = true)
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.pool.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.ReporterType, 0)
	for rows.Next() {
		var rt model.ReporterType
		if err := rows.Scan(&rt.ID, &rt.Code, &rt.Name, &rt.SortOrder, &rt.IsActive, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, rt)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error) {
	query := `
		INSERT INTO reporter_types (code, name, sort_order, is_active)
		VALUES ($1, $2, $3, $4)
		RETURNING id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.ReporterType
	err := r.pool.QueryRow(ctx, query, cleanNullStr(rt.Code), strings.TrimSpace(rt.Name), rt.SortOrder, rt.IsActive).
		Scan(&out.ID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateReporterType(ctx context.Context, rt *model.ReporterType) (*model.ReporterType, error) {
	query := `
		UPDATE reporter_types
		SET code = $1, name = $2, sort_order = $3, is_active = $4
		WHERE id = $5
		RETURNING id, code, name, sort_order, is_active, created_at, updated_at
	`
	var out model.ReporterType
	err := r.pool.QueryRow(ctx, query, cleanNullStr(rt.Code), strings.TrimSpace(rt.Name), rt.SortOrder, rt.IsActive, rt.ID).
		Scan(&out.ID, &out.Code, &out.Name, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 8. Technicians CRUD
// =============================================================================

func (r *pgMasterRepo) ListTechnicians(ctx context.Context) ([]model.Technician, error) {
	return r.listTechniciansByActive(ctx, false)
}

func (r *pgMasterRepo) listTechniciansByActive(ctx context.Context, onlyActive bool) ([]model.Technician, error) {
	query := `
		SELECT id, full_name, nickname, specialty, phone, sort_order, is_active, created_at, updated_at
		FROM technicians
		WHERE ($1::boolean = false OR is_active = true)
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.pool.Query(ctx, query, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.Technician, 0)
	for rows.Next() {
		var t model.Technician
		if err := rows.Scan(&t.ID, &t.FullName, &t.Nickname, &t.Specialty, &t.Phone, &t.SortOrder, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error) {
	query := `
		INSERT INTO technicians (full_name, nickname, specialty, phone, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, full_name, nickname, specialty, phone, sort_order, is_active, created_at, updated_at
	`
	var out model.Technician
	err := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(t.FullName),
		cleanNullStr(t.Nickname),
		cleanNullStr(t.Specialty),
		cleanNullStr(t.Phone),
		t.SortOrder,
		t.IsActive,
	).Scan(&out.ID, &out.FullName, &out.Nickname, &out.Specialty, &out.Phone, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateTechnician(ctx context.Context, t *model.Technician) (*model.Technician, error) {
	query := `
		UPDATE technicians
		SET full_name = $1, nickname = $2, specialty = $3, phone = $4, sort_order = $5, is_active = $6
		WHERE id = $7
		RETURNING id, full_name, nickname, specialty, phone, sort_order, is_active, created_at, updated_at
	`
	var out model.Technician
	err := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(t.FullName),
		cleanNullStr(t.Nickname),
		cleanNullStr(t.Specialty),
		cleanNullStr(t.Phone),
		t.SortOrder,
		t.IsActive,
		t.ID,
	).Scan(&out.ID, &out.FullName, &out.Nickname, &out.Specialty, &out.Phone, &out.SortOrder, &out.IsActive, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

// =============================================================================
// 9. Staff Users CRUD & Password Reset
// =============================================================================

func (r *pgMasterRepo) ListUsers(ctx context.Context) ([]model.User, error) {
	query := `
		SELECT id, username, display_name, role, is_active, last_login_at, created_at, updated_at
		FROM users
		ORDER BY id ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]model.User, 0)
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, rows.Err()
}

func (r *pgMasterRepo) CreateUser(ctx context.Context, u *model.User, passwordHash string) (*model.User, error) {
	query := `
		INSERT INTO users (username, password_hash, display_name, role, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, role, is_active, last_login_at, created_at, updated_at
	`
	var out model.User
	err := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(u.Username),
		passwordHash,
		strings.TrimSpace(u.DisplayName),
		u.Role,
		u.IsActive,
	).Scan(&out.ID, &out.Username, &out.DisplayName, &out.Role, &out.IsActive, &out.LastLoginAt, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) UpdateUser(ctx context.Context, u *model.User) (*model.User, error) {
	query := `
		UPDATE users
		SET username = $1, display_name = $2, role = $3, is_active = $4
		WHERE id = $5
		RETURNING id, username, display_name, role, is_active, last_login_at, created_at, updated_at
	`
	var out model.User
	err := r.pool.QueryRow(ctx, query,
		strings.TrimSpace(u.Username),
		strings.TrimSpace(u.DisplayName),
		u.Role,
		u.IsActive,
		u.ID,
	).Scan(&out.ID, &out.Username, &out.DisplayName, &out.Role, &out.IsActive, &out.LastLoginAt, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, mapPgError(err)
	}
	return &out, nil
}

func (r *pgMasterRepo) ResetUserPassword(ctx context.Context, userID int, newPasswordHash string) error {
	ct, err := r.pool.Exec(ctx, "UPDATE users SET password_hash = $1 WHERE id = $2", newPasswordHash, userID)
	if err != nil {
		return mapPgError(err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func cleanNullStr(s *string) *string {
	if s == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func mapPgError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return ErrDuplicate
		case "23503", "23514": // foreign_key_violation, check_violation
			return ErrInvalidInput
		}
	}
	return err
}
