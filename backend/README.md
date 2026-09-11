# SUN SPY RECAP V2 — Step 2

Professional backend foundation for SUN SPY RECAP V2.

## What is included

- Express backend
- Secure server-side Gemini API key
- `.env` configuration
- Health endpoint
- Video upload endpoint
- Gemini JSON response contract
- Burmese/English language selection
- Duration/style/instruction parameters
- Error handling
- Upload size protection

## Setup

1. Install Node.js 18+.
2. Open this `backend` folder in a terminal.
3. Copy `.env.example` to `.env`.
4. Put your Gemini API key into `.env`:

GEMINI_API_KEY=YOUR_REAL_KEY

5. Install dependencies:

npm install

6. Start:

npm start

For development:

npm run dev

## Test

Open:

http://localhost:8787/api/health

You should see JSON with:

"ok": true

and:

"geminiConfigured": true

## Security

- Never put the real Gemini key in `frontend/index.html`.
- Never commit `.env`.
- Never send the API key from the browser.
- Add authentication/rate limits before public deployment.

## Important

Step 2 establishes the backend and Gemini contract. Full Gemini video-file ingestion,
FFmpeg processing, TTS, SRT, logo burn-in, rendering, queues, authentication,
database, storage, plans, and admin controls are implemented in later phases.
