# DocAnalyzer

Intelligent Document Parsing and Metadata Registry — a MERN application that uploads documents (PDF, DOCX, TXT, MD, CSV, JSON, PNG/JPG), extracts text, analyzes it with Google Gemini (with local fallback), and stores a searchable registry in MongoDB.

Course: Web Applications Programming
Student: Bauyrzhan Marat

## Stack

- Frontend: React 19, Create React App, Axios
- Backend: Node.js 20+, Express 5
- Database: MongoDB Atlas + Mongoose
- Uploads: multer
- Extraction: pdf-parse, mammoth, Gemini multimodal for images
- AI: @google/genai (Gemini Flash)

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

## Notes

- Original files are stored in `server/uploads/`. MongoDB keeps only metadata and analysis results.
- If Gemini is unavailable, the server falls back to local heuristics (summary, keywords, category) and marks the record with `aiAnalyzed=false`.
- `.env` is git-ignored. Never commit real keys.
