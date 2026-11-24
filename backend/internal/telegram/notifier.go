package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"
)

// NewTicketPayload contains the details of a newly created repair ticket
// to be broadcast to the technicians' Telegram group (ADR-007: New Ticket ONLY).
type NewTicketPayload struct {
	TicketCode       string
	BuildingName     string
	FloorName        string
	RoomName         string
	LocationDetail   string
	CategoryName     string
	ReporterTypeName string
	Description      string
	FirstPhotoURL    string
	FirstPhotoBytes  []byte
	FirstPhotoName   string
	CreatedAt        time.Time
}

// Notifier defines the interface for sending new-ticket notifications.
type Notifier interface {
	NotifyNewTicketAsync(payload NewTicketPayload)
	SendNewTicket(ctx context.Context, payload NewTicketPayload) error
}

// BotNotifier sends notifications to a Telegram group using the Telegram Bot API.
type BotNotifier struct {
	botToken        string
	chatID          string
	frontendBaseURL string
	apiBaseURL      string
	httpClient      *http.Client
}

// NewBotNotifier initializes a Telegram BotNotifier with IPv4-preferred transport
// and generous async timeouts so multipart photo uploads to api.telegram.org succeed reliably.
func NewBotNotifier(botToken, chatID, frontendBaseURL string) *BotNotifier {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// Prefer IPv4 (tcp4) first to avoid broken IPv6 blackholes to api.telegram.org on residential ISPs
			conn, err := dialer.DialContext(ctx, "tcp4", addr)
			if err == nil {
				return conn, nil
			}
			return dialer.DialContext(ctx, network, addr)
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          10,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &BotNotifier{
		botToken:        strings.TrimSpace(botToken),
		chatID:          strings.TrimSpace(chatID),
		frontendBaseURL: strings.TrimRight(strings.TrimSpace(frontendBaseURL), "/"),
		apiBaseURL:      "https://api.telegram.org",
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   20 * time.Second,
		},
	}
}

// SetAPIBaseURL overrides the Telegram API host (used in unit tests with httptest.Server).
func (b *BotNotifier) SetAPIBaseURL(url string) {
	b.apiBaseURL = strings.TrimRight(url, "/")
}

// IsConfigured returns true when both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
func (b *BotNotifier) IsConfigured() bool {
	return b != nil && b.botToken != "" && b.chatID != ""
}

// NotifyNewTicketAsync sends the Telegram notification in a background goroutine
// so user HTTP requests are never delayed (ADR-007).
func (b *BotNotifier) NotifyNewTicketAsync(payload NewTicketPayload) {
	if !b.IsConfigured() {
		return
	}

	go func(p NewTicketPayload) {
		ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
		defer cancel()

		if err := b.SendNewTicket(ctx, p); err != nil {
			log.Printf("[TELEGRAM WARN] Failed to send notification for ticket %s: %v", p.TicketCode, err)
		} else {
			log.Printf("[TELEGRAM INFO] Sent new-ticket notification for %s to Telegram group", p.TicketCode)
		}
	}(payload)
}

// SendNewTicket sends the 1st damage photo + Thai caption via sendPhoto,
// falling back to sendMessage with a fresh timeout context if photo delivery fails.
func (b *BotNotifier) SendNewTicket(ctx context.Context, payload NewTicketPayload) error {
	if !b.IsConfigured() {
		return nil
	}

	caption := b.FormatThaiMessage(payload)

	// 1. Try sending with the first damage photo (raw bytes preferred, or public URL)
	if len(payload.FirstPhotoBytes) > 0 || payload.FirstPhotoURL != "" {
		photoCtx, photoCancel := context.WithTimeout(ctx, 20*time.Second)
		err := b.sendPhoto(photoCtx, caption, payload)
		photoCancel()
		if err == nil {
			return nil
		}
		log.Printf("[TELEGRAM WARN] sendPhoto failed for %s (%v), falling back to sendMessage", payload.TicketCode, err)
	}

	// 2. Fallback to plain text sendMessage using a fresh 15-second context so an expired
	// photoCtx never causes sendMessage to fail immediately.
	msgCtx, msgCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer msgCancel()
	return b.sendMessage(msgCtx, caption)
}

