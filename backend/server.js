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

const PORT = Number(process.env.PORT || 8787);

const API_KEY = process.env.GEMINI_API_KEY;

const MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.6-flash";

const MAX_MB =
  Number(process.env.MAX_UPLOAD_MB || 200);

const uploadDir =
  path.join(__dirname, "uploads");

const outputDir =
  path.join(__dirname, "outputs");

fs.mkdirSync(uploadDir, {
  recursive: true
});

fs.mkdirSync(outputDir, {
  recursive: true
});

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  "/outputs",
  express.static(outputDir)
);


/*
==================================================
MULTER
==================================================
*/

const upload = multer({

  dest: uploadDir,

  limits: {
    fileSize:
      MAX_MB * 1024 * 1024
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

    if (
      allowed.includes(
        file.mimetype
      )
    ) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "Unsupported video format."
        )
      );

    }

  }

});


/*
==================================================
ROOT
==================================================
*/

app.get("/", (_req, res) => {

  res.json({

    ok: true,

    service:
      "SUN SPY RECAP V2",

    version:
      "3.1.0",

    message:
      "Backend is online.",

    ffmpeg:
      Boolean(ffmpegPath)

  });

});


/*
==================================================
HEALTH
==================================================
*/

app.get(
  "/api/health",
  (_req, res) => {

    res.json({

      ok: true,

      service:
        "SUN SPY RECAP V2",

      version:
        "3.1.0",

      geminiConfigured:
        Boolean(API_KEY),

      model:
        MODEL,

      ffmpegConfigured:
        Boolean(ffmpegPath)

    });

  }
);


/*
==================================================
SLEEP
==================================================
*/

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/*
==================================================
GEMINI VIDEO UPLOAD
==================================================
*/

