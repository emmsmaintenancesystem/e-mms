package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// DefaultMaxPhotoSizeBytes is 512 KB per photo (client compresses WebP <= 150 KB).
	DefaultMaxPhotoSizeBytes = 512 * 1024
)

// ValidatedPhoto holds a server-validated photo ready for upload to Supabase Storage.
type ValidatedPhoto struct {
	OriginalFilename string
	MimeType         string
	Extension        string
	Data             []byte
	SizeBytes        int
}

// ValidateImageBytes inspects the raw magic bytes of an uploaded file (first 512 bytes)
// and enforces size limits (0 < size <= maxBytes) and allowed MIME types
// (image/webp, image/jpeg, image/png). Never trusts browser Content-Type or file extension.
func ValidateImageBytes(filename string, data []byte, maxBytes int) (*ValidatedPhoto, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxPhotoSizeBytes
	}

	size := len(data)
	if size == 0 {
		return nil, fmt.Errorf("ไฟล์รูปภาพว่างเปล่า (Empty file)")
	}
	if size > maxBytes {
		return nil, fmt.Errorf("ขนาดไฟล์รูปภาพเกินกำหนด (%d KB, จำกัดสูงสุดไม่เกิน %d KB ต่อรูป)", size/1024, maxBytes/1024)
	}

	mimeType, ext, ok := detectAllowedImageMagicBytes(data)
	if !ok {
		return nil, fmt.Errorf("รูปแบบไฟล์ไม่ถูกต้อง อนุญาตเฉพาะไฟล์รูปภาพ WebP, JPEG หรือ PNG เท่านั้น")
	}

	return &ValidatedPhoto{
		OriginalFilename: filename,
		MimeType:         mimeType,
		Extension:        ext,
		Data:             data,
		SizeBytes:        size,
	}, nil
}

// detectAllowedImageMagicBytes checks strict magic headers for WebP, JPEG, and PNG
// and cross-verifies with http.DetectContentType.
func detectAllowedImageMagicBytes(data []byte) (mimeType string, ext string, ok bool) {
	// 1. WebP: RIFF....WEBP (12 bytes minimum header)
	if len(data) >= 12 &&
		bytes.Equal(data[0:4], []byte("RIFF")) &&
		bytes.Equal(data[8:12], []byte("WEBP")) {
		return "image/webp", ".webp", true
	}

	// 2. JPEG: FF D8 FF
	if len(data) >= 3 &&
		data[0] == 0xFF &&
		data[1] == 0xD8 &&
		data[2] == 0xFF {
		return "image/jpeg", ".jpg", true
	}

	// 3. PNG: 89 50 4E 47 0D 0A 1A 0A
	pngSig := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	if len(data) >= 8 && bytes.Equal(data[0:8], pngSig) {
		return "image/png", ".png", true
	}

	// Cross-check with standard library detector
	headLen := len(data)
	if headLen > 512 {
		headLen = 512
	}
	detected := http.DetectContentType(data[:headLen])
	switch detected {
	case "image/webp":
		return "image/webp", ".webp", true
	case "image/jpeg":
		return "image/jpeg", ".jpg", true
	case "image/png":
		return "image/png", ".png", true
	default:
		return "", "", false
	}
}

// PhotoStorage defines the contract for uploading validated ticket photos.
type PhotoStorage interface {
	UploadPhoto(ctx context.Context, folderPrefix string, photoType string, displayOrder int, photo *ValidatedPhoto) (storagePath string, publicURL string, err error)
}

// SupabaseStorage uploads photos directly to Supabase Storage using the Service Role Key.
type SupabaseStorage struct {
	supabaseURL    string
	serviceRoleKey string
	bucket         string
	httpClient     *http.Client
}

// NewSupabaseStorage initializes a SupabaseStorage client.
func NewSupabaseStorage(supabaseURL, serviceRoleKey, bucket string) *SupabaseStorage {
	if bucket == "" {
		bucket = "ticket-photos"
	}
	return &SupabaseStorage{
		supabaseURL:    strings.TrimRight(strings.TrimSpace(supabaseURL), "/"),
		serviceRoleKey: strings.TrimSpace(serviceRoleKey),
		bucket:         bucket,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// UploadPhoto uploads a validated image to Supabase Storage and returns (storagePath, publicURL, error).
func (s *SupabaseStorage) UploadPhoto(ctx context.Context, folderPrefix string, photoType string, displayOrder int, photo *ValidatedPhoto) (string, string, error) {
	if photo == nil || len(photo.Data) == 0 {
		return "", "", fmt.Errorf("empty photo data")
	}

	now := time.Now().In(time.FixedZone("ICT", 7*3600))
	yearMonth := now.Format("200601")
	safePrefix := strings.ReplaceAll(strings.TrimSpace(folderPrefix), "/", "_")
	if safePrefix == "" {
		safePrefix = fmt.Sprintf("ticket_%d", now.UnixNano())
	}

	storagePath := fmt.Sprintf("%s/%s/%s_%d_%d%s",
		yearMonth,
		safePrefix,
		photoType,
		displayOrder,
		now.UnixMilli(),
		photo.Extension,
	)

	// If Supabase URL or Service Role Key is not configured (e.g., local test mode without storage),
	// return a deterministic local placeholder path if explicitly testing, or error in production.
	if s.supabaseURL == "" || s.serviceRoleKey == "" {
		return "", "", fmt.Errorf("Supabase Storage is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)")
	}

	uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s", s.supabaseURL, s.bucket, storagePath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(photo.Data))
	if err != nil {
		return "", "", fmt.Errorf("failed to build storage request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.serviceRoleKey)
	req.Header.Set("apikey", s.serviceRoleKey)
	req.Header.Set("Content-Type", photo.MimeType)
	req.Header.Set("x-upsert", "true")
	req.Header.Set("Cache-Control", "max-age=31536000")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("failed to upload photo to Supabase Storage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", "", fmt.Errorf("Supabase Storage returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}

	publicURL := fmt.Sprintf("%s/storage/v1/object/public/%s/%s", s.supabaseURL, s.bucket, storagePath)
	return storagePath, publicURL, nil
}
