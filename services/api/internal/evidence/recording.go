package evidence

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode"
)

const MaxRecordingBytes int64 = 128 << 20

type Chapter struct {
	Label     string  `json:"label"`
	AtSeconds float64 `json:"atSeconds"`
}
type Presentation struct {
	Frame        string  `json:"frame"`
	Zoom         float64 `json:"zoom"`
	PlaybackRate float64 `json:"playbackRate"`
}

// RecordingInput is a declaration from a user, not proof that media exists or
// that the supplied checksum matches bytes. It cannot produce a run verdict.
type RecordingInput struct {
	Name            string       `json:"name"`
	FileName        string       `json:"fileName"`
	SHA256          string       `json:"sha256"`
	Bytes           int64        `json:"bytes"`
	MediaType       string       `json:"mediaType"`
	DurationSeconds float64      `json:"durationSeconds"`
	RunID           string       `json:"runId"`
	Chapters        []Chapter    `json:"chapters"`
	Presentation    Presentation `json:"presentation"`
}

var checksumPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func ValidateRecording(input RecordingInput) error {
	if !validPreparationText(input.Name) || strings.TrimSpace(input.Name) == "" || len(input.Name) > 120 {
		return fmt.Errorf("recording name must contain 1–120 UTF-8 bytes without NUL")
	}
	if !validPreparationText(input.FileName) || strings.TrimSpace(input.FileName) == "" || len(input.FileName) > 200 || input.FileName == "." || input.FileName == ".." || strings.ContainsAny(input.FileName, "/\\:") {
		return fmt.Errorf("file name must contain 1–200 UTF-8 bytes without path separators")
	}
	for _, char := range input.FileName {
		if unicode.IsControl(char) {
			return fmt.Errorf("file name cannot contain control characters")
		}
	}
	if !checksumPattern.MatchString(input.SHA256) {
		return fmt.Errorf("sha256 must contain 64 lowercase hexadecimal characters")
	}
	if input.Bytes < 1 || input.Bytes > MaxRecordingBytes {
		return fmt.Errorf("recording size must be between 1 byte and 128 MiB")
	}
	if input.MediaType != "video/webm" && input.MediaType != "video/mp4" {
		return fmt.Errorf("mediaType must be video/webm or video/mp4")
	}
	if !finite(input.DurationSeconds) || input.DurationSeconds <= 0 || input.DurationSeconds > 3600 {
		return fmt.Errorf("duration must be greater than zero and at most 3600 seconds")
	}
	if !validPreparationText(input.RunID) || len(input.RunID) > 128 {
		return fmt.Errorf("run ID must be at most 128 UTF-8 bytes without NUL")
	}
	if input.Chapters == nil || len(input.Chapters) > 50 {
		return fmt.Errorf("chapters must be an array with at most 50 entries; use [] for none")
	}
	for _, chapter := range input.Chapters {
		if !validPreparationText(chapter.Label) || strings.TrimSpace(chapter.Label) == "" || len(chapter.Label) > 120 {
			return fmt.Errorf("chapter labels must contain 1–120 UTF-8 bytes without NUL")
		}
		if !finite(chapter.AtSeconds) || chapter.AtSeconds < 0 || chapter.AtSeconds > input.DurationSeconds {
			return fmt.Errorf("chapter timestamps must lie within the recording duration")
		}
	}
	p := input.Presentation
	if p.Frame != "paper" && p.Frame != "mist" && p.Frame != "slate" {
		return fmt.Errorf("frame must be paper, mist or slate")
	}
	if !finite(p.Zoom) || p.Zoom < 1 || p.Zoom > 2 {
		return fmt.Errorf("presentation zoom must be between 1 and 2")
	}
	if !finite(p.PlaybackRate) || p.PlaybackRate < 0.5 || p.PlaybackRate > 2 {
		return fmt.Errorf("playback rate must be between 0.5 and 2")
	}
	return nil
}
