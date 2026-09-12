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

const app = express();
const PORT = process.env.PORT || 10000;

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/outputs", express.static(outputsDir));

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
          code,
          stdout,
          stderr
        });
      } else {
        const error = new Error(`FFmpeg exited with code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

/*
  FIX:
  Previous version ran:
    ffmpeg -i input

  That command has no output file, so FFmpeg correctly returned code 1.

  Now we use:
    ffmpeg -i input -f null -

  This gives FFmpeg a valid output target.
*/
async function getVideoDuration(filePath) {
  const result = await runCommand(ffmpegPath, [
    "-hide_banner",
    "-i",
    filePath,
    "-f",
    "null",
    "-"
  ]);

  const text = `${result.stderr}\n${result.stdout}`;

  const match = text.match(
    /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i
  );

  if (!match) {
    throw new Error("Could not detect video duration.");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

function even(value) {
  const n = Math.floor(Number(value));
  return n % 2 === 0 ? n : n - 1;
}

function getVideoFilter(aspectRatio, resolution) {
  const height = resolution === "720p" ? 720 : 1080;

  if (aspectRatio === "9:16") {
    const width = even(height * 9 / 16);

    return [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`
    ].join(",");
  }

  if (aspectRatio === "16:9") {
    const width = even(height * 16 / 9);

    return [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`
    ].join(",");
  }

  if (aspectRatio === "1:1") {
    const size = even(height);

    return [
      `scale=${size}:${size}:force_original_aspect_ratio=increase`,
      `crop=${size}:${size}`
    ].join(",");
  }

  if (aspectRatio === "4:5") {
    const width = even(height * 4 / 5);

    return [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`
    ].join(",");
  }

  return null;
}

function safeFilename(name) {
  return String(name || "video")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

/* HOME */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.3.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash"
  });
});

/* HEALTH */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "SUN SPY RECAP V2",
    version: "3.3.0",
    message: "Backend is online.",
    ffmpeg: Boolean(ffmpegPath),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash"
  });
});

/* GEMINI RECAP */
app.post("/api/recap", upload.single("video"), async (req, res) => {
  let uploadedFile = null;

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Video file is required."
      });
    }

    uploadedFile = req.file.path;

    const duration =
      Number(req.body.durationSeconds || req.body.duration || 30);

    const language = req.body.language || "Burmese";
    const style = req.body.style || "Cinematic Story";
    const instructions = req.body.instructions || "";

    const model =
      process.env.GEMINI_MODEL || "gemini-3.6-flash";

    const fileBuffer = fs.readFileSync(uploadedFile);

    const mimeType =
      req.file.mimetype || "video/mp4";

    /*
      Upload video to Gemini Files API
    */
    const uploadResponse = await fetch(
      "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
          "X-Goog-Upload-Protocol": "raw",
          "X-Goog-Upload-Command": "upload, finalize"
        },
        body: fileBuffer
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();

      throw new Error(
        `Gemini file upload failed: ${errorText}`
      );
    }

    const uploadData = await uploadResponse.json();

    const fileName =
      uploadData?.file?.name ||
      uploadData?.name;

    if (!fileName) {
      throw new Error(
        "Gemini did not return a file name."
      );
    }

    /*
      Wait for Gemini video processing
    */
    let fileInfo = null;

    for (let i = 0; i < 120; i++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(
          process.env.GEMINI_API_KEY
        )}`
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Gemini file status failed: ${errorText}`
        );
      }

      fileInfo = await response.json();

      const state =
        fileInfo?.state ||
        fileInfo?.file?.state;

      if (state === "ACTIVE") {
        break;
      }

      if (
        state === "FAILED" ||
        state === "ERROR"
      ) {
        throw new Error(
          "Gemini video processing failed."
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );
    }

    /*
      Ask Gemini to understand the actual video
    */
    const prompt = `
You are SUN SPY RECAP AI.

Analyze the uploaded video carefully.

Understand:
- the story
- important scenes
- characters
- major events
- emotional moments
- beginning, middle and ending
- the most important scenes
- what should be included in a short recap

Create a ${duration}-second ${language} recap.

Style:
${style}

Additional user instructions:
${instructions || "None"}

Return ONLY valid JSON.

JSON format:
{
  "title": "",
  "hook": "",
  "summary": "",
  "characters": [],
  "keyEvents": [],
  "bestScenes": [],
  "recapScript": "",
  "ending": "",
  "hashtags": []
}

Make the recap natural and human.
Do not invent events that are not present in the video.
`;

    const generateResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(
        process.env.GEMINI_API_KEY
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  file_data: {
                    mime_type:
                      fileInfo?.mimeType ||
                      mimeType,
                    file_uri:
                      fileInfo?.uri ||
                      fileInfo?.file?.uri
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!generateResponse.ok) {
      const errorText =
        await generateResponse.text();

      throw new Error(
        `Gemini generation failed: ${errorText}`
      );
    }

    const data =
      await generateResponse.json();

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "Gemini returned an empty recap."
      );
    }

    let recap;

    try {
      recap = JSON.parse(text);
    } catch {
      const cleaned = text
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/i, "")
        .trim();

      recap = JSON.parse(cleaned);
    }

    res.json({
      ok: true,
      success: true,
      model,
      duration,
      language,
      style,
      recap
    });

  } catch (error) {
    console.error(
      "GEMINI RECAP ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
      details: error?.response || null
    });

  } finally {
    if (
      uploadedFile &&
      fs.existsSync(uploadedFile)
    ) {
      try {
        fs.unlinkSync(uploadedFile);
      } catch {}
    }
  }
});

