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

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL ||
  "gemini-2.5-flash";

const ROOT_DIR = __dirname;

const UPLOAD_DIR =
  path.join(ROOT_DIR, "uploads");

const OUTPUT_DIR =
  path.join(ROOT_DIR, "outputs");

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true
});

fs.mkdirSync(OUTPUT_DIR, {
  recursive: true
});

app.use(cors());

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  "/uploads",
  express.static(UPLOAD_DIR)
);

app.use(
  "/outputs",
  express.static(OUTPUT_DIR)
);


/* =====================================================
   MULTER
===================================================== */

const storage =
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_DIR);
    },

    filename: (_req, file, cb) => {
      const ext =
        path.extname(
          file.originalname || ".mp4"
        );

      const name =
        Date.now() +
        "-" +
        crypto
          .randomBytes(6)
          .toString("hex") +
        ext;

      cb(null, name);
    }
  });

const upload =
  multer({
    storage,

    limits: {
      fileSize:
        500 * 1024 * 1024
    }
  });


/* =====================================================
   JOB STORAGE
===================================================== */

const jobs = new Map();


function createJob() {
  const id =
    Date.now() +
    "-" +
    crypto
      .randomBytes(8)
      .toString("hex");

  const job = {
    id,

    status: "queued",

    progress: 0,

    step: "Queued",

    message:
      "Waiting to start...",

    createdAt:
      Date.now(),

    updatedAt:
      Date.now(),

    recap: null,

    outputUrl: null,

    error: null
  };

  jobs.set(id, job);

  return job;
}


function updateJob(
  id,
  data
) {
  const job =
    jobs.get(id);

  if (!job) return;

  Object.assign(job, data);

  job.updatedAt =
    Date.now();

  jobs.set(id, job);
}


/* =====================================================
   HELPERS
===================================================== */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function getPublicBaseUrl(req) {
  const configured =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (configured) {
    return configured.replace(
      /\/+$/,
      ""
    );
  }

  const protocol =
    req.headers[
      "x-forwarded-proto"
    ] ||
    req.protocol ||
    "http";

  const host =
    req.headers[
      "x-forwarded-host"
    ] ||
    req.get("host");

  return `${protocol}://${host}`;
}


/* =====================================================
   COMMAND RUNNER
===================================================== */

function runCommand(
  command,
  args,
  options = {}
) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(command, args, {
          ...options,

          stdio: [
            "ignore",
            "pipe",
            "pipe"
          ]
        });

      let stdout = "";
      let stderr = "";

      child.stdout.on(
        "data",
        (data) => {
          stdout +=
            data.toString();
        }
      );

      child.stderr.on(
        "data",
        (data) => {
          stderr +=
            data.toString();
        }
      );

      child.on(
        "error",
        reject
      );

      child.on(
        "close",
        (code) => {
          if (code === 0) {
            resolve({
              stdout,
              stderr
            });
          } else {
            const error =
              new Error(
                `Command failed with code ${code}`
              );

            error.code =
              code;

            error.stdout =
              stdout;

            error.stderr =
              stderr;

            reject(error);
          }
        }
      );
    }
  );
}


/* =====================================================
   VIDEO DURATION
===================================================== */

async function getVideoDuration(
  input
) {
  const result =
    await runCommand(
      ffmpegPath,
      [
        "-hide_banner",
        "-i",
        input,
        "-f",
        "null",
        "-"
      ]
    );

  const output =
    `${result.stdout}\n${result.stderr}`;

  const match =
    output.match(
      /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i
    );

  if (!match) {
    throw new Error(
      "Could not determine video duration."
    );
  }

  const hours =
    Number(match[1]);

  const minutes =
    Number(match[2]);

  const seconds =
    Number(match[3]);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}


/* =====================================================
   VIDEO FILTER
===================================================== */

