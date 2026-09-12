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
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

const ROOT_DIR = __dirname;

const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const OUTPUT_DIR = path.join(ROOT_DIR, "outputs");
const TEMP_DIR = path.join(ROOT_DIR, "temp");

[UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

/* =====================================================
   EXPRESS
===================================================== */

app.use(cors());

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

/* =====================================================
   STATIC FILES
===================================================== */

app.use(
  "/uploads",
  express.static(UPLOAD_DIR)
);

app.use(
  "/outputs",
  express.static(OUTPUT_DIR, {
    maxAge: "1h",
    etag: true,
    acceptRanges: true
  })
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

  Object.assign(
    job,
    data
  );

  job.updatedAt =
    Date.now();

  jobs.set(
    id,
    job
  );
}

/* =====================================================
   HELPERS
===================================================== */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function boolValue(
  value,
  fallback = false
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  return [
    "true",
    "1",
    "yes",
    "on",
    "enabled"
  ].includes(
    String(
      value
    ).toLowerCase()
  );
}

function firstValue(
  object,
  keys,
  fallback
) {
  for (
    const key of keys
  ) {
    if (
      object[key] !==
        undefined &&
      object[key] !==
        null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

function parseJsonMaybe(
  value,
  fallback = null
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return fallback;
  }
}

function getPublicBaseUrl(
  req
) {
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
        spawn(
          command,
          args,
          {
            ...options,

            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );

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
          if (
            code === 0
          ) {
            resolve({
              stdout,
              stderr
            });

            return;
          }

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

          reject(
            error
          );
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

  return (
    Number(
      match[1]
    ) *
      3600 +
    Number(
      match[2]
    ) *
      60 +
    Number(
      match[3]
    )
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
        "crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16)",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
      ].join(",");

    case "1:1":
      return [
        "crop=min(iw\\,ih):min(iw\\,ih)",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
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
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
      ].join(",");
  }
}

/* =====================================================
   GEMINI ERROR
===================================================== */

function getGeminiStatus(
  error
) {
  if (!error) {
    return null;
  }

  if (
    error.status
  ) {
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
    ? Number(
        match[1]
      )
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
    getGeminiStatus(
      error
    )
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
      JSON.parse(
        text
      );
  } catch {
    data =
      text;
  }

  if (
    !response.ok
  ) {
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
  if (
    !GEMINI_API_KEY
  ) {
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
        method:
          "POST",

        headers: {
          "Content-Type":
            mimeType ||
            "video/mp4",

          "X-Goog-Upload-Protocol":
            "raw",

          "X-Goog-Upload-Command":
            "start, upload, finalize"
        },

        body:
          fileBuffer
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );
  } catch {
    data = null;
  }

  if (
    !response.ok
  ) {
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
   WAIT GEMINI FILE
===================================================== */

async function waitForGeminiFile(
  fileName,
  jobId
) {
  for (
    let attempt = 1;
    attempt <= 90;
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
          progress:
            35,

          step:
            "Analyzing",

          message:
            "Gemini is analyzing the actual video..."
        }
      );

      return (
        data.file ||
        data
      );
    }

    if (
      state ===
        "FAILED" ||
      state ===
        "ERROR"
    ) {
      throw new Error(
        `Gemini file processing failed: ${JSON.stringify(
          data
        )}`
      );
    }

    updateJob(
      jobId,
      {
        progress:
          Math.min(
            34,
            10 +
              Math.floor(
                attempt /
                  3
              )
          ),

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
   GEMINI TEXT
===================================================== */

function extractGeminiText(
  data
) {
  const text =
    data?.candidates?.[0]
      ?.content?.parts
      ?.map(
        (part) =>
          part.text ||
          ""
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
    firstBrace !==
      -1 &&
    lastBrace >
      firstBrace
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
  try {
    return JSON.parse(
      cleanJsonText(
        text
      )
    );
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }
}

/* =====================================================
   GEMINI PROMPT
===================================================== */

function buildRecapPrompt({
  language,
  durationSeconds,
  style,
  instructions,
  sceneAnalysisEnabled,
  bestScenesEnabled,
  recapEnabled
}) {
  const targetLanguage =
    language ===
    "English"
      ? "English"
      : "Burmese";

  return `
You are SUN SPY RECAP AI.

Watch and understand the ACTUAL uploaded video.

Never invent events.
Never invent characters.
Never invent timestamps.

Target language:
${targetLanguage}

Target recap duration:
${durationSeconds} seconds

Style:
${style || "Cinematic Story"}

Additional instructions:
${instructions || "None"}

SCENE ANALYSIS:
${
  sceneAnalysisEnabled
    ? `
ON

Analyze the complete video timeline.

Identify meaningful scenes.

Every scene MUST contain:
- start
- end
- description
- score
- narration

start and end are seconds from the beginning
of the actual uploaded video.
`
    : `
OFF

Return scenes as an empty array.
`
}

BEST SCENE SELECTION:
${
  bestScenesEnabled
    ? `
ON

Select the most important scenes for the recap.

Return them inside bestScenes.

bestScenes MUST use timestamps from scenes.
`
    : `
OFF

Return bestScenes as an empty array.
`
}

AI RECAP:
${
  recapEnabled
    ? `
ON

Write a natural recap narration.
`
    : `
OFF

Return recapScript as an empty string.
`
}

Return ONLY valid JSON.

Use exactly:

{
  "title": "Short attractive title",

  "hook": "Strong opening hook",

  "summary": "Factual short summary",

  "characters": [
    {
      "name": "Character name",
      "role": "Character role"
    }
  ],

  "scenes": [
    {
      "order": 1,
      "start": 0,
      "end": 5,
      "score": 90,
      "description": "Actual event",
      "narration": "Narration"
    }
  ],

  "bestScenes": [
    {
      "order": 1,
      "start": 0,
      "end": 5,
      "score": 95,
      "reason": "Why this scene is important"
    }
  ],

  "recapScript": "Complete narration",

  "ending": "Ending or CTA",

  "hashtags": [
    "#hashtag1",
    "#hashtag2",
    "#hashtag3"
  ]
}

IMPORTANT:

- timestamps must be based on the actual uploaded video
- start < end
- bestScenes must be a subset of scenes
- do not create fake scenes
- do not describe events that do not happen
`;
}

/* =====================================================
   GENERATE RECAP
===================================================== */

async function generateGeminiRecap({
  fileUri,
  mimeType,
  language,
  durationSeconds,
  style,
  instructions,
  jobId,
  sceneAnalysisEnabled,
  bestScenesEnabled,
  recapEnabled
}) {
  const models = [
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL
  ].filter(
    (model, index, array) =>
      model &&
      array.indexOf(
        model
      ) === index
  );

  const prompt =
    buildRecapPrompt({
      language,
      durationSeconds,
      style,
      instructions,
      sceneAnalysisEnabled,
      bestScenesEnabled,
      recapEnabled
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
            progress:
              45,

            step:
              "Recap",

            message:
              "Gemini is analyzing scenes and generating the recap..."
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
                JSON.stringify(
                  {
                    contents:
                      [
                        {
                          role:
                            "user",

                          parts:
                            [
                              {
                                text:
                                  prompt
                              },

                              {
                                file_data:
                                  {
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

                    generationConfig:
                      {
                        temperature:
                          0.55,

                        responseMimeType:
                          "application/json"
                      }
                  }
                )
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
            progress:
              60,

            step:
              "Recap",

            message:
              "Gemini scene analysis completed."
          }
        );

        return {
          recap,
          model,
          attempts:
            attempt
        };
      } catch (
        error
      ) {
        lastError =
          error;

        console.error(
          "Gemini error:",
          error.message
        );

        if (
          !isRetryableGeminiError(
            error
          )
        ) {
          break;
        }

        if (
          attempt <
          3
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
  const localFile =
    options.filePath;

  try {
    updateJob(
      job.id,
      {
        status:
          "processing",

        progress:
          5,

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

    updateJob(
      job.id,
      {
        progress:
          20,

        step:
          "Processing",

        message:
          "Gemini received the video."
      }
    );

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
            job.id,

          sceneAnalysisEnabled:
            options.sceneAnalysisEnabled,

          bestScenesEnabled:
            options.bestScenesEnabled,

          recapEnabled:
            options.recapEnabled
        }
      );

    updateJob(
      job.id,
      {
        status:
          "complete",

        progress:
          100,

        step:
          "Complete",

        message:
          "AI scene analysis and recap completed.",

        recap:
          result.recap,

        model:
          result.model,

        attempts:
          result.attempts,

        sceneAnalysisEnabled:
          options.sceneAnalysisEnabled,

        bestScenesEnabled:
          options.bestScenesEnabled,

        recapEnabled:
          options.recapEnabled
      }
    );
  } catch (
    error
  ) {
    console.error(
      "BACKGROUND RECAP ERROR:",
      error
    );

    updateJob(
      job.id,
      {
        status:
          "failed",

        progress:
          100,

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
   SCENE NORMALIZATION
===================================================== */

function normalizeScene(
  scene,
  index
) {
  const start =
    Number(
      firstValue(
        scene,
        [
          "start",
          "startTime",
          "start_seconds",
          "startSeconds"
        ],
        0
      )
    );

  const end =
    Number(
      firstValue(
        scene,
        [
          "end",
          "endTime",
          "end_seconds",
          "endSeconds"
        ],
        start +
          3
      )
    );

  return {
    order:
      Number(
        scene.order ||
          index +
            1
      ),

    start:
      Math.max(
        0,
        start
      ),

    end:
      Math.max(
        start +
          0.25,
        end
      ),

    score:
      Number(
        scene.score ||
          scene.importance ||
          0
      ),

    description:
      String(
        scene.description ||
          scene.event ||
          ""
      ),

    narration:
      String(
        scene.narration ||
          ""
      )
  };
}

/* =====================================================
   BEST SCENE SELECTOR
===================================================== */

function selectBestScenes(
  scenes,
  targetDuration,
  sourceDuration
) {
  const normalized =
    (
      Array.isArray(
        scenes
      )
        ? scenes
        : []
    )
      .map(
        normalizeScene
      )
      .filter(
        (scene) =>
          scene.end >
            scene.start &&
          scene.start <
            sourceDuration
      )
      .map(
        (scene) => ({
          ...scene,

          end:
            Math.min(
              scene.end,
              sourceDuration
            )
        })
      )
      .sort(
        (a, b) =>
          b.score -
            a.score ||
          a.start -
            b.start
      );

  if (
    !normalized.length
  ) {
    return [];
  }

  const selected =
    [];

  let total =
    0;

  for (
    const scene of
      normalized
  ) {
    if (
      total >=
      targetDuration
    ) {
      break;
    }

    const sceneDuration =
      scene.end -
      scene.start;

    if (
      sceneDuration <=
      0
    ) {
      continue;
    }

    const remaining =
      targetDuration -
      total;

    if (
      sceneDuration <=
      remaining +
        0.5
    ) {
      selected.push(
        scene
      );

      total +=
        sceneDuration;
    } else if (
      remaining >=
      0.8
    ) {
      selected.push({
        ...scene,

        end:
          scene.start +
          remaining
      });

      total +=
        remaining;

      break;
    }
  }

  if (
    !selected.length
  ) {
    selected.push(
      normalized[0]
    );
  }

  return selected.sort(
    (a, b) =>
      a.start -
      b.start
  );
}

/* =====================================================
   STANDARD RENDER
===================================================== */

function buildTrimArgs(
  inputFile,
  outputFile,
  duration,
  aspectRatio,
  resolution
) {
  const height =
    resolution ===
    "720p"
      ? 720
      : 1080;

  const filter =
    `${getVideoFilter(
      aspectRatio
    )},scale=-2:${height}`;

  return [
    "-y",

    "-hide_banner",

    "-i",
    inputFile,

    "-t",
    String(
      duration
    ),

    "-map",
    "0:v:0",

    "-map",
    "0:a:0?",

    "-vf",
    filter,

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
}

/* =====================================================
   REAL BEST-SCENE RENDER
===================================================== */

async function renderBestScenes({
  inputFile,
  outputFile,
  scenes,
  aspectRatio,
  resolution,
  targetDuration
}) {
  if (
    !scenes.length
  ) {
    throw new Error(
      "No usable best scenes were returned by Gemini."
    );
  }

  const clipFiles =
    [];

  let concatFile =
    null;

  try {
    for (
      let i = 0;
      i <
      scenes.length;
      i++
    ) {
      const scene =
        scenes[i];

      const clipFile =
        path.join(
          TEMP_DIR,
          `${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${i}.mp4`
        );

      const duration =
        Math.max(
          0.25,
          scene.end -
            scene.start
        );

      await runCommand(
        ffmpegPath,
        [
          "-y",

          "-hide_banner",

          "-ss",
          String(
            scene.start
          ),

          "-i",
          inputFile,

          "-t",
          String(
            duration
          ),

          "-map",
          "0:v:0",

          "-map",
          "0:a:0?",

          "-c",
          "copy",

          "-avoid_negative_ts",
          "make_zero",

          clipFile
        ]
      );

      if (
        fs.existsSync(
          clipFile
        ) &&
        fs.statSync(
          clipFile
        ).size >
          0
      ) {
        clipFiles.push(
          clipFile
        );
      }
    }

    if (
      !clipFiles.length
    ) {
      throw new Error(
        "FFmpeg could not create selected scene clips."
      );
    }

    concatFile =
      path.join(
        TEMP_DIR,
        `${Date.now()}-${crypto.randomBytes(5).toString("hex")}-concat.txt`
      );

    fs.writeFileSync(
      concatFile,
      clipFiles
        .map(
          (file) =>
            `file '${file.replace(
              /'/g,
              "'\\''"
            )}'`
        )
        .join(
          "\n"
        ),
      "utf8"
    );

    const height =
      resolution ===
      "720p"
        ? 720
        : 1080;

    const filter =
      `${getVideoFilter(
        aspectRatio
      )},scale=-2:${height}`;

    await runCommand(
      ffmpegPath,
      [
        "-y",

        "-hide_banner",

        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        concatFile,

        "-t",
        String(
          targetDuration
        ),

        "-map",
        "0:v:0",

        "-map",
        "0:a:0?",

        "-vf",
        filter,

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
      ]
    );
  } finally {
    for (
      const file of
        clipFiles
    ) {
      try {
        fs.unlinkSync(
          file
        );
      } catch {}
    }

    if (
      concatFile &&
      fs.existsSync(
        concatFile
      )
    ) {
      try {
        fs.unlinkSync(
          concatFile
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
        "4.1.0",

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

      outputServing:
        true,

      sceneAnalysis:
        true,

      bestSceneSelection:
        true,

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
        "4.1.0",

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

      outputServing:
        true,

      sceneAnalysis:
        true,

      bestSceneSelection:
        true,

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
  upload.single(
    "video"
  ),

  async (
    req,
    res
  ) => {
    try {
      if (
        !GEMINI_API_KEY
      ) {
        return res
          .status(
            500
          )
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
          .status(
            400
          )
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
            firstValue(
              req.body,

              [
                "durationSeconds",
                "duration",
                "targetDuration"
              ],

              30
            )
          )
        );

      const language =
        firstValue(
          req.body,

          [
            "language",
            "outputLanguage"
          ],

          "Burmese"
        );

      const style =
        firstValue(
          req.body,

          [
            "style",
            "voiceStyle"
          ],

          "Cinematic Story"
        );

      const instructions =
        firstValue(
          req.body,

          [
            "instructions",
            "prompt",
            "customPrompt"
          ],

          ""
        );

      const sceneAnalysisEnabled =
        boolValue(
          firstValue(
            req.body,

            [
              "sceneAnalysis",
              "sceneAnalysisEnabled",
              "geminiSceneAnalysis",
              "geminiAnalysis",
              "enableSceneAnalysis"
            ],

            true
          ),

          true
        );

      const bestScenesEnabled =
        boolValue(
          firstValue(
            req.body,

            [
              "bestScenes",
              "bestScenesEnabled",
              "bestSceneSelection",
              "enableBestScenes"
            ],

            true
          ),

          true
        );

      const recapEnabled =
        boolValue(
          firstValue(
            req.body,

            [
              "recap",
              "recapEnabled",
              "aiRecap",
              "enableRecap"
            ],

            true
          ),

          true
        );

      const job =
        createJob();

      processRecapJob(
        job,

        {
          filePath:
            req.file.path,

          mimeType:
            req.file.mimetype ||
            "video/mp4",

          language,

          style,

          instructions,

          durationSeconds,

          sceneAnalysisEnabled,

          bestScenesEnabled,

          recapEnabled
        }
      );

      return res.json({
        ok: true,

        success:
          true,

        jobId:
          job.id,

        status:
          job.status,

        message:
          "Recap job started.",

        settings: {
          sceneAnalysisEnabled,

          bestScenesEnabled,

          recapEnabled
        }
      });
    } catch (
      error
    ) {
      console.error(
        "CREATE RECAP ERROR:",
        error
      );

      return res
        .status(
          500
        )
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
  (
    req,
    res
  ) => {
    const job =
      jobs.get(
        req.params.id
      );

    if (!job) {
      return res
        .status(
          404
        )
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
  upload.single(
    "video"
  ),

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
          .status(
            400
          )
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
            firstValue(
              req.body,

              [
                "durationSeconds",
                "duration",
                "targetDuration"
              ],

              30
            )
          )
        );

      const aspectRatio =
        firstValue(
          req.body,
          ["aspectRatio"],
          "9:16"
        );

      const resolution =
        firstValue(
          req.body,
          ["resolution"],
          "1080p"
        );

      const sceneAnalysisEnabled =
        boolValue(
          firstValue(
            req.body,

            [
              "sceneAnalysis",
              "sceneAnalysisEnabled",
              "geminiSceneAnalysis",
              "geminiAnalysis",
              "enableSceneAnalysis"
            ],

            false
          ),

          false
        );

      const bestScenesEnabled =
        boolValue(
          firstValue(
            req.body,

            [
              "bestScenes",
              "bestScenesEnabled",
              "bestSceneSelection",
              "enableBestScenes"
            ],

            false
          ),

          false
        );

      const recapData =
        parseJsonMaybe(
          firstValue(
            req.body,

            [
              "recap",
              "recapData",
              "aiRecap",
              "geminiResult"
            ],

            null
          ),

          null
        );

      const sourceDuration =
        await getVideoDuration(
          inputFile
        );

      const finalDuration =
        Math.min(
          requestedDuration,
          sourceDuration
        );

      const id =
        Date.now() +
        "-" +
        crypto
          .randomBytes(
            5
          )
          .toString(
            "hex"
          );

      outputFile =
        path.join(
          OUTPUT_DIR,

          `${id}.mp4`
        );

      let selectedScenes =
        [];

      /*
       * BEST SCENE MODE
       */

      if (
        sceneAnalysisEnabled &&
        bestScenesEnabled &&
        recapData
      ) {
        const rawBest =
          Array.isArray(
            recapData.bestScenes
          )
            ? recapData.bestScenes
            : Array.isArray(
                recapData.scenes
              )
            ? recapData.scenes
            : [];

        selectedScenes =
          selectBestScenes(
            rawBest,

            finalDuration,

            sourceDuration
          );
      }

      /*
       * REAL BEST SCENE RENDER
       */

      if (
        sceneAnalysisEnabled &&
        bestScenesEnabled &&
        selectedScenes.length
      ) {
        await renderBestScenes({
          inputFile,

          outputFile,

          scenes:
            selectedScenes,

          aspectRatio,

          resolution,

          targetDuration:
            finalDuration
        });
      } else {
        /*
         * STANDARD MODE
         */

        await runCommand(
          ffmpegPath,

          buildTrimArgs(
            inputFile,

            outputFile,

            finalDuration,

            aspectRatio,

            resolution
          )
        );
      }

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
        stat.size <=
