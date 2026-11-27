# DocAnalyzer

Intelligent Document Parsing and Metadata Registry — a MERN application that
uploads documents (PDF, DOCX, TXT, MD, CSV, JSON, PNG/JPG), extracts text,
analyzes it with Google Gemini (with a local fallback), and stores a searchable
registry in MongoDB.

Course: Web Applications Programming
Student: Bauyrzhan Marat

## Stack

- Frontend: React 19, Create React App, Axios
- Backend: Node.js 20+, Express 5
- Database: MongoDB Atlas + Mongoose
- Uploads: multer
- Extraction: pdf-parse, mammoth, Gemini multimodal for images
- AI: @google/genai (Gemini Flash)

## How it works

1. The client posts a file to `/api/singleFile`, or several files to
   `/api/multipleFiles` with a collection title.
2. multer stores the original in `uploads/` and checks the MIME type and limits
   (25 MB per file, 20 files per batch).
3. The controller extracts text: `pdf-parse` for PDF, `mammoth` for DOCX and the
   filesystem for TXT/MD/CSV/JSON. Images are sent to Gemini as multimodal input
   for OCR.
4. Gemini returns strict JSON with `summary`, `category`, `keywords`,
   `keyFindings` and `ocrText`. If no model answers, the server builds a local
   summary and keywords and stores the record with `aiAnalyzed: false`.
5. Mongoose saves the result in `singlefiles` or `multiplefiles`; the React
   client renders it in the archive.

## Supported formats

| Format | Tool | Notes |
|--------|------|-------|
| PDF | pdf-parse | Text layer only; scanned PDFs have no OCR yet |
| DOCX | mammoth | |
| TXT, MD, CSV, JSON | Node.js fs | UTF-8 |
| PNG, JPG/JPEG | Gemini vision | OCR through the model |

## Local setup

### 1. Backend

    cd DocAnalyzerMERN
    npm install
    cp .env.example .env
    # edit .env: set MONGO_URI and GEMINI_API_KEY
    npm run dev          # http://localhost:5001

### 2. Frontend

    cd DocAnalyzerClient
    npm install
    npm start            # http://localhost:3000

Client forwards /api and /uploads to :5001 via src/setupProxy.js.

## Environment variables

See `.env.example`. Required:

- `MONGO_URI` — MongoDB Atlas connection string
- `GEMINI_API_KEY` — Google AI Studio API key

Optional: `PORT` (default 5001), `JWT_SECRET` (reserved).

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/singleFile | Upload and analyze one document |
| POST | /api/multipleFiles | Upload and analyze a batch |
| POST | /api/reanalyze/:id | Re-run analysis for a stored document |
| GET | /api/getSingleFiles | List single documents |
| GET | /api/getMultipleFiles | List batches |
| DELETE | /api/:id | Delete document and its file |
| GET | /uploads/:filename | Download original |

Full request/response examples: [docs/API.md](docs/API.md).

## Health check

`GET /api/health` returns the connection state and key status:

```json
{
  "status": "ok",
  "database": "connected",
  "aiConfigured": true,
  "aiKeyValid": true,
  "uptimeSeconds": 42
}
```

- `database` — Mongoose connection state (`connected`, `connecting`, `disconnected`).
- `aiConfigured` — `GEMINI_API_KEY` is present in the environment.
- `aiKeyValid` — cached for 5 minutes, checked against the Gemini API.

## Project structure

    controllers/   request handlers and the analysis pipeline
    models/        Mongoose schemas (SingleFile, MultipleFile)
    routes/        REST routes mounted at /api
    helpers/       multer storage and file filter
    docs/          API reference
    uploads/       original files (git-ignored)

## Notes

- Original files are stored in `server/uploads/`. MongoDB keeps only metadata
  and analysis results.
- If Gemini is unavailable or the quota is exhausted, the server falls back to
  local heuristics and marks the record with `aiAnalyzed=false`.
- `.env` is git-ignored. Never commit real keys; see [SECURITY.md](SECURITY.md).

## Roadmap

- [ ] Pagination and server-side search for the archive
- [ ] Batch deletion endpoint and UI
- [ ] Rate limiting and security headers
- [ ] API tests (Jest + Supertest)
- [ ] Container deployment with secrets managed by the platform