function getVideoFilter(
  aspectRatio
) {
  switch (
    aspectRatio
  ) {
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


/* =====================================================
   GEMINI ERROR
===================================================== */

function getGeminiStatus(
  error
) {
  if (!error)
    return null;

  if (error.status) {
    return Number(
      error.status
    );
  }

  const message =
    String(
      error.message || ""
    );

  const match =
    message.match(
      /\b(400|401|403|404|408|409|429|500|502|503|504)\b/
    );

  return match
    ? Number(match[1])
    : null;
}


function isRetryableGeminiError(
  error
) {
  return [
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(
    getGeminiStatus(error)
  );
}


function extractGeminiError(
  data
) {
  if (!data) {
    return "Unknown Gemini error";
  }

  if (
    typeof data ===
    "string"
  ) {
    return data;
  }

  if (data.error) {
    return (
      data.error.message ||
      JSON.stringify(
        data.error
      )
    );
  }

  return JSON.stringify(
    data
  );
}


/* =====================================================
   GEMINI REQUEST
===================================================== */

async function geminiRequest(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      options
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error =
      new Error(
        extractGeminiError(
          data
        )
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}


/* =====================================================
   GEMINI FILE UPLOAD
===================================================== */

async function uploadGeminiFile(
  filePath,
  mimeType
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const fileBuffer =
    fs.readFileSync(
      filePath
    );

  const uploadUrl =
    "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" +
    encodeURIComponent(
      GEMINI_API_KEY
    );

  const response =
    await fetch(
      uploadUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            mimeType ||
            "video/mp4",

          "X-Goog-Upload-Protocol":
            "raw",

          "X-Goog-Upload-Command":
            "start, upload, finalize"
        },

        body: fileBuffer
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      new Error(
        `Gemini file upload failed: ${extractGeminiError(
          data || text
        )}`
      );

    error.status =
      response.status;

    throw error;
  }

  return (
    data.file ||
    data
  );
}


/* =====================================================
   WAIT FOR GEMINI FILE
===================================================== */

async function waitForGeminiFile(
  fileName,
  jobId
) {
  const maxAttempts =
    90;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=` +
      encodeURIComponent(
        GEMINI_API_KEY
      );

    const data =
      await geminiRequest(
        url
      );

    const state =
      data?.state ||
      data?.file?.state ||
      "ACTIVE";

    if (
      state ===
      "ACTIVE"
    ) {
      updateJob(
        jobId,
        {
          progress: 35,

          step:
            "Analyzing",

          message:
            "Video is ready. Gemini is analyzing the story..."
        }
      );

      return (
        data.file ||
        data
      );
    }

    if (
      state === "FAILED" ||
      state === "ERROR"
    ) {
      throw new Error(
        `Gemini file processing failed: ${JSON.stringify(
          data
        )}`
      );
    }

    const progress =
      Math.min(
        34,
        10 +
          Math.floor(
            attempt /
              3
          )
      );

    updateJob(
      jobId,
      {
        progress,

        step:
          "Processing",

        message:
          "Gemini is processing the uploaded video..."
      }
    );

    await sleep(
      2000
    );
  }

  throw new Error(
    "Gemini file processing timed out."
  );
}


/* =====================================================
   GEMINI JSON
===================================================== */

function extractGeminiText(
  data
) {
  const text =
    data?.candidates?.[0]
      ?.content?.parts
      ?.map(
        (part) =>
          part.text || ""
      )
      .join("") ||
    "";

  return text.trim();
}


function cleanJsonText(
  text
) {
  let cleaned =
    String(
      text || ""
    ).trim();

  if (
    cleaned.startsWith(
      "```"
    )
  ) {
    cleaned =
      cleaned
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();
  }

  const firstBrace =
    cleaned.indexOf(
      "{"
    );

  const lastBrace =
    cleaned.lastIndexOf(
      "}"
    );

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned =
      cleaned.slice(
        firstBrace,
        lastBrace + 1
      );
  }

  return cleaned;
}


function parseGeminiJson(
  text
) {
  const cleaned =
    cleanJsonText(
      text
    );

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }
}


