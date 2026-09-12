const API_BASE = "https://sun-spy-recap-v2.onrender.com";

const $ = (s) => document.querySelector(s);

const videoInput = $("#videoInput");
const videoPreview = $("#videoPreview");
const videoWrap = $("#videoWrap");
const dropzone = $("#dropzone");
const readyText = $("#readyText");
const toast = $("#toast");

let selectedVideo = null;
let logoFile = null;
let currentRecap = null;
let finalVideoUrl = null;

/* =========================
   UTILITIES
========================= */

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDurationSeconds(value) {
  const text = String(value || "").toLowerCase().trim();

  if (text.includes("custom")) {
    const custom = Number($("#customDuration")?.value);
    return Number.isFinite(custom) && custom > 0 ? custom : 90;
  }

  const match = text.match(/(\d+(?:\.\d+)?)/);

  if (!match) return 90;

  const number = Number(match[1]);

  if (text.includes("minute") || text.includes("min")) {
    return number * 60;
  }

  return number;
}

function getBackendUrl(path) {
  if (!path) return "";

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/* =========================
   VIDEO UPLOAD
========================= */

function setVideo(file) {
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    showToast("Please choose a video file.");
    return;
  }

  selectedVideo = file;

  const url = URL.createObjectURL(file);

  if (videoPreview) {
    videoPreview.src = url;
    videoPreview.load();
  }

  if ($("#videoName")) {
    $("#videoName").textContent = file.name;
  }

  if ($("#videoInfo")) {
    $("#videoInfo").textContent =
      `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready`;
  }

  dropzone?.classList.add("hidden");
  videoWrap?.classList.remove("hidden");

  if (readyText) {
    readyText.textContent =
      "Video loaded. Configure your recap settings.";
  }

  showToast("Video loaded successfully.");
}

videoInput?.addEventListener("change", (e) => {
  setVideo(e.target.files[0]);
});

/* Drag & Drop */

["dragenter", "dragover"].forEach((eventName) => {
  dropzone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();

    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();

    dropzone.classList.remove("dragging");
  });
});

dropzone?.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];

  if (file) {
    setVideo(file);
  }
});

/* Remove video */

$("#removeVideo")?.addEventListener("click", () => {
  selectedVideo = null;

  if (videoPreview) {
    videoPreview.pause();
    videoPreview.removeAttribute("src");
    videoPreview.load();
  }

  if (videoInput) {
    videoInput.value = "";
  }

  videoWrap?.classList.add("hidden");
  dropzone?.classList.remove("hidden");

  if (readyText) {
    readyText.textContent = "Upload a video to begin.";
  }

  showToast("Video removed.");
});

/* =========================
   LOGO
========================= */

$("#logoInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];

  if (!file) return;

  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    showToast("Logo must be PNG, JPG or WEBP.");
    return;
  }

  logoFile = file;

  const url = URL.createObjectURL(file);

  if ($("#logoPreview")) {
    $("#logoPreview").innerHTML =
      `<img src="${url}" alt="Logo preview">`;
  }

  showToast("Custom logo added.");
});

/* =========================
   RESET SETTINGS
========================= */

$("#resetSettings")?.addEventListener("click", () => {
  if ($("#duration")) {
    $("#duration").value = "90 seconds";
  }

  if ($("#language")) {
    $("#language").value = "Burmese";
  }

  if ($("#voice")) {
    $("#voice").selectedIndex = 0;
  }

  if ($("#ratio")) {
    $("#ratio").selectedIndex = 0;
  }

  if ($("#resolution")) {
    $("#resolution").value = "1080p";
  }

  if ($("#style")) {
    $("#style").selectedIndex = 0;
  }

  if ($("#prompt")) {
    $("#prompt").value = "";
  }

  showToast("Settings reset.");
});

/* =========================
   PIPELINE
========================= */

const steps = [...document.querySelectorAll(".step")];

function updatePipeline(index, status) {
  steps.forEach((step, i) => {
    step.classList.remove("active");

    if (i < index) {
      step.classList.add("done");
    } else {
      step.classList.remove("done");
    }
  });

  if (steps[index]) {
    steps[index].classList.add("active");
  }

  if ($("#pipelineStatus")) {
    $("#pipelineStatus").textContent = status;
  }
}

function finishPipeline() {
  steps.forEach((step) => {
    step.classList.remove("active");
    step.classList.add("done");
  });

  if ($("#pipelineStatus")) {
    $("#pipelineStatus").textContent = "Complete";
  }
}

/* =========================
   RESULT PANEL
========================= */

function getResultPanel() {
  let panel = $("#recapResult");

  if (panel) return panel;

  panel = document.createElement("section");

  panel.id = "recapResult";

  panel.style.marginTop = "24px";
  panel.style.padding = "24px";
  panel.style.borderRadius = "18px";
  panel.style.background = "rgba(255,255,255,0.05)";
  panel.style.border =
    "1px solid rgba(255,255,255,0.1)";

  const content = $("#appContent") || document.body;

  content.appendChild(panel);

  return panel;
}