// FormatThaiMessage builds the formatted Thai notification message with a direct link to the ticket.
func (b *BotNotifier) FormatThaiMessage(p NewTicketPayload) string {
	bkk := time.FixedZone("ICT", 7*3600)
	createdTime := p.CreatedAt
	if createdTime.IsZero() {
		createdTime = time.Now()
	}
	timeStr := createdTime.In(bkk).Format("02/01/2006 15:04 น.")

	locationStr := fmt.Sprintf("%s → %s → %s", p.BuildingName, p.FloorName, p.RoomName)
	if detail := strings.TrimSpace(p.LocationDetail); detail != "" {
		locationStr = fmt.Sprintf("%s (%s)", locationStr, detail)
	}

	baseURL := b.frontendBaseURL
	if baseURL == "" {
		baseURL = "http://localhost:5173"
	}
	directLink := fmt.Sprintf("%s/#/staff/tickets?code=%s", baseURL, p.TicketCode)

	var sb strings.Builder
	sb.WriteString("🔧 แจ้งซ่อมใหม่ (e-MMS)\n")
	sb.WriteString("━━━━━━━━━━━━━━━━━━\n")
	sb.WriteString(fmt.Sprintf("📌 รหัสใบงาน: %s\n", p.TicketCode))
	sb.WriteString(fmt.Sprintf("🏢 สถานที่: %s\n", locationStr))
	sb.WriteString(fmt.Sprintf("🛠 หมวดหมู่: %s\n", p.CategoryName))
	sb.WriteString(fmt.Sprintf("👤 ประเภทผู้แจ้ง: %s\n", p.ReporterTypeName))
	sb.WriteString(fmt.Sprintf("📝 อาการ/รายละเอียด: %s\n", strings.TrimSpace(p.Description)))
	sb.WriteString(fmt.Sprintf("🕒 เวลาที่แจ้ง: %s\n", timeStr))
	sb.WriteString("━━━━━━━━━━━━━━━━━━\n")
	sb.WriteString(fmt.Sprintf("🔗 เปิดดูและรับงานทันที:\n%s", directLink))

	msg := sb.String()
	// Telegram photo captions have a 1024-character limit
	runes := []rune(msg)
	if len(runes) > 1000 {
		msg = string(runes[:997]) + "..."
	}
	return msg
}

func (b *BotNotifier) sendPhoto(ctx context.Context, caption string, p NewTicketPayload) error {
	endpoint := fmt.Sprintf("%s/bot%s/sendPhoto", b.apiBaseURL, b.botToken)

	// If we have raw photo bytes in memory, send via multipart/form-data so Telegram
	// doesn't depend on external URL reachability.
	if len(p.FirstPhotoBytes) > 0 {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)

		_ = writer.WriteField("chat_id", b.chatID)
		_ = writer.WriteField("caption", caption)

		fileName := p.FirstPhotoName
		if fileName == "" {
			fileName = "damage_photo.webp"
		}
		part, err := writer.CreateFormFile("photo", fileName)
		if err != nil {
			return err
		}
		if _, err := part.Write(p.FirstPhotoBytes); err != nil {
			return err
		}
		if err := writer.Close(); err != nil {
			return err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())

		return b.doTelegramRequest(req)
	}

	// Otherwise send photo by public URL JSON payload
	payload := map[string]string{
		"chat_id": b.chatID,
		"photo":   p.FirstPhotoURL,
		"caption": caption,
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return b.doTelegramRequest(req)
}

func (b *BotNotifier) sendMessage(ctx context.Context, text string) error {
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", b.apiBaseURL, b.botToken)
	payload := map[string]interface{}{
		"chat_id":                  b.chatID,
		"text":                     text,
		"disable_web_page_preview": false,
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return b.doTelegramRequest(req)
}

func (b *BotNotifier) doTelegramRequest(req *http.Request) error {
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("telegram API HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}
	return nil
}
