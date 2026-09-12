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

/* =========================
   Toast
========================= */

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

/* =========================
   Video Upload
========================= */

function setVideo(file) {
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    showToast("Please choose a video file.");
    return;
  }

  selectedVideo = file;

  const url = URL.createObjectURL(file);

  videoPreview.src = url;
  videoPreview.load();

  $("#videoName").textContent = file.name;

  $("#videoInfo").textContent =
    `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready`;

  dropzone.classList.add("hidden");
  videoWrap.classList.remove("hidden");

  if (readyText) {
    readyText.textContent =
      "Video loaded. Configure your recap settings.";
  }

  showToast("Video loaded successfully.");
}

videoInput?.addEventListener("change", (e) => {
  setVideo(e.target.files[0]);
});

/* =========================
   Drag & Drop
========================= */

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

/* =========================
   Remove Video
========================= */

$("#removeVideo")?.addEventListener("click", () => {
  selectedVideo = null;

  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoPreview.load();

  videoInput.value = "";

  videoWrap.classList.add("hidden");
  dropzone.classList.remove("hidden");

  if (readyText) {
    readyText.textContent = "Upload a video to begin.";
  }

  showToast("Video removed.");
});

/* =========================
   Custom Logo
========================= */

$("#logoInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];

  if (!file) return;

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    showToast("Logo must be PNG, JPG or WEBP.");
    return;
  }

  logoFile = file;

  const url = URL.createObjectURL(file);

  $("#logoPreview").innerHTML = `
    <img src="${url}" alt="Logo preview">
  `;

  showToast("Custom logo added.");
});

/* =========================
   Reset Settings
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
   Pipeline
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
   Result Panel
========================= */

function getResultPanel() {
  let panel = $("#recapResult");

  if (panel) {
    return panel;
  }

  panel = document.createElement("section");

  panel.id = "recapResult";

  panel.style.marginTop = "24px";
  panel.style.padding = "24px";
  panel.style.borderRadius = "18px";
  panel.style.background = "rgba(255,255,255,0.05)";
  panel.style.border = "1px solid rgba(255,255,255,0.1)";
  panel.style.color = "inherit";

  const content = $("#appContent") || document.body;

  content.appendChild(panel);

  return panel;
}

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
    "";

  const ending =
    data.ending ||
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
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;">
      <div>
        <div style="font-size:12px;opacity:.6;text-transform:uppercase;">
          Gemini AI Result
        </div>

        <h2 style="margin:5px 0 0;">
          ${escapeHtml(title)}
        </h2>
      </div>

      <span style="
        padding:7px 12px;
        border-radius:999px;
        background:rgba(100,255,160,.12);
        color:#7dffae;
        font-size:12px;
      ">
        AI Complete
      </span>
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
            ">${escapeHtml(script)}</div>
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
   HTML Escape
========================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Generate Recap
========================= */

$("#generateBtn")?.addEventListener("click", async () => {
  if (!selectedVideo) {
    showToast("Upload a video first.");
    return;
  }

  const button = $("#generateBtn");

  try {
    button.disabled = true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Analyzing Video...";

    updatePipeline(0, "Uploading video");

    const formData = new FormData();

    formData.append(
      "video",
      selectedVideo,
      selectedVideo.name
    );

    formData.append(
      "duration",
      $("#duration")?.value || "90 seconds"
    );

    formData.append(
      "language",
      $("#language")?.value || "Burmese"
    );

    formData.append(
      "style",
      $("#style")?.value || "Cinematic"
    );

    formData.append(
      "aspectRatio",
      $("#ratio")?.value || "9:16"
    );

    formData.append(
      "instructions",
      $("#prompt")?.value || ""
    );

    updatePipeline(1, "Gemini is analyzing video");

    const response = await fetch(
      `${API_BASE}/api/recap`,
      {
        method: "POST",
        body: formData
      }
    );

    updatePipeline(2, "Writing AI recap");

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "Server returned an invalid response."
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        `Server error: ${response.status}`
      );
    }

    updatePipeline(3, "Preparing recap data");

    displayRecap(result);

    updatePipeline(4, "Preparing subtitles");

    await wait(400);

    updatePipeline(5, "Complete");

    finishPipeline();

    showToast(
      "AI recap generated successfully."
    );

  } catch (error) {
    console.error(
      "SUN SPY RECAP ERROR:",
      error
    );

    if ($("#pipelineStatus")) {
      $("#pipelineStatus").textContent =
        "Failed";
    }

    steps.forEach((step) => {
      step.classList.remove("active");
    });

    showToast(
      error.message ||
      "Failed to generate recap."
    );

  } finally {
    button.disabled = false;

    button.textContent =
      button.dataset.originalText ||
      "Generate Recap";
  }
});

/* =========================
   Wait Helper
========================= */

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* =========================
   Navigation
========================= */

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-item")
      .forEach((item) => {
        item.classList.remove("active");
      });

    button.classList.add("active");

    const page =
      button.dataset.page;

    const label =
      button.querySelector("span")?.textContent ||
      "Create Recap";

    if (page !== "studio") {
      if ($("#pageTitle")) {
        $("#pageTitle").textContent = label;
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

    $("#sidebar")?.classList.remove("open");
  });
});

/* =========================
   Mobile Menu
========================= */

$("#mobileMenu")?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("open");
});

/* =========================
   Startup
========================= */

console.log(
  "SUN SPY RECAP V2 frontend loaded."
);

console.log(
  "Backend:",
  API_BASE
);
