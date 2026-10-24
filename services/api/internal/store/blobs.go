package store

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var ErrFileIntegrity = errors.New("file length or SHA-256 mismatch")

// DiskBlobs is private storage on a durable mounted volume. No user path is used
// as an object key. Metadata becomes visible only after hash-checked atomic rename.
type DiskBlobs struct{ Root string }

func (b DiskBlobs) filename(key string) (string, error) {
	parts := strings.Split(key, "/")
	if len(parts) != 2 {
		return "", errors.New("invalid object key")
	}
	for _, part := range parts {
		if len(part) < 64 || strings.Trim(part, "0123456789abcdefci-") != "" {
			return "", errors.New("invalid object key")
		}
	}
	return filepath.Join(b.Root, parts[0], parts[1]), nil
}
func (b DiskBlobs) Put(key string, source io.Reader, size int64, hash string) error {
	dest, err := b.filename(key)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(dest), ".upload-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	digest := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, digest), io.LimitReader(source, size+1))
	if err != nil {
		return err
	}
	if n != size || hex.EncodeToString(digest.Sum(nil)) != hash {
		return ErrFileIntegrity
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), dest); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(dest))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
func (b DiskBlobs) Open(key string) (*os.File, error) {
	name, err := b.filename(key)
	if err != nil {
		return nil, err
	}
	return os.Open(name)
}
