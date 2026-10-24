package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestArtifactReadiness(t *testing.T) {
	root := t.TempDir()
	blobs := DiskBlobs{Root: filepath.Join(root, "artifacts")}
	if err := blobs.Ping(); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(blobs.Root)
	if err != nil || len(entries) != 0 {
		t.Fatal("readiness probe leaked a temporary file")
	}
	file := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(file, []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
	if (DiskBlobs{Root: file}).Ping() == nil {
		t.Fatal("unusable artifact volume marked ready")
	}
}
