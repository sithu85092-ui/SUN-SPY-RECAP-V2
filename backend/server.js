import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use(
  "/outputs",
  express.static(outputsDir, {
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    }
  })
);

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

/* =========================
   COMMAND RUNNER
========================= */

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", data => {
      stdout += data.toString();
    });

    process.stderr.on("data", data => {
      stderr += data.toString();
    });

    process.on("error", reject);

    process.on("close", code => {
      if (code === 0) {
        resolve({
          stdout,
          stderr
        });
      } else {
        const error = new Error(
          `FFmpeg exited with code ${code}`
        );

        error.stderr = stderr;
        error.stdout = stdout;

        reject(error);
      }
    });
  });
}

/* =========================
   VIDEO DURATION
========================= */

async function getVideoDuration(filePath) {
  const result = await runCommand(ffmpegPath, [
    "-hide_banner",
    "-i",
    filePath
  ]);

  const match = result.stderr.match(
    /Duration:\s*(\d+):(\d+):([\d.]+)/
  );

  if (!match) {
    throw new Error(
      "Could not detect video duration."
    );
  }

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}

/* =========================
   VIDEO FILTER
========================= */

function getVideoFilter(
  aspectRatio = "9:16",
  resolution = "1080p"
) {
  const height =
    resolution === "720p"
      ? 720
      : 1080;

  if (aspectRatio === "16:9") {
    const width =
      resolution === "720p"
        ? 1280
        : 1920;

    return (
      `scale=${width}:${height}:` +
      `force_original_aspect_ratio=increase,` +
      `crop=${width}:${height}`
    );
  }

  if (aspectRatio === "1:1") {
    return (
      `scale=${height}:${height}:` +
      `force_original_aspect_ratio=increase,` +
      `crop=${height}:${height}`
    );
  }

  if (aspectRatio === "4:5") {
    const width = Math.round(
      height * 4 / 5
    );

    return (
      `scale=${width}:${height}:` +
      `force_original_aspect_ratio=increase,` +
      `crop=${width}:${height}`
    );
  }

  // 9:16
  const width = Math.round(
    height * 9 / 16
  );

  return (
    `scale=${width}:${height}:` +
    `force_original_aspect_ratio=increase,` +
    `crop=${width}:${height}`
  );
}

/* =========================
   SAFE FILE NAME
========================= */

function cleanFileName(name) {
  return String(name || "video")
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )
    .slice(0, 80);
}

/* =========================
   OUTPUT URL
========================= */

function getOutputUrl(req, filename) {
  return (
    `${req.protocol}://` +
    `${req.get("host")}` +
    `/outputs/` +
    encodeURIComponent(filename)
  );
}

/* =========================
   HEALTH
========================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.2.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured:
      Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.2.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured:
      Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

/* =========================
   GEMINI RECAP
========================= */

app.post(
  "/api/recap",
  upload.single("video"),
  async (req, res) => {

    let inputFile =
      req.file?.path;

    try {

      if (!GEMINI_API_KEY) {
        return res.status(500).json({
          ok: false,
          error:
            "GEMINI_API_KEY is not configured."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error:
            "No video file uploaded."
        });
      }

      const language =
        req.body.language ||
        "Burmese";

      const style =
        req.body.style ||
        "Cinematic Story";

      const instructions =
        req.body.instructions ||
        "";

      const duration =
        req.body.duration ||
        req.body.durationSeconds ||
        "60";

      const videoBuffer =
        fs.readFileSync(inputFile);

      /* ---------- Upload ---------- */

      const uploadResponse =
        await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(
            GEMINI_API_KEY
          )}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                req.file.mimetype ||
                "video/mp4",

              "X-Goog-Upload-Protocol":
                "raw",

              "X-Goog-Upload-Command":
                "upload"
            },
            body: videoBuffer
          }
        );

      if (!uploadResponse.ok) {
        const errorText =
          await uploadResponse.text();

        throw new Error(
          `Gemini upload failed: ${errorText}`
        );
      }

      const uploaded =
        await uploadResponse.json();

      const fileUri =
        uploaded?.file?.uri;

      const fileName =
        uploaded?.file?.name;

      if (!fileUri) {
        throw new Error(
          "Gemini did not return file URI."
        );
      }

      /* ---------- Wait ---------- */

      let state = "PROCESSING";

      for (
        let i = 0;
        i < 60;
        i++
      ) {

        const statusResponse =
          await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(
              GEMINI_API_KEY
            )}`
          );

        if (!statusResponse.ok) {
          const text =
            await statusResponse.text();

          throw new Error(
            `Gemini status failed: ${text}`
          );
        }

        const status =
          await statusResponse.json();

        state =
          status?.state ||
          status?.file?.state ||
          "PROCESSING";

        if (state === "ACTIVE") {
          break;
        }

        if (state === "FAILED") {
          throw new Error(
            "Gemini failed to process video."
          );
        }

        await new Promise(
          resolve =>
            setTimeout(resolve, 2000)
        );
      }

      if (state !== "ACTIVE") {
        throw new Error(
          "Gemini video processing timeout."
        );
      }

      /* ---------- Prompt ---------- */

      const prompt = `
You are SUN SPY RECAP AI.

Watch and understand the uploaded video.

Create a short-form video recap.

Language: ${language}
Target duration: ${duration} seconds
Style: ${style}

Requirements:

1. Understand the actual story.
2. Identify important events.
3. Identify main characters.
4. Create a strong hook.
5. Write natural narration.
6. Create an ending / CTA.
7. Suggest hashtags.
8. Do not invent unsupported information.
9. Return ONLY valid JSON.

JSON:

{
  "title": "",
  "hook": "",
  "summary": "",
  "characters": [
    {
      "name": "",
      "role": ""
    }
  ],
  "keyEvents": [],
  "bestScenes": [
    {
      "description": "",
      "reason": ""
    }
  ],
  "recapScript": "",
  "ending": "",
  "hashtags": []
}

Additional instructions:

${instructions}
`;

      /* ---------- Gemini ---------- */

      const generateResponse =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            GEMINI_MODEL
          )}:generateContent?key=${encodeURIComponent(
            GEMINI_API_KEY
          )}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              contents: [
                {
                  role: "user",

                  parts: [
                    {
                      file_data: {
                        mime_type:
                          req.file.mimetype ||
                          "video/mp4",

                        file_uri:
                          fileUri
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
                responseMimeType:
                  "application/json"
              }
            })
          }
        );

      if (!generateResponse.ok) {
        const text =
          await generateResponse.text();

        throw new Error(
          `Gemini generation failed: ${text}`
        );
      }

      const result =
        await generateResponse.json();

      const text =
        result
          ?.candidates?.[0]
          ?.content?.parts
          ?.map(
            part =>
              part.text || ""
          )
          .join("") || "";

      let recap;

      try {
        recap =
          JSON.parse(text);
      } catch {
        recap = {
          title:
            "SUN SPY AI Recap",

          hook: "",

          summary: text,

          characters: [],

          keyEvents: [],

          bestScenes: [],

          recapScript: text,

          ending: "",

          hashtags: [
            "#SUNSPY",
            "#Recap"
          ]
        };
      }

      res.json({
        ok: true,
        success: true,

        recap,

        title: recap.title,
        hook: recap.hook,
        summary: recap.summary,
        characters:
          recap.characters,
        keyEvents:
          recap.keyEvents,
        bestScenes:
          recap.bestScenes,
        recapScript:
          recap.recapScript,
        ending:
          recap.ending,
        hashtags:
          recap.hashtags
      });

    } catch (error) {

      console.error(
        "RECAP ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Recap generation failed."
      });

    } finally {

      if (inputFile) {
        try {
          fs.unlinkSync(
            inputFile
          );
        } catch {}
      }

    }
  }
);

/* =========================
   PROCESS VIDEO
========================= */

app.post(
  "/api/process-video",
  upload.single("video"),
  async (req, res) => {

    let inputFile =
      req.file?.path;

    let outputFile = null;

    try {

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error:
            "No video file uploaded."
        });
      }

      if (!ffmpegPath) {
        return res.status(500).json({
          ok: false,
          error:
            "FFmpeg is not available."
        });
      }

      const requestedDuration =
        Number(
          req.body.durationSeconds ||
          req.body.duration ||
          0
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

      let duration =
        sourceDuration;

      if (
        Number.isFinite(
          requestedDuration
        ) &&
        requestedDuration > 0
      ) {
        duration =
          Math.min(
            requestedDuration,
            sourceDuration
          );
      }

      const originalName =
        path.parse(
          req.file.originalname
        ).name;

      const safeName =
        cleanFileName(
          originalName
        );

      const filename =
        `${safeName}-sunspy-${Date.now()}.mp4`;

      outputFile =
        path.join(
          outputsDir,
          filename
        );

      const filter =
        getVideoFilter(
          aspectRatio,
          resolution
        );

      const args = [
        "-y",

        "-i",
        inputFile,

        "-t",
        String(duration),

        "-vf",
        filter,

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

      console.log(
        "Starting FFmpeg..."
      );

      await runCommand(
        ffmpegPath,
        args
      );

      /* ---------- VERIFY OUTPUT ---------- */

      if (
        !fs.existsSync(
          outputFile
        )
      ) {
        throw new Error(
          "FFmpeg completed but output file was not created."
        );
      }

      const stats =
        fs.statSync(
          outputFile
        );

      if (stats.size <= 0) {
        throw new Error(
          "Output video is empty."
        );
      }

      /* ---------- IMPORTANT ---------- */

      const relativeUrl =
        `/outputs/${encodeURIComponent(
          filename
        )}`;

      const absoluteUrl =
        getOutputUrl(
          req,
          filename
        );

      console.log(
        "OUTPUT:",
        absoluteUrl
      );

      /*
        Return ALL common URL names.
        This fixes older frontend versions
        that expect different property names.
      */

      return res.status(200).json({

        ok: true,

        success: true,

        completed: true,

        message:
          "Video processing completed.",

        filename:

          filename,

        file:

          relativeUrl,

        path:

          relativeUrl,

        output:

          relativeUrl,

        url:

          absoluteUrl,

        videoUrl:

          absoluteUrl,

        outputUrl:

          absoluteUrl,

        fileUrl:

          absoluteUrl,

        videoURL:

          absoluteUrl,

        downloadUrl:

          absoluteUrl,

        duration:

          duration,

        sourceDuration:

          sourceDuration,

        size:

          stats.size

      });

    } catch (error) {

      console.error(
        "PROCESS VIDEO ERROR:",
        error
      );

      if (outputFile) {
        try {
          fs.unlinkSync(
            outputFile
          );
        } catch {}
      }

      return res.status(500).json({

        ok: false,

        success: false,

        completed: false,

        error:
          error.message ||
          "Video processing failed."

      });

    } finally {

      if (inputFile) {
        try {
          fs.unlinkSync(
            inputFile
          );
        } catch {}
      }

    }
  }
);

/* =========================
   ERROR HANDLER
========================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
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

/* =========================
   START
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `SUN SPY RECAP V2 running on port ${PORT}`
    );

    console.log(
      `FFmpeg: ${
        ffmpegPath || "NOT FOUND"
      }`
    );

    console.log(
      `Gemini Model: ${GEMINI_MODEL}`
    );

  }
);
