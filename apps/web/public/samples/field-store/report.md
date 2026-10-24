## Exhibit evidence report

**Outcome: Unverified**

Sample fixture — no customer execution.

- Repository: justafolk/sample\-project\-exhibit · PR #1
- Head SHA: `c6865b266b8799b96bdbcb39b586982e51f9bf6a`
- Run: `sample-pr-40073771722` · attempt 2
- Flow: `checkout.saved-address` at `c6865b266b8799b96bdbcb39b586982e51f9bf6a`
- Recorded interval: 2026\-10\-24T07:24:46\.759Z → 2026\-10\-24T07:24:50\.039Z
- Origin claim: `self_test` (not independently authenticated)
- Termination: `completed`

### Assertions

- PASSED: Browser test: saved address checkout matches API and confirmation; cleanup is scoped \(\)
- PASSED: Browser test: payment\-declined does not create an order \(\)
- PASSED: Browser test: out\-of\-stock does not create an order \(\)

### Coverage gaps

- Secret\-free sample PR browser tests only; no deployed staging or production was exercised
- Collector identity, artifact redaction and execution provenance are not independently verified

### Artifacts

- checkout\-out\-of\-stock\-does\-not\-create\-an\-order/trace\.zip · 156071 bytes · SHA-256 `b18611e6b6480eae9f71cacc55824f1b4edce89eb8d700f77c0d21d60accbeac`
- checkout\-out\-of\-stock\-does\-not\-create\-an\-order/video\.webm · 65936 bytes · SHA-256 `a764cb721c3f285ea536cf3b00d172ad4811fc7bbc53d0417e140d4444feff0c`
- checkout\-payment\-declined\-does\-not\-create\-an\-order/trace\.zip · 157399 bytes · SHA-256 `a03c9f5b555604ad9b64826ba065fc762dfb23c1d0283d8cf4179d86da796a49`
- checkout\-payment\-declined\-does\-not\-create\-an\-order/video\.webm · 66503 bytes · SHA-256 `bb6f00d4ff1dd090ef0762715c6b5c3254144bb7db9f48ee90ca354105a7e262`
- checkout\-saved\-address\-che\-b85c4\-firmation\-cleanup\-is\-scoped/confirmation\.png · 72946 bytes · SHA-256 `235d3e99deadc1bb6f4ad9764e9ac7b9dfd7f97116d44df40b9a51ad94a18ba3`
- checkout\-saved\-address\-che\-b85c4\-firmation\-cleanup\-is\-scoped/trace\.zip · 251294 bytes · SHA-256 `2c016d5484dc14796b5161eb6f819d0d0e4db701483e240b2d70c30b3047fd26`
- checkout\-saved\-address\-che\-b85c4\-firmation\-cleanup\-is\-scoped/video\.webm · 96242 bytes · SHA-256 `91649ad77d5c7e263c9bd41beae27701de3aab7b8d058c111deb34d4d5bf4ff7`

Local artifact bytes were checked against this manifest.
Redaction, collector identity and trusted execution remain unverified.

### Cleanup

not\_needed: Sample\-mode tests do not write customer staging data; process and runner cleanup are not independently verified
