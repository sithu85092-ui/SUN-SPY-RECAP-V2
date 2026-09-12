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
  limits: {
    fileSize: MAX_MB * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
      "video/mpeg",
      "video/avi",
      "video/x-flv",
      "video/mpg",
      "video/x-ms-wmv",
      "video/3gpp"
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported video format."));
    }
  }
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    message: "Backend is online."
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.0.0",
    geminiConfigured: Boolean(API_KEY),
    model: MODEL
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*
  Upload video to Gemini Files API
*/
async function uploadToGemini(filePath, mimeType, displayName) {

  const stat = await fs.promises.stat(filePath);

  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: {
        "x-goog-upload-protocol": "resumable",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(stat.size),
        "x-goog-upload-header-content-type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: {
          display_name: displayName
        }
      })
    }
  );

  if (!startResponse.ok) {
    const errorText = await startResponse.text();

    throw new Error(
      `Gemini upload initialization failed: ${errorText}`
    );
  }

  const uploadUrl =
    startResponse.headers.get("x-goog-upload-url") ||
    startResponse.headers.get("X-Goog-Upload-URL");

  if (!uploadUrl) {
    throw new Error("Gemini upload URL was not returned.");
  }

  const stream = fs.createReadStream(filePath);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(stat.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: stream,
    duplex: "half"
  });

  const uploaded = await uploadResponse.json();

  if (!uploadResponse.ok || !uploaded?.file?.name) {
    throw new Error(
      uploaded?.error?.message ||
      "Gemini video upload failed."
    );
  }

  return uploaded.file;
}

/*
  Wait until Gemini finishes processing the video
*/
async function waitForGeminiFile(fileName) {

  for (let attempt = 0; attempt < 120; attempt++) {

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(API_KEY)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        "Could not check Gemini file status."
      );
    }

    if (data.state === "ACTIVE") {
      return data;
    }

    if (data.state === "FAILED") {
      throw new Error(
        "Gemini failed to process the uploaded video."
      );
    }

    await sleep(3000);
  }

  throw new Error(
    "Gemini video processing timed out."
  );
}

/*
  REAL VIDEO RECAP
*/
app.post(
  "/api/recap",
  upload.single("video"),
  async (req, res) => {

    let localPath = req.file?.path;

    try {

      if (!API_KEY) {
        return res.status(500).json({
          ok: false,
          error: "GEMINI_API_KEY is not configured."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Please upload a video."
        });
      }

      const language =
        req.body.language || "Burmese";

      const duration =
        req.body.duration || "90 seconds";

      const style =
        req.body.style || "Cinematic";

      const instructions =
        req.body.instructions || "";

      const aspectRatio =
        req.body.aspectRatio || "9:16";


      /*
        STEP 1
        Upload video to Gemini
      */

      const uploaded = await uploadToGemini(
        localPath,
        req.file.mimetype,
        req.file.originalname
      );

      const geminiFileName = uploaded.name;


      /*
        STEP 2
        Wait for Gemini processing
      */

      const activeFile =
        await waitForGeminiFile(
          geminiFileName
        );


      /*
        STEP 3
        AI VIDEO ANALYSIS PROMPT
      */

      const prompt = `
You are SUN SPY RECAP V2.

Analyze the supplied video carefully.

IMPORTANT:
- Analyze the actual video.
- Do NOT invent events.
- Identify the story.
- Identify important scenes.
- Identify characters.
- Identify key events.
- Identify the best moments for a short recap.
- Use timestamps whenever possible.

Create a professional short-video recap.

Target language:
${language}

Target duration:
${duration}

Style:
${style}

Aspect ratio:
${aspectRatio}

Additional instructions:
${instructions || "None"}

Return ONLY valid JSON.

Required JSON:

{
  "title": "",
  "hook": "",
  "summary": "",
  "recap_script": "",

  "key_events": [
    {
      "timestamp": "00:00",
      "event": "",
      "importance": 1
    }
  ],

  "characters": [
    {
      "name": "",
      "role": ""
    }
  ],

  "scenes": [
    {
      "scene": 1,
      "start": "00:00",
      "end": "00:05",
      "description": "",
      "importance": 1
    }
  ],

  "best_scenes": [
    {
      "timestamp": "00:00",
      "reason": ""
    }
  ],

  "ending": "",

  "hashtags": [
    "#SUNSPY",
    "#Recap"
  ]
}

If Burmese is selected:
- Write natural Burmese.
- Make narration sound human.
- Avoid robotic wording.
- Make the hook strong.
- Keep the story easy to understand.
`;


      /*
        STEP 4
        Send video + prompt to Gemini
      */

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            contents: [
              {
                role: "user",

                parts: [

                  {
                    file_data: {
                      mime_type:
                        activeFile.mimeType ||
                        req.file.mimetype,

                      file_uri:
                        activeFile.uri
                    }
                  },

                  {
                    text: prompt
                  }

                ]
              }
            ],

            generationConfig: {
              temperature: 0.35,
              responseMimeType: "application/json"
            }

          })
        }
      );


      const data =
        await response.json();


      if (!response.ok) {

        return res.status(response.status).json({
          ok: false,
          error:
            data?.error?.message ||
            "Gemini analysis failed.",

          details:
            data?.error || data
        });

      }


      /*
        STEP 5
        Extract AI response
      */

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("") || "";


      let recap;


      try {

        recap = JSON.parse(text);

      } catch {

        recap = {

          title:
            "SUN SPY RECAP",

          hook: "",

          summary:
            text,

          recap_script:
            text,

          key_events: [],

          characters: [],

          scenes: [],

          best_scenes: [],

          ending: "",

          hashtags: [
            "#SUNSPY",
            "#Recap"
          ]

        };

      }


      /*
        STEP 6
        Return result
      */

      res.json({

        ok: true,

        project: {

          originalFilename:
            req.file.originalname,

          mimeType:
            req.file.mimetype,

          size:
            req.file.size,

          language,

          duration,

          style,

          aspectRatio

        },

        recap

      });

    }

    catch (error) {

      console.error(error);

      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Unexpected server error."

      });

    }

    finally {

      if (localPath) {

        fs.promises
          .unlink(localPath)
          .catch(() => {});

      }

    }

  }
);


/*
  Error handling
*/

app.use(
  (err, _req, res, _next) => {

    if (
      err?.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res.status(413).json({

        ok: false,

        error:
          `Video is larger than ${MAX_MB} MB.`

      });

    }


    res.status(500).json({

      ok: false,

      error:
        err?.message ||
        "Server error."

    });

  }
);


app.listen(
  PORT,
  () => {

    console.log(
      `SUN SPY RECAP V2 backend running on port ${PORT}`
    );

  }
);
