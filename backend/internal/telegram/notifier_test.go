package telegram

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBotNotifierSendPhotoAndFallback(t *testing.T) {
	var hitEndpoint string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitEndpoint = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	notifier := NewBotNotifier("123456:TEST_TOKEN", "-100987654321", "https://org.github.io/e-mms")
	notifier.SetAPIBaseURL(server.URL)

	payload := NewTicketPayload{
		TicketCode:       "MMS-202611-001",
		BuildingName:     "อาคารอำนวยการและบริหาร",
		FloorName:        "ชั้น 1",
		RoomName:         "ห้องสำนักงานบริหาร (101)",
		LocationDetail:   "หน้าประตูทางเข้า",
		CategoryName:     "ระบบไฟฟ้าและแสงสว่าง",
		ReporterTypeName: "เจ้าหน้าที่",
		Description:      "หลอดไฟนีออนกะพริบ 2 ดวง",
		FirstPhotoBytes:  []byte("RIFFxxxxWEBPVP8 "),
		FirstPhotoName:   "damage.webp",
		CreatedAt:        time.Date(2026, 11, 20, 10, 30, 0, 0, time.UTC),
	}

	msg := notifier.FormatThaiMessage(payload)
	if !strings.Contains(msg, "MMS-202611-001") ||
		!strings.Contains(msg, "อาคารอำนวยการและบริหาร → ชั้น 1 → ห้องสำนักงานบริหาร (101)") ||
		!strings.Contains(msg, "https://org.github.io/e-mms/#/staff/tickets?code=MMS-202611-001") {
		t.Fatalf("Formatted message missing expected content:\n%s", msg)
	}

	if err := notifier.SendNewTicket(context.Background(), payload); err != nil {
		t.Fatalf("SendNewTicket failed: %v", err)
	}
	if !strings.HasSuffix(hitEndpoint, "/sendPhoto") {
		t.Fatalf("expected /sendPhoto endpoint to be called first, got %s", hitEndpoint)
	}
}
