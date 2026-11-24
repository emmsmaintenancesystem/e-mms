package storage

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func makeValidWebPBytes(size int) []byte {
	if size < 16 {
		size = 16
	}
	buf := make([]byte, size)
	copy(buf[0:4], []byte("RIFF"))
	copy(buf[8:12], []byte("WEBP"))
	copy(buf[12:16], []byte("VP8 "))
	return buf
}

func makeValidJPEGBytes(size int) []byte {
	if size < 16 {
		size = 16
	}
	buf := make([]byte, size)
	buf[0] = 0xFF
	buf[1] = 0xD8
	buf[2] = 0xFF
	buf[3] = 0xE0
	return buf
}

func makeValidPNGBytes(size int) []byte {
	if size < 16 {
		size = 16
	}
	buf := make([]byte, size)
	copy(buf[0:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})
	return buf
}

func TestValidateImageBytes(t *testing.T) {
	// 1. Valid WebP
	vp, err := ValidateImageBytes("damage.webp", makeValidWebPBytes(1024), DefaultMaxPhotoSizeBytes)
	if err != nil {
		t.Fatalf("expected valid WebP, got error: %v", err)
	}
	if vp.MimeType != "image/webp" || vp.Extension != ".webp" {
		t.Fatalf("unexpected WebP metadata: %+v", vp)
	}

	// 2. Valid JPEG
	vpJpg, err := ValidateImageBytes("photo.jpg", makeValidJPEGBytes(2048), DefaultMaxPhotoSizeBytes)
	if err != nil || vpJpg.MimeType != "image/jpeg" {
		t.Fatalf("expected valid JPEG, got err=%v, vp=%+v", err, vpJpg)
	}

	// 3. Valid PNG
	vpPng, err := ValidateImageBytes("photo.png", makeValidPNGBytes(2048), DefaultMaxPhotoSizeBytes)
	if err != nil || vpPng.MimeType != "image/png" {
		t.Fatalf("expected valid PNG, got err=%v, vp=%+v", err, vpPng)
	}

	// 4. Reject fake WebP extension containing HTML/script
	fakeHTML := []byte("<html><script>alert(1)</script></html>")
	if _, err := ValidateImageBytes("exploit.webp", fakeHTML, DefaultMaxPhotoSizeBytes); err == nil {
		t.Fatalf("expected fake HTML disguised as .webp to be rejected")
	}

	// 5. Reject oversized file (> 512 KB)
	oversized := makeValidWebPBytes(DefaultMaxPhotoSizeBytes + 100)
	if _, err := ValidateImageBytes("huge.webp", oversized, DefaultMaxPhotoSizeBytes); err == nil {
		t.Fatalf("expected oversized image (>512KB) to be rejected")
	}

	// 6. Reject empty file
	if _, err := ValidateImageBytes("empty.webp", nil, DefaultMaxPhotoSizeBytes); err == nil {
		t.Fatalf("expected empty file to be rejected")
	}
}

func TestSupabaseStorageUpload(t *testing.T) {
	var receivedAuth, receivedMime, receivedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		receivedMime = r.Header.Get("Content-Type")
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"Key":"ticket-photos/ok.webp"}`))
	}))
	defer server.Close()

	client := NewSupabaseStorage(server.URL, "test-service-role-key", "ticket-photos")
	photo, err := ValidateImageBytes("test.webp", makeValidWebPBytes(512), DefaultMaxPhotoSizeBytes)
	if err != nil {
		t.Fatalf("ValidateImageBytes failed: %v", err)
	}

	storagePath, publicURL, err := client.UploadPhoto(context.Background(), "MMS-202611-001", "before", 1, photo)
	if err != nil {
		t.Fatalf("UploadPhoto failed: %v", err)
	}
	if receivedAuth != "Bearer test-service-role-key" {
		t.Fatalf("expected Bearer service-role key, got %q", receivedAuth)
	}
	if receivedMime != "image/webp" {
		t.Fatalf("expected Content-Type image/webp, got %q", receivedMime)
	}
	if !strings.HasPrefix(receivedPath, "/storage/v1/object/ticket-photos/") {
		t.Fatalf("unexpected upload path: %s", receivedPath)
	}
	if storagePath == "" || !bytes.Contains([]byte(publicURL), []byte("/storage/v1/object/public/ticket-photos/")) {
		t.Fatalf("unexpected storagePath=%q publicURL=%q", storagePath, publicURL)
	}
}
