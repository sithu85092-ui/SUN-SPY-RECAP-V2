require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const OUTPUT_DIR = path.join(ROOT_DIR, "outputs");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/outputs", express.static(OUTPUT_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".mp4");
    const name =
      Date.now() +
      "-" +
      crypto.randomBytes(6).toString("hex") +
      ext;

    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});


// ----------------------------------------------------
// BASIC HELPERS
// ----------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFilename(name) {
  return String(name || "output")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function even(value) {
  const n = Math.max(2, Math.round(Number(value) || 2));
  return n % 2 === 0 ? n : n - 1;
}

function getPublicBaseUrl(req) {
  const configured =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const protocol =
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http";

  const host =
    req.headers["x-forwarded-host"] ||
    req.get("host");

  return `${protocol}://${host}`;
}


// ----------------------------------------------------
// COMMAND RUNNER
// ----------------------------------------------------

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr
        });
      } else {
        const error = new Error(
          `Command failed with code ${code}`
        );

        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;

        reject(error);
      }
    });
  });
}


// ----------------------------------------------------
// FFMPEG — GET VIDEO DURATION
// ----------------------------------------------------

async function getVideoDuration(input) {
  const result = await runCommand(ffmpegPath, [
    "-hide_banner",
    "-i",
    input,
    "-f",
    "null",
    "-"
  ]);

  const output = `${result.stdout}\n${result.stderr}`;

  const match = output.match(
    /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i
  );

  if (!match) {
    throw new Error(
      "Could not determine video duration."
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}


// ----------------------------------------------------
// FFMPEG FILTER
// ----------------------------------------------------

function getVideoFilter(aspectRatio) {
  switch (aspectRatio) {
    case "16:9":
      return [
        "scale=trunc(ih*16/9/2)*2:trunc(ih/2)*2",
        "crop=trunc(iw/2)*2:trunc(ih/2)*2"
      ].join(",");

    case "1:1":
      return [
        "crop=min(iw\\,ih):min(iw\\,ih)",
        "scale=trunc(min(iw\\,ih)/2)*2:trunc(min(iw\\,ih)/2)*2"
      ].join(",");

    case "4:5":
      return [
        "crop=min(iw\\,ih*4/5):min(ih\\,iw*5/4)",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
      ].join(",");

    case "9:16":
    default:
      return [
        "crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9)",
        "scale=trunc(ih*9/16/2)*2:trunc(ih/2)*2"
      ].join(",");
  }
}


// ----------------------------------------------------
// GEMINI ERROR HELPERS
// ----------------------------------------------------

function getGeminiStatus(error) {
  if (!error) return null;

  if (error.status) {
    return Number(error.status);
  }

  const message = String(error.message || "");

  const match = message.match(
    /\b(400|401|403|404|408|409|429|500|502|503|504)\b/
  );

  return match ? Number(match[1]) : null;
}

function isRetryableGeminiError(error) {
  const status = getGeminiStatus(error);

  return [
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(status);
}

function extractGeminiError(data) {
  if (!data) {
    return "Unknown Gemini error";
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.error) {
    if (data.error.message) {
      return data.error.message;
    }

    return JSON.stringify(data.error);
  }

  return JSON.stringify(data);
}


// ----------------------------------------------------
// GEMINI API REQUEST
// ----------------------------------------------------

async function geminiRequest(url, options = {}) {
  const response = await fetch(url, options);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      extractGeminiError(data)
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}


// ----------------------------------------------------
// GEMINI FILE UPLOAD
// ----------------------------------------------------

async function uploadGeminiFile(filePath, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const fileBuffer = fs.readFileSync(filePath);

  const uploadUrl =
    "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" +
    encodeURIComponent(GEMINI_API_KEY);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType || "video/mp4",
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Command": "start, upload, finalize"
    },
    body: fileBuffer
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      `Gemini file upload failed: ${
        extractGeminiError(data || text)
      }`
    );
  }

  return data.file || data;
}


// ----------------------------------------------------
// WAIT FOR GEMINI FILE TO BECOME ACTIVE
// ----------------------------------------------------

