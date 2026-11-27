# API reference

Base URL: `http://localhost:5001`. All responses are JSON unless noted.
There is no authentication in the current scope.

## Health

`GET /api/health`

```json
{
  "status": "ok",
  "database": "connected",
  "aiConfigured": true,
  "aiKeyValid": true,
  "uptimeSeconds": 42,
  "timestamp": "2026-11-27T22:00:00.000Z"
}
```

`database` is `connected`, `connecting`, `disconnected` or `unknown`.
`aiKeyValid` is a cached check (5 minutes) against the Gemini ListModels endpoint.

## Upload one document

`POST /api/singleFile` — `multipart/form-data`, field `file`.

```bash
curl -X POST http://localhost:5001/api/singleFile \
  -F "file=@contract.pdf;type=application/pdf"
```

`201 Created` returns the stored document:

```json
{
  "_id": "6b07429074ff31cd4e35902f",
  "fileName": "contract.pdf",
  "fileType": "application/pdf",
  "fileSize": "48.9 KB",
  "summary": "A service agreement between ...",
  "category": "Legal / Contract",
  "keywords": ["agreement", "payment", "termination"],
  "keyFindings": ["Delivery is due within 30 days."],
  "wordCount": 184,
  "aiAnalyzed": true,
  "aiError": "",
  "createdAt": "2026-11-27T22:00:00.000Z"
}
```

## Upload a batch

`POST /api/multipleFiles` — `multipart/form-data`, repeated `files` fields and
an optional `title`.

```bash
curl -X POST http://localhost:5001/api/multipleFiles \
  -F "title=Lab reports" \
  -F "files=@report1.pdf" \
  -F "files=@report2.docx"
```

`201 Created` returns the collection with a per-file analysis and a
`batchSummary` digest.

## Re-analyze

`POST /api/reanalyze/:id` — re-runs extraction (if needed) and Gemini analysis
for a stored document. `200` with the updated document, `404` if not found.

## List

- `GET /api/getSingleFiles` — array of documents, newest first.
- `GET /api/getMultipleFiles` — array of batch collections, newest first.

## Delete

`DELETE /api/:id` — deletes the record and its stored file. `200`:

```json
{ "message": "Document deleted successfully", "id": "6b0742..." }
```

## Files

`GET /uploads/:filename` — streams the original upload.

## Errors

Errors use a JSON body: `{ "error": "message" }`.

| Status | Meaning |
| --- | --- |
| 400 | Validation, extraction, oversized upload or unsupported type |
| 404 | Document id not found |
| 500 | Unexpected server error |