/* =====================================================
   PROMPT
===================================================== */

function buildRecapPrompt({
  language,
  durationSeconds,
  style,
  instructions
}) {
  const targetLanguage =
    language ===
    "English"
      ? "English"
      : "Burmese";

  return `
You are SUN SPY RECAP AI.

Analyze the uploaded video carefully.

Understand the ACTUAL video before writing.

Identify:
- main story
- important events
- main characters
- strongest hook
- key scenes
- ending

Do NOT invent events.

Create a natural short-form recap suitable for TikTok,
YouTube Shorts and Facebook Reels.

Target language:
${targetLanguage}

Target duration:
${durationSeconds} seconds

Style:
${style || "Cinematic Story"}

Additional instructions:
${instructions || "None"}

Return ONLY valid JSON.

Use exactly:

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
      "description": "What happens",
      "narration": "Narration"
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


/* =====================================================
   GENERATE GEMINI RECAP
===================================================== */

async function generateGeminiRecap({
  fileUri,
  mimeType,
  language,
  durationSeconds,
  style,
  instructions,
  jobId
}) {
  const models = [];

  [
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL
  ].forEach(
    (model) => {
      if (
        model &&
        !models.includes(
          model
        )
      ) {
        models.push(
          model
        );
      }
    }
  );

  const prompt =
    buildRecapPrompt({
      language,
      durationSeconds,
      style,
      instructions
    });

  let lastError =
    null;

  for (
    const model of models
  ) {
    for (
      let attempt = 1;
      attempt <= 3;
      attempt++
    ) {
      try {
        updateJob(
          jobId,
          {
            progress: 45,

            step:
              "Recap",

            message:
              `Gemini is generating your recap...`
          }
        );

        console.log(
          `Gemini generation model=${model} attempt=${attempt}/3`
        );

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
          encodeURIComponent(
            GEMINI_API_KEY
          );

        const data =
          await geminiRequest(
            url,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  contents: [
                    {
                      role:
                        "user",

                      parts: [
                        {
                          text:
                            prompt
                        },

                        {
                          file_data: {
                            mime_type:
                              mimeType ||
                              "video/mp4",

                            file_uri:
                              fileUri
                          }
                        }
                      ]
                    }
                  ],

                  generationConfig: {
                    temperature:
                      0.65,

                    responseMimeType:
                      "application/json"
                  }
                })
            }
          );

        const text =
          extractGeminiText(
            data
          );

        if (!text) {
          throw new Error(
            "Gemini returned an empty response."
          );
        }

        const recap =
          parseGeminiJson(
            text
          );

        updateJob(
          jobId,
          {
            progress: 60,

            step:
              "Recap",

            message:
              "AI recap generated successfully."
          }
        );

        return {
          recap,
          model,
          attempts:
            attempt
        };

      } catch (error) {
        lastError =
          error;

        console.error(
          `Gemini error: ${error.message}`
        );

        if (
          !isRetryableGeminiError(
            error
          )
        ) {
          break;
        }

        if (
          attempt < 3
        ) {
          await sleep(
            2000 *
              Math.pow(
                2,
                attempt -
                  1
              )
          );
        }
      }
    }
  }

  const error =
    new Error(
      `Gemini generation failed: ${
        lastError?.message ||
        "Unknown error"
      }`
    );

  error.status =
    getGeminiStatus(
      lastError
    ) || 503;

  error.retryable =
    true;

  throw error;
}


/* =====================================================
   BACKGROUND RECAP JOB
===================================================== */

async function processRecapJob(
  job,
  options
) {
  let localFile =
    options.filePath;

  try {
    updateJob(
      job.id,
      {
        status:
          "processing",

        progress: 5,

        step:
          "Upload",

        message:
          "Uploading video to Gemini..."
      }
    );

    const geminiFile =
      await uploadGeminiFile(
        localFile,
        options.mimeType
      );

    updateJob(
      job.id,
      {
        progress: 20,

        step:
          "Processing",

        message:
          "Gemini received the video."
      }
    );

    const fileName =
      geminiFile?.name;

    const fileUri =
      geminiFile?.uri ||
      geminiFile?.fileUri;

    if (
      !fileName ||
      !fileUri
    ) {
      throw new Error(
        "Gemini did not return a valid file reference."
      );
    }

    const activeFile =
      await waitForGeminiFile(
        fileName,
        job.id
      );

    const activeFileUri =
      activeFile?.uri ||
      fileUri;

    const result =
      await generateGeminiRecap(
        {
          fileUri:
            activeFileUri,

          mimeType:
            options.mimeType,

          language:
            options.language,

          durationSeconds:
            options.durationSeconds,

          style:
            options.style,

          instructions:
            options.instructions,

          jobId:
            job.id
        }
      );

    updateJob(
      job.id,
      {
        status:
          "complete",

        progress: 100,

        step:
          "Complete",

        message:
          "AI recap completed.",

        recap:
          result.recap,

        model:
          result.model,

        attempts:
          result.attempts
      }
    );

  } catch (error) {
    console.error(
      "BACKGROUND RECAP ERROR:",
      error
    );

    updateJob(
      job.id,
      {
        status:
          "failed",

        progress: 100,

        step:
          "Failed",

        message:
          error.message ||
          "Recap generation failed.",

        error:
          error.message ||
          "Unknown error",

        retryable:
          error.retryable ===
          true
      }
    );

  } finally {
    if (
      localFile &&
      fs.existsSync(
        localFile
      )
    ) {
      try {
        fs.unlinkSync(
          localFile
        );
      } catch {}
    }
  }
}


/* =====================================================
   HOME
===================================================== */

app.get(
  "/",
  (_req, res) => {
    res.json({
      ok: true,

      service:
        "SUN SPY RECAP V2",

      version:
        "4.0.0",

      message:
        "Backend is online.",

      ffmpeg:
        Boolean(
          ffmpegPath
        ),

      geminiConfigured:
        Boolean(
          GEMINI_API_KEY
        ),

      model:
        GEMINI_MODEL,

      fallbackModel:
        GEMINI_FALLBACK_MODEL,

      jobs:
        jobs.size
    });
  }
);


/* =====================================================
   HEALTH
===================================================== */

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      ok: true,

      service:
        "SUN SPY RECAP V2",

      version:
        "4.0.0",

      message:
        "Backend is online.",

      ffmpeg:
        Boolean(
          ffmpegPath
        ),

      geminiConfigured:
        Boolean(
          GEMINI_API_KEY
        ),

      model:
        GEMINI_MODEL,

      fallbackModel:
        GEMINI_FALLBACK_MODEL,

      jobs:
        jobs.size
    });
  }
);


/* =====================================================
   CREATE RECAP JOB
===================================================== */

app.post(
  "/api/recap",
  upload.single("video"),

  async (
    req,
    res
  ) => {
    try {
      if (
        !GEMINI_API_KEY
      ) {
        return res
          .status(500)
          .json({
            ok: false,

            error:
              "GEMINI_API_KEY is not configured on the server."
          });
      }

      if (
        !req.file
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "No video file uploaded."
          });
      }

      const durationSeconds =
        Math.max(
          5,

          Number(
            req.body
              .durationSeconds ||
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

      const job =
        createJob();

      updateJob(
        job.id,
        {
          message:
            "Job created."
        }
      );

      const filePath =
        req.file.path;

      processRecapJob(
        job,
        {
          filePath,

          mimeType,

          language,

          style,

          instructions,

          durationSeconds
        }
      );

      return res.json({
        ok: true,

        success: true,

        jobId:
          job.id,

        status:
          job.status,

        message:
          "Recap job started."
      });

    } catch (error) {
      console.error(
        "CREATE RECAP ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Could not create recap job."
        });
    }
  }
);


/* =====================================================
   JOB STATUS
===================================================== */

app.get(
  "/api/jobs/:id",
  (req, res) => {
    const job =
      jobs.get(
        req.params.id
      );

    if (!job) {
      return res
        .status(404)
        .json({
          ok: false,

          error:
            "Job not found."
        });
    }

    res.json({
      ok: true,

      job
    });
  }
);


/* =====================================================
   PROCESS VIDEO
===================================================== */

app.post(
  "/api/process-video",
  upload.single("video"),

  async (
    req,
    res
  ) => {
    let inputFile =
      null;

    let outputFile =
      null;

    try {
      if (
        !req.file
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "No video file uploaded."
          });
      }

      inputFile =
        req.file.path;

      const requestedDuration =
        Math.max(
          1,

          Number(
            req.body
              .durationSeconds ||
              req.body.duration ||
              30
          )
        );

      const aspectRatio =
        req.body
          .aspectRatio ||
        "9:16";

      const resolution =
        req.body
          .resolution ||
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

      const height =
        resolution ===
        "720p"
          ? 720
          : 1080;

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

      outputFile =
        path.join(
          OUTPUT_DIR,
          `${id}.mp4`
        );

      const scaleFilter =
        `${filter},scale=-2:${height}`;

      const args = [
        "-y",

        "-hide_banner",

        "-i",
        inputFile,

        "-t",
        String(
          finalDuration
        ),

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
        !fs.existsSync(
          outputFile
        )
      ) {
        throw new Error(
          "FFmpeg output was not created."
        );
      }

      const stat =
        fs.statSync(
          outputFile
        );

      if (
        stat.size <= 0
      ) {
        throw new Error(
          "FFmpeg created an empty file."
        );
      }

      const baseUrl =
        getPublicBaseUrl(
          req
        );

      const outputUrl =
        `${baseUrl}/outputs/${encodeURIComponent(
          path.basename(
            outputFile
          )
        )}`;

      return res.json({
        ok: true,

        success: true,

        outputUrl,

        videoUrl:
          outputUrl,

        url:
          outputUrl,

        file:
          outputUrl,

        duration:
          finalDuration,

        durationSeconds:
          finalDuration,

        aspectRatio,

        resolution
      });

    } catch (error) {
      console.error(
        "PROCESS VIDEO ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          success: false,

          error:
            error.message ||
            "Video processing failed.",

          details:
            error.stderr
              ? error.stderr.slice(
                  -5000
                )
              : undefined
        });

    } finally {
      if (
        inputFile &&
        fs.existsSync(
          inputFile
        )
      ) {
        try {
          fs.unlinkSync(
            inputFile
          );
        } catch {}
      }
    }
  }
);


/* =====================================================
   CLEAN OLD JOBS
===================================================== */

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [
        id,
        job
      ] of jobs
    ) {
      if (
        now -
          job.updatedAt >
        60 * 60 * 1000
      ) {
        jobs.delete(
          id
        );
      }
    }
  },

  10 * 60 * 1000
);


/* =====================================================
   GLOBAL ERROR
===================================================== */

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(
      "GLOBAL ERROR:",
      error
    );

    res
      .status(500)
      .json({
        ok: false,

        error:
          error.message ||
          "Internal server error."
      });
  }
);


/* =====================================================
   START
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "SUN SPY RECAP V2"
    );

    console.log(
      "Backend version: 4.0.0"
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Gemini:",
      GEMINI_API_KEY
        ? "CONFIGURED"
        : "NOT CONFIGURED"
    );

    console.log(
      "Primary model:",
      GEMINI_MODEL
    );

    console.log(
      "Fallback model:",
      GEMINI_FALLBACK_MODEL
    );

    console.log(
      "FFmpeg:",
      ffmpegPath
        ? "AVAILABLE"
        : "NOT AVAILABLE"
    );

    console.log(
      "========================================"
    );
  }
);