/* PROCESS VIDEO */
app.post(
  "/api/process-video",
  upload.single("video"),
  async (req, res) => {
    let inputFile = null;

    try {
      if (!ffmpegPath) {
        return res.status(500).json({
          ok: false,
          error: "FFmpeg binary is not available."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Video file is required."
        });
      }

      inputFile = req.file.path;

      const requestedDuration = Number(
        req.body.durationSeconds ||
        req.body.duration ||
        30
      );

      const aspectRatio =
        req.body.aspectRatio || "9:16";

      const resolution =
        req.body.resolution || "1080p";

      /*
        Get real source duration.
        This is the FIXED function.
      */
      const sourceDuration =
        await getVideoDuration(inputFile);

      const outputDuration = Math.min(
        Math.max(requestedDuration, 1),
        sourceDuration
      );

      const filter = getVideoFilter(
        aspectRatio,
        resolution
      );

      const baseName =
        safeFilename(req.file.originalname);

      const outputFilename =
        `${baseName}-sunspy-${Date.now()}.mp4`;

      const outputFile =
        path.join(outputsDir, outputFilename);

      const args = [
        "-y",
        "-hide_banner",
        "-i",
        inputFile,

        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",

        "-t",
        String(outputDuration)
      ];

      if (filter) {
        args.push(
          "-vf",
          filter
        );
      }

      args.push(
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

        "-ar",
        "44100",

        "-movflags",
        "+faststart",

        "-sn",
        "-dn",

        outputFile
      );

      console.log(
        "FFmpeg command:",
        ffmpegPath,
        args.join(" ")
      );

      await runCommand(
        ffmpegPath,
        args
      );

      if (
        !fs.existsSync(outputFile)
      ) {
        throw new Error(
          "FFmpeg finished but output file was not created."
        );
      }

      const stats =
        fs.statSync(outputFile);

      if (stats.size <= 0) {
        throw new Error(
          "FFmpeg created an empty output file."
        );
      }

      const publicUrl =
        `${req.protocol}://${req.get(
          "host"
        )}/outputs/${encodeURIComponent(
          outputFilename
        )}`;

      res.json({
        ok: true,
        success: true,
        completed: true,

        message:
          "Video processed successfully.",

        filename:
          outputFilename,

        file:
          publicUrl,

        path:
          publicUrl,

        output:
          publicUrl,

        url:
          publicUrl,

        videoUrl:
          publicUrl,

        outputUrl:
          publicUrl,

        fileUrl:
          publicUrl,

        videoURL:
          publicUrl,

        downloadUrl:
          publicUrl,

        duration:
          outputDuration,

        sourceDuration,

        aspectRatio,

        resolution,

        size:
          stats.size
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
          error.message,

        details:
          error.stderr
            ? error.stderr.slice(-6000)
            : null
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

/* GLOBAL ERROR */
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

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SUN SPY RECAP V2 running on port ${PORT}`
    );

    console.log(
      "FFmpeg:",
      ffmpegPath
    );

    console.log(
      "Gemini model:",
      process.env.GEMINI_MODEL ||
        "gemini-3.6-flash"
    );
  }
);
