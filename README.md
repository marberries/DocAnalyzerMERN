# DocAnalyzer — Server

Express 5 + MongoDB API for the DocAnalyzer document analysis application.
The React client lives in a separate repository (`DocAnalyzerClient`).

## What it does

- Accepts PDF, DOCX, TXT, MD, CSV, JSON and images (PNG/JPG) via multer.
- Extracts text with `pdf-parse` (PDF), `mammoth` (DOCX) and the filesystem (plain text).
- Sends the text to Google Gemini and stores a summary, category, keywords and
  key findings. Images are sent to Gemini as multimodal input for OCR.
- Falls back to a local extractive summary and term-frequency keywords when the
  Gemini API is unavailable, so an upload never fails because of the model.
- Stores documents, analysis results and file paths in MongoDB Atlas.

## Requirements

- Node.js 20 or newer
- MongoDB Atlas cluster
- Google AI Studio (Gemini) API key

## Setup

```bash
cp .env.example .env      # fill in the values
npm install
npm run dev               # nodemon on http://localhost:5001
# or: npm start
```

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | API port, default `5001` |
| `MONGO_URI` | MongoDB Atlas connection string (database `docanalyzer`) |
| `JWT_SECRET` | Reserved for future authentication; not used yet |
| `GEMINI_API_KEY` | Google AI Studio key for the Gemini API |

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health message |
| POST | `/api/singleFile` | Upload and analyse one document (`file` field) |
| POST | `/api/multipleFiles` | Upload and analyse a batch (`files` fields, `title`) |
| POST | `/api/reanalyze/:id` | Re-run AI analysis for a stored document |
| GET | `/api/getSingleFiles` | List documents, newest first |
| GET | `/api/getMultipleFiles` | List batch collections |
| DELETE | `/api/:id` | Delete a document record and its stored file |
| GET | `/uploads/:filename` | Download/open the original file |

## Notes

- Upload limits: 25 MB per file, 20 files per batch.
- The Gemini free tier allows about 20 requests per day per model, so the server
  walks a short list of current models (`gemini-3.5-flash-lite` first), caches the
  model that worked and puts exhausted models on cooldown. If no model answers
  within the timeout, the document is stored with a local summary and
  `aiAnalyzed: false`.
- If Atlas refuses the connection, add your current public IP under
  **Atlas → Network Access** (or use `0.0.0.0/0` for a short demo).
- Original files are stored in `uploads/` and are not committed to git.