async function uploadToGemini(
  filePath,
  mimeType,
  displayName
) {

  if (!API_KEY) {

    throw new Error(
      "GEMINI_API_KEY is not configured."
    );

  }

  const stat =
    await fs.promises.stat(
      filePath
    );


  const startResponse =
    await fetch(

      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(API_KEY)}`,

      {

        method: "POST",

        headers: {

          "x-goog-upload-protocol":
            "resumable",

          "x-goog-upload-command":
            "start",

          "x-goog-upload-header-content-length":
            String(stat.size),

          "x-goog-upload-header-content-type":
            mimeType,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            file: {

              display_name:
                displayName

            }

          })

      }

    );


  if (
    !startResponse.ok
  ) {

    const errorText =
      await startResponse.text();

    throw new Error(
      `Gemini upload initialization failed: ${errorText}`
    );

  }


  const uploadUrl =
    startResponse.headers.get(
      "x-goog-upload-url"
    ) ||
    startResponse.headers.get(
      "X-Goog-Upload-URL"
    );


  if (!uploadUrl) {

    throw new Error(
      "Gemini upload URL was not returned."
    );

  }


  const stream =
    fs.createReadStream(
      filePath
    );


  const uploadResponse =
    await fetch(

      uploadUrl,

      {

        method: "POST",

        headers: {

          "Content-Length":
            String(stat.size),

          "X-Goog-Upload-Offset":
            "0",

          "X-Goog-Upload-Command":
            "upload, finalize"

        },

        body:
          stream,

        duplex:
          "half"

      }

    );


  const uploaded =
    await uploadResponse.json();


  if (
    !uploadResponse.ok ||
    !uploaded?.file?.name
  ) {

    throw new Error(

      uploaded?.error?.message ||
      "Gemini video upload failed."

    );

  }


  return uploaded.file;

}


/*
==================================================
WAIT FOR GEMINI VIDEO
==================================================
*/

async function waitForGeminiFile(
  fileName
) {

  for (
    let attempt = 0;
    attempt < 120;
    attempt++
  ) {

    const response =
      await fetch(

        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(API_KEY)}`

      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(

        data?.error?.message ||
        "Could not check Gemini file status."

      );

    }


    if (
      data.state ===
      "ACTIVE"
    ) {

      return data;

    }


    if (
      data.state ===
      "FAILED"
    ) {

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
==================================================
GEMINI RECAP
==================================================
*/

app.post(

  "/api/recap",

  upload.single("video"),

  async (req, res) => {

    let localPath =
      req.file?.path;

    let geminiFileName =
      null;

    try {

      if (!API_KEY) {

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
            "Please upload a video."

        });

      }


      const language =
        req.body.language ||
        "Burmese";


      const duration =
        req.body.duration ||
        "90 seconds";


      const style =
        req.body.style ||
        "Cinematic Story";


      const instructions =
        req.body.instructions ||
        "";


      const aspectRatio =
        req.body.aspectRatio ||
        "9:16";


      /*
      ----------------------------------------------
      UPLOAD TO GEMINI
      ----------------------------------------------
      */

      const uploaded =
        await uploadToGemini(

          localPath,

          req.file.mimetype,

          req.file.originalname

        );


      geminiFileName =
        uploaded.name;


      /*
      ----------------------------------------------
      WAIT
      ----------------------------------------------
      */

      const activeFile =
        await waitForGeminiFile(
          geminiFileName
        );


      /*
      ----------------------------------------------
      PROMPT
      ----------------------------------------------
      */

      const prompt = `

You are SUN SPY RECAP V2,
a professional AI video recap engine.

Analyze the actual supplied video carefully.

DO NOT invent events.

Identify:

1. Main story
2. Important scenes
3. Characters
4. Key events
5. Best moments
6. Scene timestamps
7. Beginning
8. Middle
9. Ending

Create a short-form video recap.

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

IMPORTANT:

If Burmese is selected:

- Use natural Burmese.
- Make narration sound human.
- Avoid robotic language.
- Make the opening hook strong.
- Keep the story easy to understand.
- Do not add facts that are not visible or supported by the video.

Return ONLY valid JSON.

Use this structure:

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

`;


      /*
      ----------------------------------------------
      GEMINI GENERATE
      ----------------------------------------------
      */

      const response =
        await fetch(

          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,

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

                        file_data: {

                          mime_type:
                            activeFile.mimeType ||
                            req.file.mimetype,

                          file_uri:
                            activeFile.uri

                        }

                      },

                      {

                        text:
                          prompt

                      }

                    ]

                  }

                ],

                generationConfig: {

                  temperature:
                    0.35,

                  responseMimeType:
                    "application/json"

                }

              })

          }

        );


      const data =
        await response.json();


      if (!response.ok) {

        return res.status(
          response.status
        ).json({

          ok: false,

          error:
            data?.error?.message ||
            "Gemini analysis failed.",

          details:
            data?.error ||
            data

        });

      }


      /*
      ----------------------------------------------
      EXTRACT
      ----------------------------------------------
      */

      const text =
        data
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
            "SUN SPY RECAP",

          hook:
            "",

          summary:
            text,

          recap_script:
            text,

          key_events:
            [],

          characters:
            [],

          scenes:
            [],

          best_scenes:
            [],

          ending:
            "",

          hashtags:
            [
              "#SUNSPY",
              "#Recap"
            ]

        };

      }


      /*
      ----------------------------------------------
      RETURN
      ----------------------------------------------
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

      console.error(
        "RECAP ERROR:",
        error
      );


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
==================================================
FFMPEG HELPER
==================================================
*/

function runFFmpeg(
  args
) {

  return new Promise(
    (resolve, reject) => {

      if (!ffmpegPath) {

        reject(
          new Error(
            "FFmpeg binary is not available."
          )
        );

        return;

      }


      console.log(
        "FFmpeg:",
        ffmpegPath
      );


      const process =
        spawn(
          ffmpegPath,
          args
        );


      let stderr = "";


      process.stderr.on(
        "data",
        chunk => {

          stderr +=
            chunk.toString();

        }
      );


      process.on(
        "error",
        error => {

          reject(error);

        }
      );


      process.on(
        "close",
        code => {

          if (
            code === 0
          ) {

            resolve(
              stderr
            );

          } else {

            reject(

              new Error(
                `FFmpeg failed with code ${code}: ${stderr.slice(-4000)}`
              )

            );

          }

        }
      );

    }
  );

}


/*
==================================================
FFPROBE
==================================================
*/

function runFFprobe(
  filePath
) {

  return new Promise(
    (resolve, reject) => {

      if (!ffmpegPath) {

        reject(
          new Error(
            "FFmpeg binary is not available."
          )
        );

        return;

      }


      const args = [

        "-i",
        filePath,

        "-hide_banner"

      ];


      const process =
        spawn(
          ffmpegPath,
          args
        );


      let stderr = "";


      process.stderr.on(
        "data",
        chunk => {

          stderr +=
            chunk.toString();

        }
      );


      process.on(
        "error",
        error => {

          reject(error);

        }
      );


      process.on(
        "close",
        () => {

          const match =
            stderr.match(
              /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
            );


          if (!match) {

            reject(
              new Error(
                "Could not detect video duration."
              )
            );

            return;

          }


          const hours =
            Number(match[1]);

          const minutes =
            Number(match[2]);

          const seconds =
            Number(match[3]);


          const duration =
            hours * 3600 +
            minutes * 60 +
            seconds;


          resolve(
            duration
          );

        }
      );

    }
  );

}


