# Handoff: agent-first capture and review

- Branch: `agent/agent-first-experience`, based on deployed `9b16a02`.
- Outcome: seven main destinations reduced to Reviews, Agent recordings, Agent
  setup, Settings. The review queue is on home. Setup/flow/contract editors are
  advanced configuration; old routes work. Manual recording is optional and
  closing it unmounts the recorder. Copy/download instructions give agents a
  real `npm run evidence:record` command.
- Capture command: runs only this repo's reviewed sample Playwright suite, enables
  video/trace capture, collects hashes/manifests and returns local paths as JSON.
  Rejects dirty checkouts. Uses unique output directories. Failed tests still
  trigger collection and fail the command; collector failures cannot claim a valid
  manifest. Nothing uploads, schedules a hosted run, or becomes verified.
- Validation: `make check` passed with Go vet/race and 20 Python tooling tests.
  Actual one-command capture at `b0e1801424be013f0234ef8bed054398d3f0bfde`
  passed all 20 Chromium tests and manifest/artifact validation. Earlier UI test
  failures were fixed and the final full suite ran through that command.
  Container build and smoke passed. Desktop/mobile review covered all three main
  experience pages, clipboard success, and no horizontal overflow. Clipboard-denied
  fallback was also observed; download instructions passed the browser suite.
- Research: `docs/agent-experience.md` cites Playwright, Browserbase and Currents
  primary documentation; prioritizes scoped ingestion/private replay, one PR card,
  repo-derived setup, agent failure context, automatic chapters and retry history.
- Limits: local self-test capture is not a customer execution provider or SDK.
  Hosted auth for agents, ingestion, redaction/storage, isolated runners, real PR
  posting and hosted replay remain unimplemented. Manual OS sharing/codecs/limits
  retain prior coverage gaps. Host tooling was Node 24/npm 11; the image used Node 22. Container build used a temporary session-CA Dockerfile; source unchanged.
- Next step: implement one trusted agent-to-PR evidence loop, starting with scoped
  identity and immutable artifact ingestion. Avoid adding more required dashboard
  forms. Do not make retries hide failures or allow an agent to set verification.
- Contracts/migrations: none changed. Next migration remains `0005`.
