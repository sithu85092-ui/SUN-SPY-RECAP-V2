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

function showToast(message) {
if (!toast) return;
toast.textContent = message;
toast.classList.add("show");
setTimeout(() => toast.classList.remove("show"), 3000);
}

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
"${(file.size / 1024 / 1024).toFixed(1)} MB · Ready";
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
if (file) setVideo(file);
});

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

$("#logoInput")?.addEventListener("change", (e) => {
const file = e.target.files[0];
if (!file) return;

if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
showToast("Logo must be PNG, JPG or WEBP.");
return;
}

logoFile = file;

const url = URL.createObjectURL(file);

if ($("#logoPreview")) {
$("#logoPreview").innerHTML =
"<img src="${url}" alt="Logo preview">";
}

showToast("Custom logo added.");
});

$("#resetSettings")?.addEventListener("click", () => {
if ($("#duration")) $("#duration").value = "90 seconds";
if ($("#language")) $("#language").value = "Burmese";
if ($("#voice")) $("#voice").selectedIndex = 0;
if ($("#ratio")) $("#ratio").selectedIndex = 0;
if ($("#resolution")) $("#resolution").value = "1080p";
if ($("#style")) $("#style").selectedIndex = 0;
if ($("#prompt")) $("#prompt").value = "";

showToast("Settings reset.");
});

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

function escapeHtml(value) {
return String(value)
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

function getResultPanel() {
let panel = $("#recapResult");

if (panel) return panel;

panel = document.createElement("section");

panel.id = "recapResult";

panel.style.marginTop = "24px";
panel.style.padding = "24px";
panel.style.borderRadius = "18px";
panel.style.background = "rgba(255,255,255,0.05)";
panel.style.border = "1px solid rgba(255,255,255,0.1)";

const content = $("#appContent") || document.body;

content.appendChild(panel);

return panel;
}

function displayRecap(data) {
const panel = getResultPanel();

const title = data.title || "SUN SPY AI Recap";
const hook = data.hook || "";
const summary = data.summary || "";
const script = data.recap_script || "";
const ending = data.ending || "";

const hashtags = Array.isArray(data.hashtags)
? data.hashtags.join(" ")
: (data.hashtags || "");

const characters = Array.isArray(data.characters)
? data.characters.join(", ")
: (data.characters || "");

panel.innerHTML = `
<div style="margin-bottom:20px;">
<div style="font-size:12px;opacity:.6;text-transform:uppercase;">
Gemini AI Result
</div>

  <h2 style="margin:5px 0 0;">
    ${escapeHtml(title)}
  </h2>
</div>

${hook ? `
  <div style="margin-bottom:18px;">
    <strong>Hook</strong>
    <p>${escapeHtml(hook)}</p>
  </div>
` : ""}

${summary ? `
  <div style="margin-bottom:18px;">
    <strong>Summary</strong>
    <p>${escapeHtml(summary)}</p>
  </div>
` : ""}

${characters ? `
  <div style="margin-bottom:18px;">
    <strong>Characters</strong>
    <p>${escapeHtml(characters)}</p>
  </div>
` : ""}

${script ? `
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
` : ""}

${ending ? `
  <div style="margin-bottom:18px;">
    <strong>Ending / CTA</strong>
    <p>${escapeHtml(ending)}</p>
  </div>
` : ""}

${hashtags ? `
  <div>
    <strong>Hashtags</strong>
    <p>${escapeHtml(hashtags)}</p>
  </div>
` : ""}

`;

panel.scrollIntoView({
behavior: "smooth",
block: "start"
});
}

/* =========================
BACKEND CONNECTION TEST
========================= */

async function testBackend() {
try {
const response = await fetch("${API_BASE}/api/health", {
method: "GET",
cache: "no-store"
});

const data = await response.json();

console.log("SUN SPY BACKEND:", data);

if (!response.ok || !data.ok) {
  throw new Error("Backend health check failed.");
}

return data;

} catch (error) {
console.error("BACKEND CONNECTION ERROR:", error);
throw new Error(
"Cannot connect to SUN SPY backend. Please check Render."
);
}
}

/* =========================
GENERATE RECAP
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
  "Connecting...";

updatePipeline(
  0,
  "Checking SUN SPY backend..."
);

/* Test backend first */

const health = await testBackend();

console.log(
  "Backend connected:",
  health
);

button.textContent =
  "Uploading Video...";

updatePipeline(
  0,
  "Uploading video to SUN SPY..."
);

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
  $("#style")?.value || "Cinematic Story"
);

formData.append(
  "aspectRatio",
  $("#ratio")?.value || "9:16"
);

formData.append(
  "instructions",
  $("#prompt")?.value || ""
);

updatePipeline(
  1,
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

const controller =
  new AbortController();

const timeout =
  setTimeout(() => {
    controller.abort();
  }, 180000);

let response;

try {
  response = await fetch(
    `${API_BASE}/api/recap`,
    {
      method: "POST",
      body: formData,
      signal: controller.signal
    }
  );
} finally {
  clearTimeout(timeout);
}

console.log(
  "HTTP STATUS:",
  response.status
);

const rawText =
  await response.text();

console.log(
  "SERVER RESPONSE:",
  rawText
);

let result;

try {
  result = JSON.parse(rawText);
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

updatePipeline(
  2,
  "AI recap generated..."
);

displayRecap(result);

updatePipeline(
  3,
  "Preparing recap..."
);

await wait(500);

updatePipeline(
  4,
  "Preparing subtitles..."
);

await wait(500);

finishPipeline();

showToast(
  "AI recap generated successfully!"
);

} catch (error) {

console.error(
  "SUN SPY RECAP ERROR:",
  error
);

let message =
  error?.message ||
  "Failed to generate recap.";

if (error?.name === "AbortError") {
  message =
    "Request timed out. Render or Gemini took too long.";
}

if (
  message.includes("Failed to fetch")
) {
  message =
    "Network/CORS error. Frontend cannot reach Render.";
}

if ($("#pipelineStatus")) {
  $("#pipelineStatus").textContent =
    "Failed";
}

steps.forEach((step) => {
  step.classList.remove("active");
});

showToast(message);

/* Make error visible */

const panel =
  getResultPanel();

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
      Open Browser Console for detailed debugging.
    </p>
  </div>
`;

} finally {

button.disabled = false;

button.textContent =
  button.dataset.originalText ||
  "Generate Recap";

}
});

function wait(ms) {
return new Promise(
(resolve) => setTimeout(resolve, ms)
);
}

/* =========================
NAVIGATION
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

$("#sidebar")?.classList.remove("open");

});

});

/* =========================
MOBILE MENU
========================= */

$("#mobileMenu")?.addEventListener("click", () => {
$("#sidebar")?.classList.toggle("open");
});

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
