# Architecture

## Overview

```
Browser (React SPA, :3000)
   |  /api and /uploads via src/setupProxy.js
   v
Express 5 API (:5001)
   |-- multer ............ original files -> uploads/
   |-- pdf-parse/mammoth .. text extraction
   |-- Gemini API ......... summary, category, keywords, OCR
   +-- Mongoose ........... MongoDB Atlas (metadata + results)
```

Three tiers:

- **Client** — React 19 single-page application. Upload panel, analysis
  view and archive. No global state library; hooks only.
- **API** — stateless Express 5 service. Routing, upload handling, text
  extraction, Gemini calls and persistence.
- **Data** — MongoDB Atlas for records, the server filesystem for originals,
  and the Gemini API as an external analysis service.

## Upload flow (single document)

1. The client posts `multipart/form-data` to `POST /api/singleFile` through the
   dev proxy.
2. multer stores the file in `uploads/` with a timestamped, sanitised name and
   enforces the MIME allowlist and the 25 MB limit.
3. The controller extracts text:
   - PDF: `pdf-parse` (text layer only),
   - DOCX: `mammoth.extractRawText`,
   - TXT/MD/CSV/JSON: `fs.readFileSync`,
   - images: no local text, sent to Gemini as multimodal input for OCR.
4. `analyzeDocument` builds the prompt and requests strict JSON from Gemini:
   `summary`, `category`, `keywords`, `keyFindings`, `ocrText`.
   Only the first 8 000 characters are sent.
5. If no model answers, a local fallback produces an extractive summary,
   term-frequency keywords and a dictionary-based category. The record is
   marked `aiAnalyzed: false` and `aiError` explains why.
6. Mongoose inserts a `SingleFile` (or pushes into `MultipleFile.files`) and the
   API responds with the stored document.
7. The client selects the new document and refreshes both archive lists.

## Data model

### `singlefiles`

| Field | Type | Notes |
| --- | --- | --- |
| fileName, filePath, fileType, fileSize | String | file metadata |
| extractedText | String | capped at 15 000 characters |
| summary | String | 2–3 sentences |
| keyFindings | [String] | 3–4 takeaways |
| keywords | [String] | 5–6 tags |
| wordCount | Number | |
| category | String | one of five labels |
| aiAnalyzed, aiError | Boolean, String | AI status |
| createdAt, updatedAt | Date | timestamps |

### `multiplefiles`

`title`, `files` (array of per-file objects, text capped at 8 000 characters),
`batchSummary` (a 600-character digest), timestamps.

## Gemini model selection

`MODEL_PRIORITY` lists current text models, starting with
`gemini-3.5-flash-lite`. The server caches the model that worked, calls one
model at a time to respect the free-tier per-model quota, and applies cooldowns:
10 minutes after a 429, 1 minute after a 503/timeout, 6 hours after a 404.
`ListModels` is the last resort.

## Processing model

Processing is synchronous: the HTTP request stays open until the document is
analysed and stored. Batch uploads loop over files sequentially, so latency is
roughly N × (extraction + model time). The planned improvement is a queue-based
worker (BullMQ + Redis) that returns `202 Accepted` with a job id and lets the
client poll for per-file status.

## Deployment

- Development: API on `:5001`, CRA dev server on `:3000`, MongoDB Atlas, local
  `uploads/`.
- Production: the included `Dockerfile` runs the API; the client is a static
  build on a CDN; originals move to S3-compatible storage; secrets come from the
  platform environment, never from the repository.

## Known constraints

- No authentication or per-user isolation.
- Uploads are validated by the declared MIME type, not by file signatures.
- List endpoints return full documents without pagination.
- CORS is open to all origins.
