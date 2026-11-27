# Security policy

## Supported versions

Only the `main` branch is maintained. This is an academic project, not a
production service.

## Reporting a vulnerability

Please open a private security advisory on GitHub
(**Security → Advisories → New draft advisory**) instead of a public issue.
Do not include real credentials in the report; describe the location instead.

## Secrets

- Real values live only in `server/.env`, which is ignored by git.
- `.env.example` contains placeholders and is the only environment file that
  may be committed.
- Never put API keys, connection strings or passwords in source code, commit
  messages, screenshots or issue text.

## If a secret is exposed

1. **Rotate it first** — revoke the Gemini key in Google AI Studio and change
   the MongoDB Atlas database user password. Git history cleanup does not make
   a leaked credential safe again.
2. Remove the file from tracking (`git rm --cached .env`) and add it to
   `.gitignore`.
3. Optionally purge the value from history with `git filter-repo` and force-push.
   Coordinate with everyone who cloned the repository.

## Known limitations

- No authentication: every API route is public. Do not store sensitive
  documents in a publicly reachable deployment.
- Uploads are validated by the declared MIME type, not by file signatures.
- CORS is open to all origins.
- Documents are sent to the Google Gemini API for analysis.
