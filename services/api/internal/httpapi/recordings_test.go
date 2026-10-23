package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

const recordingJSON = `{"name":"Checkout review","fileName":"checkout.webm","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bytes":1024,"mediaType":"video/webm","durationSeconds":12,"runId":"","chapters":[{"label":"Confirmation","atSeconds":10}],"presentation":{"frame":"paper","zoom":1.25,"playbackRate":1}}`

func TestManualRecordingMetadataDoesNotVerifyEvidence(t *testing.T) {
	identities := store.NewMemoryIdentity()
	h := Server{Store: store.Demo{}, Identity: identities}.Handler()
	cookie, session := demoLogin(t, h)
	before := call(h, "GET", "/api/v1/runs/exh-1042", "", cookie, "").Body.String()
	body := strings.Replace(recordingJSON, `"runId":""`, `"runId":"exh-1042"`, 1)
	rec := call(h, "POST", "/api/v1/recordings", body, cookie, session.CSRFToken)
	if rec.Code != 201 {
		t.Fatalf("metadata save: %d %s", rec.Code, rec.Body)
	}
	var record store.Recording
	if err := json.Unmarshal(rec.Body.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record.Origin != "manual" || record.Verification != "unverified" || record.MediaStored || record.CreatedBy != session.User.ID || record.CreatedAt.IsZero() {
		t.Fatal("recording makes false provenance claim")
	}
	if after := call(h, "GET", "/api/v1/runs/exh-1042", "", cookie, "").Body.String(); after != before {
		t.Fatal("manual recording changed run")
	}
	if rec := call(h, "GET", "/api/v1/recordings/"+record.ID, "", cookie, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), record.SHA256) {
		t.Fatal("saved metadata missing")
	}
	if rec := call(h, "GET", "/api/v1/recordings", "", cookie, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), record.ID) {
		t.Fatal("metadata list missing")
	}
	if rec := call(h, "GET", "/api/v1/activity", "", cookie, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "recording.created") {
		t.Fatal("authorship missing")
	}
	other, _ := demoLogin(t, h)
	if call(h, "GET", "/api/v1/recordings/"+record.ID, "", other, "").Code != 404 {
		t.Fatal("metadata leaked")
	}
	if rec := call(h, "GET", "/api/v1/activity", "", other, ""); strings.Contains(rec.Body.String(), record.ID) {
		t.Fatal("activity leaked")
	}
	viewerToken := auth.Token()
	_ = identities.SaveSession(context.Background(), auth.Digest(viewerToken), store.Identity{User: store.User{ID: "viewer"}, Workspace: store.Workspace{ID: session.Workspace.ID, Role: "viewer"}}, time.Now().Add(time.Hour))
	viewer := &http.Cookie{Name: sessionCookie, Value: viewerToken}
	if call(h, "POST", "/api/v1/recordings", recordingJSON, viewer, auth.CSRF(viewerToken)).Code != 403 {
		t.Fatal("viewer saved metadata")
	}
	if call(h, "GET", "/api/v1/recordings/"+record.ID, "", viewer, "").Code != 200 {
		t.Fatal("viewer cannot read metadata")
	}
	if !strings.Contains(rec.Header().Get("Content-Security-Policy"), "media-src 'self' blob:") {
		t.Fatal("local video blocked by CSP")
	}
}
func TestRecordingRejectsForgedAndInvalidMetadata(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, session := demoLogin(t, h)
	for _, body := range []string{
		strings.Replace(recordingJSON, `,"atSeconds":10`, "", 1),
		strings.Replace(recordingJSON, `"atSeconds":10`, `"atSeconds":null`, 1),
		strings.Replace(recordingJSON, `"atSeconds":10`, `"atSeconds":"0"`, 1),
		strings.Replace(recordingJSON, `"atSeconds":10`, `"atSeconds":0,"unknown":true`, 1),
		`null`, strings.Replace(recordingJSON, `"name":`, `"origin":"trusted_runner","name":`, 1), strings.Replace(recordingJSON, `"name":`, `"verification":"verified","name":`, 1), strings.Replace(recordingJSON, `"name":`, `"mediaStored":true,"name":`, 1),
		strings.Replace(recordingJSON, `"zoom":1.25`, `"zoom":0`, 1), strings.Replace(recordingJSON, `"atSeconds":10`, `"atSeconds":13`, 1), strings.Replace(recordingJSON, `"bytes":1024`, `"bytes":134217729`, 1), strings.Replace(recordingJSON, `"fileName":"checkout.webm"`, `"fileName":"../checkout.webm"`, 1), strings.Replace(recordingJSON, `"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`, `"sha256":"bad"`, 1),
	} {
		if rec := call(h, "POST", "/api/v1/recordings", body, cookie, session.CSRFToken); rec.Code != 400 {
			t.Fatalf("invalid recording accepted: %d %s", rec.Code, rec.Body)
		}
	}
	missing := strings.Replace(recordingJSON, `"runId":""`, `"runId":"missing"`, 1)
	if rec := call(h, "POST", "/api/v1/recordings", missing, cookie, session.CSRFToken); rec.Code != 404 {
		t.Fatal("nonexistent related run accepted")
	}
	if rec := call(h, "GET", "/api/v1/recordings", "", cookie, ""); !strings.Contains(rec.Body.String(), `"recordings":[]`) {
		t.Fatal("invalid recordings persisted")
	}
	if rec := call(h, "GET", "/api/v1/activity", "", cookie, ""); !strings.Contains(rec.Body.String(), `"events":[]`) {
		t.Fatal("invalid recordings audited as saved")
	}
}

func TestRecordingAcceptsExplicitZeroChapterTimestamp(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, session := demoLogin(t, h)
	body := strings.Replace(recordingJSON, `"atSeconds":10`, `"atSeconds":0`, 1)
	rec := call(h, "POST", "/api/v1/recordings", body, cookie, session.CSRFToken)
	if rec.Code != 201 {
		t.Fatalf("explicit zero rejected: %d %s", rec.Code, rec.Body)
	}
	var recording store.Recording
	if err := json.Unmarshal(rec.Body.Bytes(), &recording); err != nil {
		t.Fatal(err)
	}
	if len(recording.Chapters) != 1 || recording.Chapters[0].AtSeconds != 0 {
		t.Fatal("explicit zero not preserved")
	}
}