async function waitForGeminiFile(fileName) {
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=` +
      encodeURIComponent(GEMINI_API_KEY);

    const data = await geminiRequest(url);

    const state =
      data?.state ||
      data?.file?.state ||
      "ACTIVE";

    if (state === "ACTIVE") {
      return data.file || data;
    }

    if (
      state === "FAILED" ||
      state === "ERROR"
    ) {
      throw new Error(
        `Gemini file processing failed: ${JSON.stringify(data)}`
      );
    }

    await sleep(2000);
  }

  throw new Error(
    "Gemini file processing timed out."
  );
}


// ----------------------------------------------------
// GEMINI RESPONSE JSON PARSER
// ----------------------------------------------------

function extractGeminiText(data) {
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

  return text.trim();
}

function cleanJsonText(text) {
  let cleaned = String(text || "").trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return cleaned;
}

function parseGeminiJson(text) {
  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }
}


// ----------------------------------------------------
// BUILD RECAP PROMPT
// ----------------------------------------------------

function buildRecapPrompt({
  language,
  durationSeconds,
  style,
  instructions
}) {
  const targetLanguage =
    language === "English"
      ? "English"
      : "Burmese";

  return `
You are SUN SPY RECAP AI, a professional video understanding
and short-form recap assistant.

Analyze the uploaded video carefully.

Your task:
1. Understand the actual story and events.
2. Identify important scenes.
3. Identify main characters.
4. Identify the strongest hook.
5. Select the most important story moments.
6. Create a natural short recap.
7. Make the narration engaging and human-like.
8. Avoid inventing events that are not visible or supported.
9. Keep the recap suitable for TikTok, YouTube Shorts and Facebook Reels.
10. Return ONLY valid JSON.

Target recap language: ${targetLanguage}
Target duration: approximately ${durationSeconds} seconds
Style: ${style || "Cinematic Story"}

Additional instructions:
${instructions || "None"}

Return exactly this JSON structure:

{
  "title": "Short attractive title",
  "hook": "Strong opening hook",
  "summary": "Short summary",
  "characters": [
    {
      "name": "Character name",
      "role": "Character role"
    }
  ],
  "scenes": [
    {
      "order": 1,
      "description": "What happens in this scene",
      "narration": "Narration for this scene"
    }
  ],
  "recapScript": "Complete narration script",
  "ending": "Ending or CTA",
  "hashtags": [
    "#hashtag1",
    "#hashtag2",
    "#hashtag3"
  ]
}
`;
}


// ----------------------------------------------------
// GEMINI GENERATION WITH RETRY + FALLBACK
// ----------------------------------------------------

async function generateGeminiRecap({
  fileUri,
  mimeType,
  language,
  durationSeconds,
  style,
  instructions
}) {
  const models = [];

  const configuredModels = [
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL
  ];

  for (const model of configuredModels) {
    if (
      model &&
      !models.includes(model)
    ) {
      models.push(model);
    }
  }

  const prompt = buildRecapPrompt({
    language,
    durationSeconds,
    style,
    instructions
  });

  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(
          `Gemini generation: model=${model}, attempt=${attempt}/3`
        );

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
          encodeURIComponent(GEMINI_API_KEY);

        const data = await geminiRequest(url, {
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
                    text: prompt
                  },
                  {
                    file_data: {
                      mime_type:
                        mimeType || "video/mp4",
                      file_uri: fileUri
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.65,
              responseMimeType: "application/json"
            }
          })
        });

        const text = extractGeminiText(data);

        if (!text) {
          throw new Error(
            "Gemini returned an empty response."
          );
        }

        const recap = parseGeminiJson(text);

        return {
          recap,
          model,
          attempts: attempt
        };
      } catch (error) {
        lastError = error;

        console.error(
          `Gemini error model=${model} attempt=${attempt}:`,
          error.message
        );

        if (
          !isRetryableGeminiError(error)
        ) {
          break;
        }

        if (attempt < 3) {
          const waitTime =
            Math.min(
              15000,
              2000 * Math.pow(2, attempt - 1)
            ) +
            Math.floor(
              Math.random() * 1000
            );

          console.log(
            `Retrying Gemini in ${waitTime}ms...`
          );

          await sleep(waitTime);
        }
      }
    }

    console.log(
      `Gemini model ${model} failed. Trying fallback...`
    );
  }

  const status =
    getGeminiStatus(lastError);

  const error = new Error(
    `Gemini generation failed: ${
      lastError?.message ||
      "Unknown error"
    }`
  );

  error.status = status || 503;
  error.retryable = true;

  throw error;
}


// ----------------------------------------------------
// HOME
// ----------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.4.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL,
    fallbackModel: GEMINI_FALLBACK_MODEL
  });
});


// ----------------------------------------------------
// HEALTH
// ----------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.4.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL,
    fallbackModel: GEMINI_FALLBACK_MODEL
  });
});


// ----------------------------------------------------
// AI RECAP
// ----------------------------------------------------

app.post(
  "/api/recap",
  upload.single("video"),
  async (req, res) => {
    let uploadedFile = null;

    try {
      if (!GEMINI_API_KEY) {
        return res.status(500).json({
          ok: false,
          error:
            "GEMINI_API_KEY is not configured on the server."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No video file uploaded."
        });
      }

      uploadedFile = req.file.path;

      const durationSeconds = Math.max(
        5,
        Number(
          req.body.durationSeconds ||
          req.body.duration ||
          30
        )
      );

      const language =
        req.body.language ||
        "Burmese";

      const style =
        req.body.style ||
        "Cinematic Story";

      const instructions =
        req.body.instructions ||
        req.body.prompt ||
        "";

      const mimeType =
        req.file.mimetype ||
        "video/mp4";

      console.log(
        "----------------------------------------"
      );

      console.log(
        "SUN SPY RECAP: Starting Gemini analysis"
      );

      console.log(
        "File:",
        req.file.originalname
      );

      console.log(
        "Size:",
        req.file.size
      );

      console.log(
        "Language:",
        language
      );

      console.log(
        "Duration:",
        durationSeconds
      );

      console.log(
        "Model:",
        GEMINI_MODEL
      );

      console.log(
        "----------------------------------------"
      );


      // Upload video to Gemini
      const geminiFile =
        await uploadGeminiFile(
          uploadedFile,
          mimeType
        );

      console.log(
        "Gemini file uploaded:",
        geminiFile?.name
      );

      const fileName =
        geminiFile?.name;

      const fileUri =
        geminiFile?.uri ||
        geminiFile?.fileUri;

      if (!fileName || !fileUri) {
        throw new Error(
          "Gemini did not return a valid file reference."
        );
      }


      // Wait until Gemini has processed video
      const activeFile =
        await waitForGeminiFile(
          fileName
        );

      const activeFileUri =
        activeFile?.uri ||
        fileUri;

      console.log(
        "Gemini file is ACTIVE."
      );


      // Generate recap
      const result =
        await generateGeminiRecap({
          fileUri: activeFileUri,
          mimeType,
          language,
          durationSeconds,
          style,
          instructions
        });

      console.log(
        "Gemini recap generated successfully."
      );

      console.log(
        "Used model:",
        result.model
      );

      res.json({
        ok: true,
        success: true,
        recap: result.recap,
        model: result.model,
        attempts: result.attempts
      });

    } catch (error) {
      console.error(
        "RECAP ERROR:",
        error
      );

      const status =
        error.status &&
        Number(error.status) >= 400 &&
        Number(error.status) <= 599
          ? Number(error.status)
          : 500;

      res.status(status).json({
        ok: false,
        success: false,
        error:
          error.message ||
          "Gemini recap generation failed.",
        retryable:
          error.retryable === true
      });

    } finally {
      // Delete local uploaded copy.
      // Gemini already has its own uploaded copy.
      if (
        uploadedFile &&
        fs.existsSync(uploadedFile)
      ) {
        try {
          fs.unlinkSync(uploadedFile);
        } catch (cleanupError) {
          console.warn(
            "Could not delete uploaded file:",
            cleanupError.message
          );
        }
      }
    }
  }
);


// ----------------------------------------------------
// PROCESS VIDEO
// ----------------------------------------------------

app.post(
  "/api/process-video",
  upload.single("video"),
  async (req, res) => {
    let inputFile = null;
    let outputFile = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No video file uploaded."
        });
      }

      inputFile = req.file.path;

      const requestedDuration = Math.max(
        1,
        Number(
          req.body.durationSeconds ||
          req.body.duration ||
          30
        )
      );

      const aspectRatio =
        req.body.aspectRatio ||
        "9:16";

      const resolution =
        req.body.resolution ||
        "1080p";

      const sourceDuration =
        await getVideoDuration(
          inputFile
        );

      const finalDuration =
        Math.min(
          requestedDuration,
          sourceDuration
        );

      let height;

      if (resolution === "720p") {
        height = 720;
      } else {
        height = 1080;
      }

      const filter =
        getVideoFilter(
          aspectRatio
        );

      const id =
        Date.now() +
        "-" +
        crypto
          .randomBytes(5)
          .toString("hex");

      outputFile = path.join(
        OUTPUT_DIR,
        `${id}.mp4`
      );

      console.log(
        "----------------------------------------"
      );

      console.log(
        "SUN SPY RECAP: FFmpeg processing"
      );

      console.log(
        "Source duration:",
        sourceDuration
      );

      console.log(
        "Requested duration:",
        requestedDuration
      );

      console.log(
        "Final duration:",
        finalDuration
      );

      console.log(
        "Aspect ratio:",
        aspectRatio
      );

      console.log(
        "Resolution:",
        resolution
      );

      console.log(
        "----------------------------------------"
      );


      const scaleFilter =
        `${filter},scale=-2:${height}`;

      const args = [
        "-y",

        "-hide_banner",

        "-i",
        inputFile,

        "-t",
        String(finalDuration),

        "-map",
        "0:v:0",

        "-map",
        "0:a:0?",

        "-vf",
        scaleFilter,

        "-sn",

        "-dn",

        "-c:v",
        "libx264",

        "-preset",
        "veryfast",

        "-crf",
        "23",

        "-pix_fmt",
        "yuv420p",

        "-c:a",
        "aac",

        "-b:a",
        "128k",

        "-movflags",
        "+faststart",

        outputFile
      ];

      await runCommand(
        ffmpegPath,
        args
      );

      if (
        !fs.existsSync(outputFile)
      ) {
        throw new Error(
          "FFmpeg completed but output file was not created."
        );
      }

      const stat =
        fs.statSync(outputFile);

      if (stat.size <= 0) {
        throw new Error(
          "FFmpeg created an empty output file."
        );
      }

      const baseUrl =
        getPublicBaseUrl(req);

      const outputUrl =
        `${baseUrl}/outputs/${encodeURIComponent(
          path.basename(outputFile)
        )}`;

      console.log(
        "FFmpeg completed:",
        outputUrl
      );

      res.json({
        ok: true,
        success: true,
        outputUrl,
        videoUrl: outputUrl,
        url: outputUrl,
        file: outputUrl,
        duration: finalDuration,
        durationSeconds: finalDuration,
        aspectRatio,
        resolution
      });

    } catch (error) {
      console.error(
        "PROCESS VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        success: false,
        error:
          error.message ||
          "Video processing failed.",
        details:
          error.stderr
            ? error.stderr.slice(-5000)
            : undefined
      });

    } finally {
      if (
        inputFile &&
        fs.existsSync(inputFile)
      ) {
        try {
          fs.unlinkSync(inputFile);
        } catch {}
      }
    }
  }
);


// ----------------------------------------------------
// ERROR HANDLER
// ----------------------------------------------------

app.use(
  (error, _req, res, _next) => {
    console.error(
      "GLOBAL ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Internal server error."
    });
  }
);


// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "========================================"
  );

  console.log(
    "SUN SPY RECAP V2"
  );

  console.log(
    "Backend running on port:",
    PORT
  );

  console.log(
    "Gemini model:",
    GEMINI_MODEL
  );

  console.log(
    "Gemini fallback:",
    GEMINI_FALLBACK_MODEL
  );

  console.log(
    "FFmpeg:",
    ffmpegPath
      ? "AVAILABLE"
      : "NOT AVAILABLE"
  );

  console.log(
    "Gemini API:",
    GEMINI_API_KEY
      ? "CONFIGURED"
      : "NOT CONFIGURED"
  );

  console.log(
    "========================================"
  );
});
