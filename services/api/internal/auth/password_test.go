package auth

import "testing"

func TestPassword(t *testing.T) {
	for _, password := range []string{"short", string(make([]byte, 257))} {
		if _, err := HashPassword(password); err == nil {
			t.Fatal("accepted invalid length")
		}
	}
	hash, err := HashPassword("a private test password")
	if err != nil {
		t.Fatal(err)
	}
	other, err := HashPassword("a private test password")
	if err != nil {
		t.Fatal(err)
	}
	if hash == other {
		t.Fatal("password hashes must have unique salts")
	}
	if !VerifyPassword("a private test password", hash) || VerifyPassword("wrong", hash) || VerifyPassword("a private test password", "") {
		t.Fatal("password verification failed")
	}
	token := Token()
	if len(token) != 64 || token == Token() || Digest(token) == token || CSRF(token) == token {
		t.Fatal("invalid session material")
	}
}