/* =========================
   DISPLAY GEMINI RECAP
========================= */

function displayRecap(data) {
  const panel = getResultPanel();

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
    data.recap_script ||
    data.script ||
    "";

  const ending =
    data.ending ||
    data.cta ||
    "";

  const hashtags =
    Array.isArray(data.hashtags)
      ? data.hashtags.join(" ")
      : (data.hashtags || "");

  const characters =
    Array.isArray(data.characters)
      ? data.characters.join(", ")
      : (data.characters || "");

  panel.innerHTML = `
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
        <p>${escapeHtml(hook)}</p>
      </div>
    `
        : ""
    }

    ${
      summary
        ? `
      <div style="margin-bottom:18px;">
        <strong>Summary</strong>
        <p>${escapeHtml(summary)}</p>
      </div>
    `
        : ""
    }

    ${
      characters
        ? `
      <div style="margin-bottom:18px;">
        <strong>Characters</strong>
        <p>${escapeHtml(characters)}</p>
      </div>
    `
        : ""
    }

    ${
      script
        ? `
      <div style="margin-bottom:18px;">
        <strong>Recap Script</strong>

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
        <strong>Ending / CTA</strong>
        <p>${escapeHtml(ending)}</p>
      </div>
    `
        : ""
    }

    ${
      hashtags
        ? `
      <div>
        <strong>Hashtags</strong>
        <p>${escapeHtml(hashtags)}</p>
      </div>
    `
        : ""
    }
  `;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================
   FINAL VIDEO PANEL
========================= */

function displayFinalVideo(url) {
  const panel = getResultPanel();

  finalVideoUrl = getBackendUrl(url);

  const videoHtml = `
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
        style="
          width:100%;
          max-width:720px;
          border-radius:14px;
          display:block;
          background:#000;
        "
        src="${escapeHtml(finalVideoUrl)}"
      ></video>

      <div style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-top:16px;
      ">

        <a
          href="${escapeHtml(finalVideoUrl)}"
          target="_blank"
          rel="noopener"
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
          href="${escapeHtml(finalVideoUrl)}"
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
  `;

  panel.insertAdjacentHTML("beforeend", videoHtml);

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================
   ERROR PANEL
========================= */

function displayError(message) {
  const panel = getResultPanel();

  panel.innerHTML = `
    <div style="
      padding:18px;
      border-radius:14px;
      border:1px solid rgba(255,80,80,.35);
      background:rgba(255,50,50,.08);
    ">

      <strong>SUN SPY RECAP ERROR</strong>

      <p style="
        margin-top:10px;
        white-space:pre-wrap;
      ">
        ${escapeHtml(message)}
      </p>

      <p style="
        margin-top:10px;
        opacity:.7;
        font-size:13px;
      ">
        Check the browser console for technical details.
      </p>

    </div>
  `;
}

/* =========================
   BACKEND HEALTH
========================= */

async function testBackend() {
  try {
    const response = await fetch(
      `${API_BASE}/api/health`,
      {
        method: "GET",
        cache: "no-store"
      }
    );

    const data = await response.json();

    console.log(
      "SUN SPY BACKEND:",
      data
    );

    if (!response.ok || !data.ok) {
      throw new Error(
        "Backend health check failed."
      );
    }

    return data;

  } catch (error) {

    console.error(
      "BACKEND CONNECTION ERROR:",
      error
    );

    throw new Error(
      "Cannot connect to SUN SPY backend. Please check Render."
    );
  }
}

/* =========================
   API REQUEST HELPER
========================= */

async function postFormData(
  endpoint,
  formData,
  timeoutMs = 300000
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {

    const response =
      await fetch(
        `${API_BASE}${endpoint}`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal
        }
      );

    const rawText =
      await response.text();

    console.log(
      endpoint,
      "HTTP:",
      response.status
    );

    console.log(
      endpoint,
      "RESPONSE:",
      rawText
    );

    let result;

    try {
      result =
        JSON.parse(rawText);
    } catch {
      throw new Error(
        `Server returned invalid JSON. HTTP ${response.status}`
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        `Server error: HTTP ${response.status}`
      );
    }

    return result;

  } finally {
    clearTimeout(timeout);
  }
}

/* =========================
   GENERATE RECAP
========================= */

$("#generateBtn")?.addEventListener(
  "click",
  async () => {

    if (!selectedVideo) {
      showToast(
        "Upload a video first."
      );
      return;
    }

    const button =
      $("#generateBtn");

    try {

      button.disabled = true;

      button.dataset.originalText =
        button.textContent;

      /* STEP 1 */

      button.textContent =
        "Connecting...";

      updatePipeline(
        0,
        "Checking SUN SPY backend..."
      );

      const health =
        await testBackend();

      console.log(
        "Backend connected:",
        health
      );

      /* STEP 2 */

      button.textContent =
        "Uploading Video...";

      updatePipeline(
        1,
        "Uploading video to SUN SPY..."
      );

      const formData =
        new FormData();

      formData.append(
        "video",
        selectedVideo,
        selectedVideo.name
      );

      const duration =
        $("#duration")?.value ||
        "90 seconds";

      const language =
        $("#language")?.value ||
        "Burmese";

      const style =
        $("#style")?.value ||
        "Cinematic Story";

      const aspectRatio =
        $("#ratio")?.value ||
        "9:16";

      const resolution =
        $("#resolution")?.value ||
        "1080p";

      const instructions =
        $("#prompt")?.value ||
        "";

      const durationSeconds =
        getDurationSeconds(
          duration
        );

      formData.append(
        "duration",
        duration
      );

      formData.append(
        "durationSeconds",
        String(durationSeconds)
      );

      formData.append(
        "language",
        language
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

      /* Optional logo */

      if (logoFile) {
        formData.append(
          "logo",
          logoFile,
          logoFile.name
        );
      }

      /* STEP 3 */

      button.textContent =
        "AI Analyzing...";

      updatePipeline(
        2,
        "Gemini is analyzing your video..."
      );

      console.log(
        "POST:",
        `${API_BASE}/api/recap`
      );

      console.log(
        "Video:",
        selectedVideo.name,
        selectedVideo.type,
        selectedVideo.size
      );

      currentRecap =
        await postFormData(
          "/api/recap",
          formData,
          300000
        );

      console.log(
        "GEMINI RESULT:",
        currentRecap
      );

      displayRecap(
        currentRecap.recap ||
        currentRecap
      );

      /* STEP 4 */

      button.textContent =
        "Processing Video...";

      updatePipeline(
        3,
        "FFmpeg is preparing the recap video..."
      );

      /*
       * Send video again to FFmpeg.
       * The current backend creates the
       * requested trimmed/cropped MP4.
       */

      const processData =
        new FormData();

      processData.append(
        "video",
        selectedVideo,
        selectedVideo.name
      );

      processData.append(
        "duration",
        duration
      );

      processData.append(
        "durationSeconds",
        String(durationSeconds)
      );

      processData.append(
        "aspectRatio",
        aspectRatio
      );

      processData.append(
        "resolution",
        resolution
      );

      /* STEP 5 */

      button.textContent =
        "Rendering MP4...";

      updatePipeline(
        4,
        "Rendering final MP4..."
      );

      const processed =
        await postFormData(
          "/api/process-video",
          processData,
          300000
        );

      console.log(
        "FFMPEG RESULT:",
        processed
      );

      /*
       * Support several possible backend
       * response property names.
       */

      const output =
        processed.outputUrl ||
        processed.videoUrl ||
        processed.url ||
        processed.file ||
        processed.path;

      if (!output) {
        throw new Error(
          "Video processing completed, but the server did not return an output video URL."
        );
      }

      /* STEP 6 */

      updatePipeline(
        5,
        "Export complete."
      );

      displayFinalVideo(
        output
      );

      finishPipeline();

      button.textContent =
        "Recap Ready ✓";

      showToast(
        "AI recap and MP4 processing completed!"
      );

    } catch (error) {

      console.error(
        "SUN SPY RECAP ERROR:",
        error
      );

      let message =
        error?.message ||
        "Failed to generate recap.";

      if (
        error?.name ===
        "AbortError"
      ) {
        message =
          "Request timed out. Render or Gemini took too long.";
      }

      if (
        message.includes(
          "Failed to fetch"
        )
      ) {
        message =
          "Network/CORS error. Frontend cannot reach Render.";
      }

      if (
        $("#pipelineStatus")
      ) {
        $("#pipelineStatus").textContent =
          "Failed";
      }

      steps.forEach(
        (step) => {
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

/* =========================
   NAVIGATION
========================= */

document
  .querySelectorAll(".nav-item")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".nav-item")
          .forEach((item) => {
            item.classList.remove(
              "active"
            );
          });

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
          page !== "studio"
        ) {

          if ($("#pageTitle")) {
            $("#pageTitle").textContent =
              label;
          }

          showToast(
            `${label} module is ready.`
          );

        } else {

          if ($("#pageTitle")) {
            $("#pageTitle").textContent =
              "Create Recap";
          }
        }

        $("#sidebar")
          ?.classList.remove(
            "open"
          );
      }
    );
  });

/* =========================
   MOBILE MENU
========================= */

$("#mobileMenu")?.addEventListener(
  "click",
  () => {
    $("#sidebar")
      ?.classList.toggle(
        "open"
      );
  }
);

/* =========================
   STARTUP
========================= */

console.log(
  "SUN SPY RECAP V2 frontend loaded."
);

console.log(
  "Backend:",
  API_BASE
);