/*
==================================================
ASPECT RATIO
==================================================
*/

function getVideoFilter(
  aspectRatio,
  resolution
) {

  let width =
    resolution === "720p"
      ? 720
      : 1080;

  let height =
    width;


  if (
    aspectRatio ===
    "9:16"
  ) {

    height =
      Math.round(
        width *
        16 /
        9
      );

  }

  else if (
    aspectRatio ===
    "16:9"
  ) {

    height =
      Math.round(
        width *
        9 /
        16
      );

  }

  else if (
    aspectRatio ===
    "4:5"
  ) {

    height =
      Math.round(
        width *
        5 /
        4
      );

  }

  else {

    height =
      width;

  }


  /*
    scale + center crop
  */

  return {

    width,
    height,

    filter:
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`

  };

}


/*
==================================================
REAL VIDEO PROCESSING
==================================================
*/

app.post(

  "/api/process-video",

  upload.single("video"),

  async (req, res) => {

    let inputPath =
      req.file?.path;

    try {

      if (!req.file) {

        return res.status(400).json({

          ok: false,

          error:
            "Please upload a video."

        });

      }


      const start =
        Math.max(
          0,
          Number(
            req.body.start || 0
          )
        );


      const requestedDuration =
        Number(
          req.body.durationSeconds ||
          30
        );


      const aspectRatio =
        req.body.aspectRatio ||
        "9:16";


      const resolution =
        req.body.resolution ||
        "1080p";


      /*
      ----------------------------------------------
      VIDEO DURATION
      ----------------------------------------------
      */

      const sourceDuration =
        await runFFprobe(
          inputPath
        );


      if (
        start >=
        sourceDuration
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Start time is beyond the video duration."

        });

      }


      const duration =
        Math.min(

          requestedDuration,

          sourceDuration -
            start

        );


      /*
      ----------------------------------------------
      OUTPUT
      ----------------------------------------------
      */

      const id =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;


      const outputName =
        `sun-spy-${id}.mp4`;


      const outputPath =
        path.join(
          outputDir,
          outputName
        );


      const video =
        getVideoFilter(
          aspectRatio,
          resolution
        );


      /*
      ----------------------------------------------
      FFMPEG
      ----------------------------------------------
      */

      const args = [

        "-y",

        "-ss",
        String(start),

        "-i",
        inputPath,

        "-t",
        String(duration),

        "-vf",
        video.filter,

        "-c:v",
        "libx264",

        "-preset",
        "veryfast",

        "-crf",
        "23",

        "-c:a",
        "aac",

        "-b:a",
        "128k",

        "-movflags",
        "+faststart",

        outputPath

      ];


      await runFFmpeg(
        args
      );


      /*
      ----------------------------------------------
      RESULT
      ----------------------------------------------
      */

      const stats =
        await fs.promises.stat(
          outputPath
        );


      res.json({

        ok: true,

        message:
          "Video processed successfully.",

        input: {

          filename:
            req.file.originalname,

          duration:
            sourceDuration

        },

        output: {

          filename:
            outputName,

          duration,

          aspectRatio,

          resolution,

          size:
            stats.size,

          url:
            `/outputs/${outputName}`

        }

      });


    }

    catch (error) {

      console.error(
        "FFMPEG ERROR:",
        error
      );


      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Video processing failed."

      });

    }

    finally {

      if (inputPath) {

        fs.promises
          .unlink(inputPath)
          .catch(() => {});

      }

    }

  }

);


/*
==================================================
ERROR HANDLING
==================================================
*/

app.use(

  (err, _req, res, _next) => {

    console.error(
      "SERVER ERROR:",
      err
    );


    if (
      err?.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res.status(
        413
      ).json({

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


/*
==================================================
START
==================================================
*/

app.listen(

  PORT,

  () => {

    console.log(
      "===================================="
    );

    console.log(
      "SUN SPY RECAP V2"
    );

    console.log(
      "Version: 3.1.0"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Gemini: ${MODEL}`
    );

    console.log(
      `Gemini API: ${Boolean(API_KEY)}`
    );

    console.log(
      `FFmpeg: ${ffmpegPath || "NOT FOUND"}`
    );

    console.log(
      "===================================="

    );

  }

);
