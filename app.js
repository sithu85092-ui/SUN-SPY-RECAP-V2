const API_BASE =
  "https://sun-spy-recap-v2.onrender.com";

/* =====================================================
   GLOBAL STATE
===================================================== */

const $ = (selector) =>
  document.querySelector(selector);

let selectedVideo = null;
let logoFile = null;
let currentRecap = null;
let finalVideoUrl = null;
let currentJobId = null;

const videoInput =
  $("#videoInput");

const videoPreview =
  $("#videoPreview");

const videoWrap =
  $("#videoWrap");

const dropzone =
  $("#dropzone");

const readyText =
  $("#readyText");

const toast =
  $("#toast");

const steps =
  [...document.querySelectorAll(".step")];


/* =====================================================
   UTILITIES
===================================================== */

function showToast(message) {
  if (!toast) return;

  toast.textContent =
    String(message || "");

  toast.classList.add(
    "show"
  );

  setTimeout(() => {
    toast.classList.remove(
      "show"
    );
  }, 3000);
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =====================================================
   DURATION
===================================================== */

function getDurationSeconds(
  value
) {
  const text =
    String(
      value || ""
    )
      .toLowerCase()
      .trim();

  if (
    text.includes(
      "custom"
    )
  ) {
    const custom =
      Number(
        $("#customDuration")
          ?.value
      );

    if (
      Number.isFinite(
        custom
      ) &&
      custom > 0
    ) {
      return custom;
    }

    return 90;
  }

  const match =
    text.match(
      /(\d+(?:\.\d+)?)/
    );

  if (!match) {
    return 90;
  }

  const number =
    Number(
      match[1]
    );

  if (
    text.includes(
      "minute"
    ) ||
    text.includes(
      "min"
    )
  ) {
    return (
      number * 60
    );
  }

  return number;
}


/* =====================================================
   BACKEND URL
===================================================== */

function getBackendUrl(
  url
) {
  if (!url) {
    return "";
  }

  if (
    url.startsWith(
      "http://"
    ) ||
    url.startsWith(
      "https://"
    )
  ) {
    return url;
  }

  return (
    API_BASE +
    (
      url.startsWith("/")
        ? ""
        : "/"
    ) +
    url
  );
}


/* =====================================================
   SAFE JSON
===================================================== */

function safeJsonParse(
  value,
  fallback = {}
) {
  if (
    typeof value ===
    "object" &&
    value !== null
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


/* =====================================================
   PIPELINE
===================================================== */

function updatePipeline(
  index,
  status
) {
  steps.forEach(
    (step, i) => {

      step.classList.remove(
        "active"
      );

      if (
        i < index
      ) {
        step.classList.add(
          "done"
        );
      } else {
        step.classList.remove(
          "done"
        );
      }
    }
  );

  if (
    steps[index]
  ) {
    steps[index].classList.add(
      "active"
    );
  }

  if (
    $("#pipelineStatus")
  ) {
    $("#pipelineStatus")
      .textContent =
      status ||
      "";
  }
}


function finishPipeline() {
  steps.forEach(
    step => {

      step.classList.remove(
        "active"
      );

      step.classList.add(
        "done"
      );
    }
  );

  if (
    $("#pipelineStatus")
  ) {
    $("#pipelineStatus")
      .textContent =
      "Complete";
  }
}


/* =====================================================
   VIDEO VALIDATION
===================================================== */

function isVideoFile(
  file
) {
  if (!file) {
    return false;
  }

  if (
    file.type &&
    file.type.startsWith(
      "video/"
    )
  ) {
    return true;
  }

  const name =
    String(
      file.name || ""
    )
      .toLowerCase();

  return (
    name.endsWith(".mp4") ||
    name.endsWith(".mov") ||
    name.endsWith(".mkv") ||
    name.endsWith(".webm") ||
    name.endsWith(".avi") ||
    name.endsWith(".m4v")
  );
}


/* =====================================================
   SET VIDEO
===================================================== */

function setVideo(
  file
) {
  if (!file) {
    return;
  }

  if (
    !isVideoFile(
      file
    )
  ) {
    showToast(
      "Please choose a video file."
    );

    return;
  }

  selectedVideo =
    file;

  const url =
    URL.createObjectURL(
      file
    );

  if (
    videoPreview
  ) {
    videoPreview.src =
      url;

    videoPreview.load();
  }

  if (
    $("#videoName")
  ) {
    $("#videoName")
      .textContent =
      file.name;
  }

  if (
    $("#videoInfo")
  ) {
    $("#videoInfo")
      .textContent =
      `${(
        file.size /
        1024 /
        1024
      ).toFixed(
        1
      )} MB · Ready`;
  }

  dropzone?.classList.add(
    "hidden"
  );

  videoWrap?.classList.remove(
    "hidden"
  );

  if (
    readyText
  ) {
    readyText.textContent =
      "Video loaded. Configure your recap settings.";
  }

  showToast(
    "Video loaded successfully."
  );
}


/* =====================================================
   FILE INPUT
===================================================== */

videoInput?.addEventListener(
  "change",
  event => {

    const file =
      event.target
        ?.files?.[0];

    setVideo(
      file
    );
  }
);


/* =====================================================
   DRAG & DROP
===================================================== */

[
  "dragenter",
  "dragover"
].forEach(
  eventName => {

    dropzone?.addEventListener(
      eventName,
      event => {

        event.preventDefault();
        event.stopPropagation();

        dropzone.classList.add(
          "dragging"
        );
      }
    );
  }
);


[
  "dragleave",
  "drop"
].forEach(
  eventName => {

    dropzone?.addEventListener(
      eventName,
      event => {

        event.preventDefault();
        event.stopPropagation();

        dropzone.classList.remove(
          "dragging"
        );
      }
    );
  }
);


dropzone?.addEventListener(
  "drop",
  event => {

    const file =
      event
        .dataTransfer
        ?.files?.[0];

    if (file) {
      setVideo(
        file
      );
    }
  }
);


/* =====================================================
   REMOVE VIDEO
===================================================== */

$("#removeVideo")
  ?.addEventListener(
    "click",
    () => {

      selectedVideo =
        null;

      currentRecap =
        null;

      finalVideoUrl =
        null;

      if (
        videoPreview
      ) {

        videoPreview.pause();

        videoPreview.removeAttribute(
          "src"
        );

        videoPreview.load();
      }

      if (
        videoInput
      ) {
        videoInput.value =
          "";
      }

      videoWrap?.classList.add(
        "hidden"
      );

      dropzone?.classList.remove(
        "hidden"
      );

      if (
        readyText
      ) {
        readyText.textContent =
          "Upload a video to begin.";
      }

      showToast(
        "Video removed."
      );
    }
  );


/* =====================================================
   LOGO
===================================================== */

$("#logoInput")
  ?.addEventListener(
    "change",
    event => {

      const file =
        event
          .target
          ?.files?.[0];

      if (!file) {
        return;
      }

      const allowed = [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];

      if (
        !allowed.includes(
          file.type
        )
      ) {

        showToast(
          "Logo must be PNG, JPG or WEBP."
        );

        return;
      }

      logoFile =
        file;

      const url =
        URL.createObjectURL(
          file
        );

      if (
        $("#logoPreview")
      ) {

        $("#logoPreview")
          .innerHTML =
          `
            <img
              src="${escapeHtml(url)}"
              alt="Logo preview"
            >
          `;
      }

      showToast(
        "Custom logo added."
      );
    }
  );


/* =====================================================
   RESET SETTINGS
===================================================== */

$("#resetSettings")
  ?.addEventListener(
    "click",
    () => {

      if (
        $("#duration")
      ) {
        $("#duration")
          .value =
          "90 seconds";
      }

      if (
        $("#language")
      ) {
        $("#language")
          .value =
          "Burmese";
      }

      if (
        $("#voice")
      ) {
        $("#voice")
          .selectedIndex =
          0;
      }

      if (
        $("#ratio")
      ) {
        $("#ratio")
          .selectedIndex =
          0;
      }

      if (
        $("#resolution")
      ) {
        $("#resolution")
          .value =
          "1080p";
      }

      if (
        $("#style")
      ) {
        $("#style")
          .selectedIndex =
          0;
      }

      if (
        $("#prompt")
      ) {
        $("#prompt")
          .value =
          "";
      }

      if (
        $("#customDuration")
      ) {
        $("#customDuration")
          .value =
          "";
      }

      showToast(
        "Settings reset."
      );
    }
  );


/* =====================================================
   RESULT PANEL
===================================================== */

function getResultPanel() {

  let panel =
    $("#recapResult");

  if (panel) {
    return panel;
  }

  panel =
    document.createElement(
      "section"
    );

  panel.id =
    "recapResult";

  panel.style.marginTop =
    "24px";

  panel.style.padding =
    "24px";

  panel.style.borderRadius =
    "18px";

  panel.style.background =
    "rgba(255,255,255,0.05)";

  panel.style.border =
    "1px solid rgba(255,255,255,0.1)";

  const content =
    $("#appContent") ||
    document.body;

  content.appendChild(
    panel
  );

  return panel;
}


/* =====================================================
   DISPLAY RECAP
===================================================== */

function displayRecap(
  data
) {

  const panel =
    getResultPanel();

  data =
    data || {};

  const title =
    data.title ||
    "SUN SPY AI Recap";

  const hook =
    data.hook ||
    "";

  const summary =
    data.summary ||
    "";

  const script =
    data.recapScript ||
    data.recap_script ||
    data.script ||
    "";

  const ending =
    data.ending ||
    data.cta ||
    "";

  const hashtags =
    Array.isArray(
      data.hashtags
    )
      ? data.hashtags.join(
          " "
        )
      : (
          data.hashtags ||
          ""
        );

  const characters =
    Array.isArray(
      data.characters
    )
      ? data.characters
          .map(
            character => {

              if (
                typeof character ===
                "string"
              ) {
                return character;
              }

              return (
                `${character.name || "Unknown"} — ` +
                `${character.role || ""}`
              );
            }
          )
          .join(
            ", "
          )
      : (
          data.characters ||
          ""
        );

  panel.innerHTML =
    `
      <div style="margin-bottom:20px;">

        <div style="
          font-size:12px;
          opacity:.6;
          text-transform:uppercase;
        ">
          Gemini AI Result
        </div>

        <h2 style="margin:5px 0 0;">
          ${escapeHtml(title)}
        </h2>

      </div>

      ${
        hook
          ? `
            <div style="margin-bottom:18px;">
              <strong>Hook</strong>
              <p>
                ${escapeHtml(hook)}
              </p>
            </div>
          `
          : ""
      }

      ${
        summary
          ? `
            <div style="margin-bottom:18px;">
              <strong>Summary</strong>
              <p>
                ${escapeHtml(summary)}
              </p>
            </div>
          `
          : ""
      }

      ${
        characters
          ? `
            <div style="margin-bottom:18px;">
              <strong>Characters</strong>
              <p>
                ${escapeHtml(characters)}
              </p>
            </div>
          `
          : ""
      }

      ${
        script
          ? `
            <div style="margin-bottom:18px;">

              <strong>
                Recap Script
              </strong>

              <div style="
                margin-top:8px;
                padding:16px;
                border-radius:12px;
                background:rgba(0,0,0,.18);
                white-space:pre-wrap;
                line-height:1.7;
              ">
                ${escapeHtml(script)}
              </div>

            </div>
          `
          : ""
      }

      ${
        ending
          ? `
            <div style="margin-bottom:18px;">
              <strong>
                Ending / CTA
              </strong>

              <p>
                ${escapeHtml(ending)}
              </p>
            </div>
          `
          : ""
      }

      ${
        hashtags
          ? `
            <div>
              <strong>
                Hashtags
              </strong>

              <p>
                ${escapeHtml(hashtags)}
              </p>
            </div>
          `
          : ""
      }
    `;

  panel.scrollIntoView({
    behavior:
      "smooth",
    block:
      "start"
  });
}


/* =====================================================
   FINAL VIDEO
===================================================== */

function displayFinalVideo(
  url
) {

  const panel =
    getResultPanel();

  finalVideoUrl =
    getBackendUrl(
      url
    );

  if (!finalVideoUrl) {
    throw new Error(
      "Final video URL is empty."
    );
  }

  panel.insertAdjacentHTML(
    "beforeend",
    `
      <div style="
        margin-top:24px;
        padding-top:24px;
        border-top:1px solid rgba(255,255,255,.1);
      ">

        <div style="
          font-size:12px;
          opacity:.6;
          text-transform:uppercase;
          margin-bottom:8px;
        ">
          Final Export
        </div>

        <h3 style="margin:0 0 14px;">
          🎬 Your Recap Video Is Ready
        </h3>

        <video
          controls
          playsinline
          preload="metadata"
          style="
            width:100%;
            max-width:720px;
            border-radius:14px;
            display:block;
            background:#000;
          "
          src="${escapeHtml(
            finalVideoUrl
          )}"
        ></video>

        <div style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:16px;
        ">

          <a
            href="${escapeHtml(
              finalVideoUrl
            )}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:12px 18px;
              border-radius:10px;
              text-decoration:none;
              background:#fff;
              color:#000;
              font-weight:700;
            "
          >
            ▶ Open Video
          </a>

          <a
            href="${escapeHtml(
              finalVideoUrl
            )}"
            download
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:12px 18px;
              border-radius:10px;
              text-decoration:none;
              background:rgba(255,255,255,.1);
              color:#fff;
              border:1px solid rgba(255,255,255,.15);
              font-weight:700;
            "
          >
            ⬇ Download MP4
          </a>

        </div>

      </div>
    `
  );

  panel.scrollIntoView({
    behavior:
      "smooth",
    block:
      "start"
  });
}


/* =====================================================
   ERROR
===================================================== */

function displayError(
  message
) {

  const panel =
    getResultPanel();

  panel.innerHTML =
    `
      <div style="
        padding:18px;
        border-radius:14px;
        border:1px solid rgba(255,80,80,.35);
        background:rgba(255,50,50,.08);
      ">

        <strong>
          SUN SPY RECAP ERROR
        </strong>

        <p style="
          margin-top:10px;
          white-space:pre-wrap;
        ">
          ${escapeHtml(message)}
        </p>

      </div>
    `;
}


/* =====================================================
   BACKEND HEALTH
===================================================== */

async function testBackend() {

  const response =
    await fetch(
      `${API_BASE}/api/health`,
      {
        method:
          "GET",

        cache:
          "no-store"
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
    throw new Error(
      `Backend health returned invalid JSON. HTTP ${response.status}`
    );
  }

  console.log(
    "SUN SPY BACKEND:",
    data
  );

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      data.error ||
      "Backend health check failed."
    );
  }

  return data;
}


/* =====================================================
   FORM POST
===================================================== */

async function postFormData(
  endpoint,
  formData
) {

  const response =
    await fetch(
      `${API_BASE}${endpoint}`,
      {
        method:
          "POST",

        body:
          formData
      }
    );

  const text =
    await response.text();

  console.log(
    "API RESPONSE:",
    endpoint,
    response.status,
    text
  );

  let data;

  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      `Server returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (
    !response.ok
  ) {

    const error =
      new Error(
        data.error ||
        data.message ||
        `Server error: HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.retryable =
      data.retryable ===
      true;

    throw error;
  }

  return data;
}


/* =====================================================
   JOB STATUS
===================================================== */

async function getJob(
  jobId
) {

  const response =
    await fetch(
      `${API_BASE}/api/jobs/${encodeURIComponent(
        jobId
      )}`,
      {
        method:
          "GET",

        cache:
          "no-store"
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

    throw new Error(
      `Job status returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (
    !response.ok ||
    !data.ok
  ) {

    throw new Error(
      data.error ||
      "Could not read job status."
    );
  }

  return data.job;
}


/* =====================================================
   POLL RECAP JOB
===================================================== */

async function waitForRecapJob(
  jobId
) {

  let lastMessage =
    "";

  currentJobId =
    jobId;

  /*
   * Safety timeout:
   * 60 minutes maximum.
   */
  const startedAt =
    Date.now();

  const maxRuntime =
    60 * 60 * 1000;

  while (true) {

    if (
      Date.now() -
      startedAt >
      maxRuntime
    ) {

      throw new Error(
        "Gemini recap job timed out after 60 minutes."
      );
    }

    const job =
      await getJob(
        jobId
      );

    console.log(
      "SUN SPY JOB:",
      job
    );

    const message =
      job.message ||
      job.step ||
      "Processing...";

    if (
      message !==
      lastMessage
    ) {

      lastMessage =
        message;

      if (
        $("#pipelineStatus")
      ) {
        $("#pipelineStatus")
          .textContent =
          message;
      }
    }

    const step =
      String(
        job.step ||
        ""
      ).toLowerCase();

    if (
      step.includes(
        "upload"
      )
    ) {

      updatePipeline(
        1,
        message
      );

    } else if (
      step.includes(
        "process"
      ) ||
      step.includes(
        "analy"
      ) ||
      step.includes(
        "gemini"
      ) ||
      step.includes(
        "recap"
      )
    ) {

      updatePipeline(
        2,
        message
      );
    }

    if (
      job.status ===
      "complete"
    ) {

      currentJobId =
        null;

      return job;
    }

    if (
      job.status ===
      "failed"
    ) {

      currentJobId =
        null;

      throw new Error(
        job.error ||
        job.message ||
        "Recap job failed."
      );
    }

    await sleep(
      2500
    );
  }
}


/* =====================================================
   GEMINI SCENE HELPERS
===================================================== */

/*
 * Gemini can return different property names.
 */

function normalizeSceneArray(
  recap
) {

  if (
    !recap ||
    typeof recap !==
      "object"
  ) {
    return [];
  }

  const candidates = [

    recap.bestScenes,

    recap.best_scenes,

    recap.scenes,

    recap.selectedScenes,

    recap.selected_scenes,

    recap.importantScenes,

    recap.important_scenes
  ];

  for (
    const value of
    candidates
  ) {

    if (
      Array.isArray(
        value
      ) &&
      value.length
    ) {

      return value;
    }
  }

  return [];
}


/* =====================================================
   TIME PARSER
===================================================== */

function parseTimeToSeconds(
  value
) {

  if (
    typeof value ===
    "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : NaN;
  }

  const text =
    String(
      value ?? ""
    )
      .trim();

  if (!text) {
    return NaN;
  }

  /*
   * Plain seconds:
   * 12
   * 12.5
   */

  if (
    /^\d+(?:\.\d+)?$/.test(
      text
    )
  ) {

    return Number(
      text
    );
  }

  /*
   * HH:MM:SS
   * MM:SS
   */

  const parts =
    text
      .split(":")
      .map(
        part =>
          Number(
            part.trim()
          )
      );

  if (
    parts.some(
      Number.isNaN
    )
  ) {
    return NaN;
  }

  if (
    parts.length ===
    2
  ) {

    return (
      parts[0] * 60 +
      parts[1]
    );
  }

  if (
    parts.length ===
    3
  ) {

    return (
      parts[0] * 3600 +
      parts[1] * 60 +
      parts[2]
    );
  }

  return NaN;
}


/* =====================================================
   SCENE START
===================================================== */

function sceneStart(
  scene
) {

  if (
    !scene ||
    typeof scene !==
      "object"
  ) {
    return NaN;
  }

  const value =

    scene.start ??
    scene.startTime ??
    scene.start_time ??
    scene.from ??
    scene.begin ??
    scene.startTimestamp ??
    scene.start_timestamp;

  return parseTimeToSeconds(
    value
  );
}


/* =====================================================
   SCENE END
===================================================== */

function sceneEnd(
  scene
) {

  if (
    !scene ||
    typeof scene !==
      "object"
  ) {
    return NaN;
  }

  const value =

    scene.end ??
    scene.endTime ??
    scene.end_time ??
    scene.to ??
    scene.finish ??
    scene.endTimestamp ??
    scene.end_timestamp;

  return parseTimeToSeconds(
    value
  );
}


/* =====================================================
   SCENE VALIDATION
===================================================== */

function normalizeScene(
  scene,
  index
) {

  if (
    !scene ||
    typeof scene !==
      "object"
  ) {
    return null;
  }

  const start =
    sceneStart(
      scene
    );

  const end =
    sceneEnd(
      scene
    );

  if (
    !Number.isFinite(
      start
    ) ||
    !Number.isFinite(
      end
    ) ||
    end <= start
  ) {

    return null;
  }

  return {
    ...scene,

    start,
    end,

    duration:
      end - start,

    sceneIndex:
      index
  };
}


/* =====================================================
   GET VALID GEMINI SCENES
===================================================== */

function getValidGeminiScenes(
  recap
) {

  const scenes =
    normalizeSceneArray(
      recap
    );

  return scenes
    .map(
      (
        scene,
        index
      ) =>
        normalizeScene(
          scene,
          index
        )
    )
    .filter(
      Boolean
    )
    .filter(
      scene =>
        scene.end >
        scene.start
    )
    .sort(
      (
        a,
        b
      ) =>
        a.start -
        b.start
    );
}


/* =====================================================
   SCENE SUMMARY
===================================================== */

function sceneDescription(
  scene
) {

  if (!scene) {
    return "";
  }

  return (
    scene.description ||
    scene.summary ||
    scene.reason ||
    scene.content ||
    scene.action ||
    scene.visual ||
    ""
  );
}


/* =====================================================
   CHECK GEMINI RESULT
===================================================== */

function hasUsableGeminiScenes(
  recap
) {

  return (
    getValidGeminiScenes(
      recap
    ).length >
    0
  );
}


/* =====================================================
   BUILD RENDER DATA
===================================================== */

function buildRenderData(
  recap
) {

  const scenes =
    getValidGeminiScenes(
      recap
    );

  if (
    !scenes.length
  ) {

    throw new Error(
      "Gemini did not return usable scene timestamps."
    );
  }

  /*
   * Keep the original Gemini object AND provide a
   * normalized scene list for the backend.
   */

  return {
    ...recap,

    bestScenes:
      scenes,

    best_scenes:
      scenes,

    scenes:
      Array.isArray(
        recap?.scenes
      )
        ? recap.scenes
        : scenes
  };
}


/* =====================================================
   GENERATE RECAP
===================================================== */

$("#generateBtn")
  ?.addEventListener(
    "click",
    async () => {

      if (
        !selectedVideo
      ) {

        showToast(
          "Upload a video first."
        );

        return;
      }

      const button =
        $("#generateBtn");

      try {

        button.disabled =
          true;

        button.dataset.originalText =
          button.textContent;

        /* =================================================
           RESET RESULT
        ================================================= */

        const oldPanel =
          $("#recapResult");

        if (
          oldPanel
        ) {
          oldPanel.remove();
        }

        finalVideoUrl =
          null;

        currentRecap =
          null;

        /* =================================================
           STEP 0 — HEALTH
        ================================================= */

        button.textContent =
          "Connecting...";

        updatePipeline(
          0,
          "Waking SUN SPY backend..."
        );

        await testBackend();

        /* =================================================
           SETTINGS
        ================================================= */

        const duration =
          $("#duration")
            ?.value ||
          "90 seconds";

        const language =
          $("#language")
            ?.value ||
          "Burmese";

        const style =
          $("#style")
            ?.value ||
          "Cinematic Story";

        const aspectRatio =
          $("#ratio")
            ?.value ||
          "9:16";

        const resolution =
          $("#resolution")
            ?.value ||
          "1080p";

        const instructions =
          $("#prompt")
            ?.value ||
          "";

        const durationSeconds =
          getDurationSeconds(
            duration
          );

        /*
         * SUN SPY output is always Burmese.
         */
        const outputLanguage =
          "Burmese";

        const voiceStyle =
          $("#voice")
            ?.value ||
          "Male Natural";

        /* =================================================
           STEP 1 — GEMINI ANALYSIS
        ================================================= */

        const formData =
          new FormData();

        formData.append(
          "video",
          selectedVideo,
          selectedVideo.name
        );

        formData.append(
          "duration",
          duration
        );

        formData.append(
          "durationSeconds",
          String(
            durationSeconds
          )
        );

        formData.append(
          "language",
          outputLanguage
        );

        formData.append(
          "outputLanguage",
          outputLanguage
        );

        formData.append(
          "style",
          style
        );

        formData.append(
          "aspectRatio",
          aspectRatio
        );

        formData.append(
          "resolution",
          resolution
        );

        formData.append(
          "instructions",
          instructions
        );

        /*
         * FORCE ACTUAL GEMINI VIDEO ANALYSIS.
         */

        formData.append(
          "sceneAnalysis",
          "true"
        );

        formData.append(
          "bestScenes",
          "true"
        );

        formData.append(
          "analyzeScenes",
          "true"
        );

        button.textContent =
          "Starting Gemini...";

        updatePipeline(
          1,
          "Creating Gemini video analysis job..."
        );

        const created =
          await postFormData(
            "/api/recap",
            formData
          );

        if (
          !created ||
          !created.jobId
        ) {

          throw new Error(
            "Backend did not return a Job ID."
          );
        }

        console.log(
          "SUN SPY JOB CREATED:",
          created.jobId
        );

        /* =================================================
           STEP 2 — POLL GEMINI
        ================================================= */

        button.textContent =
          "Gemini Analyzing...";

        const completed =
          await waitForRecapJob(
            created.jobId
          );

        /*
         * Some backend versions may return:
         * job.recap
         * job.result.recap
         * job.data.recap
         */

        const recap =
          completed?.recap ||
          completed?.result?.recap ||
          completed?.data?.recap ||
          completed?.result ||
          {};

        currentRecap =
          safeJsonParse(
            recap,
            {}
          );

        console.log(
          "SUN SPY GEMINI RECAP:",
          currentRecap
        );

        /* =================================================
           SHOW GEMINI RESULT
        ================================================= */

        displayRecap(
          currentRecap
        );

        /* =================================================
           VERIFY ACTUAL TIMESTAMPS
        ================================================= */

        const validScenes =
          getValidGeminiScenes(
            currentRecap
          );

        console.log(
          "VALID GEMINI SCENES:",
          validScenes
        );

        if (
          !validScenes.length
        ) {

          throw new Error(
            "Gemini completed, but no usable scene timestamps were returned. Rendering has been stopped to prevent a first-N-seconds fallback."
          );
        }

        /*
         * Normalize scenes before sending them to backend.
         */

        const renderRecap =
          buildRenderData(
            currentRecap
          );

        /* =================================================
           STEP 3 — PREPARE RENDER
        ================================================= */

        button.textContent =
          "Preparing scenes...";

        updatePipeline(
          3,
          `Gemini selected ${validScenes.length} actual scene(s). Preparing FFmpeg...`
        );

        const processData =
          new FormData();

        processData.append(
          "video",
          selectedVideo,
          selectedVideo.name
        );

        processData.append(
          "durationSeconds",
          String(
            durationSeconds
          )
        );

        processData.append(
          "duration",
          duration
        );

        processData.append(
          "aspectRatio",
          aspectRatio
        );

        processData.append(
          "resolution",
          resolution
        );

        /* =================================================
           FORCE BEST SCENE RENDER
        ================================================= */

        processData.append(
          "sceneAnalysis",
          "true"
        );

        processData.append(
          "bestScenes",
          "true"
        );

        processData.append(
          "analyzeScenes",
          "true"
        );

        processData.append(
          "useBestScenes",
          "true"
        );

        /* =================================================
           COMPLETE GEMINI RESULT
        ================================================= */

        processData.append(
          "recapData",
          JSON.stringify(
            renderRecap
          )
        );

        processData.append(
          "geminiResult",
          JSON.stringify(
            renderRecap
          )
        );

        processData.append(
          "scenes",
          JSON.stringify(
            validScenes
          )
        );

        processData.append(
          "bestScenesData",
          JSON.stringify(
            validScenes
          )
        );

        /* =================================================
           BURMESE OUTPUT
        ================================================= */

        processData.append(
          "language",
          outputLanguage
        );

        processData.append(
          "outputLanguage",
          outputLanguage
        );

        processData.append(
          "voiceStyle",
          voiceStyle
        );

        processData.append(
          "voice",
          voiceStyle
        );

        processData.append(
          "style",
          style
        );

        processData.append(
          "instructions",
          instructions
        );

        /* =================================================
           AUDIO / SUBTITLE FLAGS
        ================================================= */

        /*
         * These flags make the frontend intent explicit.
         * Backend must honor them.
         */

        processData.append(
          "removeOriginalAudio",
          "true"
        );

        processData.append(
          "originalAudio",
          "false"
        );

        processData.append(
          "generateTTS",
          "true"
        );

        processData.append(
          "tts",
          "true"
        );

        processData.append(
          "subtitles",
          "true"
        );

        processData.append(
          "burnSubtitles",
          "true"
        );

        processData.append(
          "subtitleLanguage",
          "Burmese"
        );

        processData.append(
          "outputFormat",
          "mp4"
        );

        /* =================================================
           LOGO
        ================================================= */

        if (
          logoFile
        ) {

          processData.append(
            "logo",
            logoFile,
            logoFile.name
          );
        }

        /* =================================================
           STEP 4 — RENDER
        ================================================= */

        updatePipeline(
          4,
          "Cutting Gemini-selected scenes + Burmese AI voice + subtitles..."
        );

        button.textContent =
          "Creating Burmese AI Voice...";

        console.log(
          "PROCESS FORM:",
          {
            durationSeconds,
            aspectRatio,
            resolution,
            language:
              outputLanguage,
            voiceStyle,
            sceneCount:
              validScenes.length,
            scenes:
              validScenes
          }
        );

        const processed =
          await postFormData(
            "/api/process-video",
            processData
          );

        console.log(
          "SUN SPY PROCESS RESULT:",
          processed
        );

        if (
          !processed
        ) {

          throw new Error(
            "Video processing returned an empty response."
          );
        }

        if (
          processed.ok ===
            false &&
          processed.success ===
            false
        ) {

          throw new Error(
            processed.error ||
            processed.message ||
            "Video processing failed."
          );
        }

        if (
          processed.error &&
          !processed.outputUrl &&
          !processed.videoUrl &&
          !processed.url &&
          !processed.file &&
          !processed.path
        ) {

          throw new Error(
            processed.error
          );
        }

        /* =================================================
           FINAL OUTPUT URL
        ================================================= */

        const output =
          processed.outputUrl ||
          processed.videoUrl ||
          processed.url ||
          processed.file ||
          processed.path;

        if (
          !output
        ) {

          throw new Error(
            "Backend completed processing but no final video URL was returned."
          );
        }

        const absoluteOutput =
          getBackendUrl(
            output
          );

        console.log(
          "FINAL VIDEO:",
          absoluteOutput
        );

        /* =================================================
           STEP 5 — COMPLETE
        ================================================= */

        updatePipeline(
          5,
          "Final recap ready!"
        );

        displayFinalVideo(
          absoluteOutput
        );

        finishPipeline();

        button.textContent =
          "Recap Ready ✓";

        showToast(
          "AI recap completed successfully!"
        );

      } catch (
        error
      ) {

        console.error(
          "SUN SPY RECAP ERROR:",
          error
        );

        const message =
          error?.message ||
          "Failed to generate recap.";

        if (
          $("#pipelineStatus")
        ) {

          $("#pipelineStatus")
            .textContent =
            "Failed";
        }

        steps.forEach(
          step => {

            step.classList.remove(
              "active"
            );
          }
        );

        showToast(
          message
        );

        displayError(
          message
        );

      } finally {

        button.disabled =
          false;

        button.textContent =
          button.dataset.originalText ||
          "Generate Recap";

      }
    }
  );


/* =====================================================
   NAVIGATION
===================================================== */

document
  .querySelectorAll(
    ".nav-item"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".nav-item"
            )
            .forEach(
              item => {

                item.classList.remove(
                  "active"
                );
              }
            );

          button.classList.add(
            "active"
          );

          const page =
            button.dataset.page;

          const label =
            button.querySelector(
              "span"
            )?.textContent ||
            "Create Recap";

          if (
            page !==
            "studio"
          ) {

            if (
              $("#pageTitle")
            ) {

              $("#pageTitle")
                .textContent =
                label;
            }

            showToast(
              `${label} module is ready.`
            );

          } else {

            if (
              $("#pageTitle")
            ) {

              $("#pageTitle")
                .textContent =
                "Create Recap";
            }
          }

          $("#sidebar")
            ?.classList.remove(
              "open"
            );
        }
      );
    }
  );


/* =====================================================
   MOBILE MENU
===================================================== */

$("#mobileMenu")
  ?.addEventListener(
    "click",
    () => {

      $("#sidebar")
        ?.classList.toggle(
          "open"
        );
    }
  );


/* =====================================================
   REMOVE OLD STALE MESSAGE
===================================================== */

document
  .querySelectorAll(
    "body *"
  )
  .forEach(
    element => {

      if (
        element.children.length ===
        0 &&
        element.textContent.includes(
          "Backend connection will be added in the next phase"
        )
      ) {

        element.textContent =
          "AI processing is ready. Upload a video to begin.";
      }
    }
  );


/* =====================================================
   START
===================================================== */

console.log(
  "========================================"
);

console.log(
  "SUN SPY RECAP V2 frontend"
);

console.log(
  "Gemini Video Analysis: ENABLED"
);

console.log(
  "Gemini Best Scene Selection: ENABLED"
);

console.log(
  "Actual Timestamp Cutting: ENABLED"
);

console.log(
  "Original Audio Removal: REQUESTED"
);

console.log(
  "Burmese Gemini TTS: ENABLED"
);

console.log(
  "Burmese Subtitle Burn-In: ENABLED"
);

console.log(
  "9:16 Video Pipeline: ENABLED"
);

console.log(
  "Backend:",
  API_BASE
);

console.log(
  "========================================"
);
