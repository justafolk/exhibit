package evidence

import (
	"math"
	"strings"
	"testing"
)

func recordingFixture() RecordingInput {
	return RecordingInput{Name: "Checkout review", FileName: "checkout.webm", SHA256: strings.Repeat("a", 64), Bytes: 1024, MediaType: "video/webm", DurationSeconds: 12, Chapters: []Chapter{{Label: "Confirmation", AtSeconds: 10}}, Presentation: Presentation{Frame: "paper", Zoom: 1, PlaybackRate: 1}}
}
func TestRecordingBounds(t *testing.T) {
	if err := ValidateRecording(recordingFixture()); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*RecordingInput){
		"empty name": func(r *RecordingInput) { r.Name = " " }, "long name": func(r *RecordingInput) { r.Name = strings.Repeat("x", 121) },
		"path": func(r *RecordingInput) { r.FileName = "../secret.webm" }, "windows path": func(r *RecordingInput) { r.FileName = `C:\secret.webm` }, "control filename": func(r *RecordingInput) { r.FileName = "line\n.webm" },
		"hash": func(r *RecordingInput) { r.SHA256 = "bad" }, "uppercase hash": func(r *RecordingInput) { r.SHA256 = strings.Repeat("A", 64) },
		"empty": func(r *RecordingInput) { r.Bytes = 0 }, "oversize": func(r *RecordingInput) { r.Bytes = MaxRecordingBytes + 1 },
		"type": func(r *RecordingInput) { r.MediaType = "text/html" }, "nan": func(r *RecordingInput) { r.DurationSeconds = math.NaN() }, "infinite": func(r *RecordingInput) { r.DurationSeconds = math.Inf(1) }, "long duration": func(r *RecordingInput) { r.DurationSeconds = 3601 }, "zero duration": func(r *RecordingInput) { r.DurationSeconds = 0 },
		"null chapters": func(r *RecordingInput) { r.Chapters = nil }, "many chapters": func(r *RecordingInput) { r.Chapters = make([]Chapter, 51) }, "negative chapter": func(r *RecordingInput) { r.Chapters[0].AtSeconds = -1 }, "past duration": func(r *RecordingInput) { r.Chapters[0].AtSeconds = 13 }, "nan chapter": func(r *RecordingInput) { r.Chapters[0].AtSeconds = math.NaN() }, "empty chapter": func(r *RecordingInput) { r.Chapters[0].Label = "" },
		"unknown frame": func(r *RecordingInput) { r.Presentation.Frame = "unknown" }, "large zoom": func(r *RecordingInput) { r.Presentation.Zoom = 2.1 }, "nan zoom": func(r *RecordingInput) { r.Presentation.Zoom = math.NaN() }, "speed": func(r *RecordingInput) { r.Presentation.PlaybackRate = 3 }, "nul run": func(r *RecordingInput) { r.RunID = "bad\x00" },
	} {
		t.Run(name, func(t *testing.T) {
			input := recordingFixture()
			change(&input)
			if ValidateRecording(input) == nil {
				t.Fatal("invalid recording accepted")
			}
		})
	}
	input := recordingFixture()
	input.Bytes = MaxRecordingBytes
	input.DurationSeconds = 3600
	input.MediaType = "video/mp4"
	input.Presentation = Presentation{Frame: "slate", Zoom: 2, PlaybackRate: 0.5}
	input.Chapters = []Chapter{{Label: "Start", AtSeconds: 0}, {Label: "End", AtSeconds: 3600}}
	if err := ValidateRecording(input); err != nil {
		t.Fatalf("valid boundary rejected: %v", err)
	}
}
