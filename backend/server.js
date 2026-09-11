import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 200);

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "2.0.0",
    geminiConfigured: Boolean(API_KEY),
    model: MODEL
  });
});

app.post("/api/recap", upload.single("video"), async (req, res) => {
  let uploadedPath = req.file?.path;

  try {
    if (!API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Please upload an MP4, MOV, WEBM, or MKV video."
      });
    }

    const language = req.body.language || "Burmese";
    const duration = req.body.duration || "90s";
    const style = req.body.style || "Cinematic";
    const instructions = req.body.instructions || "";

    // Step 2 intentionally focuses on the Gemini backend contract.
    // Full video upload/file processing and FFmpeg rendering are added in later phases.
    const prompt = `
You are SUN SPY RECAP, a professional video-story analysis engine.

Return ONLY valid JSON with this structure:
{
  "title": "short title",
  "hook": "attention-grabbing opening",
  "summary": "concise story summary",
  "recap_script": "natural narration script",
  "key_events": [
    {"time": "00:00", "event": "event description"}
  ],
  "characters": [
    {"name": "character", "role": "role"}
  ],
  "scenes": [
    {"scene": 1, "description": "important scene", "importance": 1}
  ],
  "ending": "short ending and CTA",
  "hashtags": ["#SUNSPY", "#Recap"]
}

Target language: ${language}
Target duration: ${duration}
Style: ${style}
Additional instructions: ${instructions || "None"}

If the supplied media cannot be analyzed directly, clearly state that in the JSON
instead of inventing events.
`;

    // This uses Gemini's REST generateContent endpoint for text analysis.
    // The actual Gemini File API/video ingestion is wired in the next processing phase.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "Gemini API request failed.",
        details: data?.error || data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    let recap;
    try {
      recap = JSON.parse(text);
    } catch {
      recap = {
        title: "SUN SPY RECAP",
        hook: "",
        summary: text,
        recap_script: text,
        key_events: [],
        characters: [],
        scenes: [],
        ending: "",
        hashtags: ["#SUNSPY", "#Recap"]
      };
    }

    res.json({
      ok: true,
      project: {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        targetLanguage: language,
        targetDuration: duration,
        style
      },
      recap
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error.message || "Unexpected server error."
    });
  } finally {
    if (uploadedPath) {
      fs.promises.unlink(uploadedPath).catch(() => {});
    }
  }
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      ok: false,
      error: `Video is larger than ${MAX_MB} MB.`
    });
  }

  if (err?.message?.includes("File type")) {
    return res.status(400).json({
      ok: false,
      error: err.message
    });
  }

  res.status(500).json({ ok: false, error: err?.message || "Server error." });
});

app.listen(PORT, () => {
  console.log(`SUN SPY RECAP V2 backend running on http://localhost:${PORT}`);
});
