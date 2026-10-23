// Package auth implements credential primitives; HTTP and persistence stay outside it.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
)

// OWASP PBKDF2-HMAC-SHA256 work factor; the standard library avoids an extra crypto dependency.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const iterations = 600000

func Token() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func Digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func CSRF(token string) string { return Digest("exhibit-csrf:" + token) }
func HashPassword(password string) (string, error) {
	if len(password) < 12 || len(password) > 256 {
		return "", errors.New("password must contain 12–256 bytes")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, 32)
	if err != nil {
		return "", err
	}
	return "pbkdf2-sha256$600000$" + hex.EncodeToString(salt) + "$" + hex.EncodeToString(key), nil
}
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	valid := len(parts) == 4 && parts[0] == "pbkdf2-sha256" && parts[1] == "600000"
	salt, expected := make([]byte, 16), make([]byte, 32)
	if valid {
		var err error
		salt, err = hex.DecodeString(parts[2])
		valid = err == nil && len(salt) == 16
		expected, err = hex.DecodeString(parts[3])
		valid = valid && err == nil && len(expected) == 32
	}
	// Unknown accounts and malformed stored values still pay the password KDF cost.
	if !valid {
		salt, expected = make([]byte, 16), make([]byte, 32)
	}
	if len(password) > 256 {
		password = ""
		valid = false
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, 32)
	return err == nil && subtle.ConstantTimeCompare(key, expected) == 1 && valid
}
