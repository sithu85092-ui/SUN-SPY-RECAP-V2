const API_BASE =
  "https://sun-spy-recap-v2.onrender.com";

const $ = (s) =>
  document.querySelector(s);

let selectedVideo = null;
let logoFile = null;
let currentRecap = null;
let finalVideoUrl = null;

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
    message;

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

    return Number.isFinite(
      custom
    ) &&
      custom > 0
      ? custom
      : 90;
  }

  const match =
    text.match(
      /(\d+(?:\.\d+)?)/
    );

  if (!match)
    return 90;

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


function getBackendUrl(
  url
) {
  if (!url)
    return "";

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
      status;
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
   VIDEO
===================================================== */

function setVideo(file) {
  if (!file)
    return;

  if (
    !file.type.startsWith(
      "video/"
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


videoInput?.addEventListener(
  "change",
  e => {
    setVideo(
      e.target.files[0]
    );
  }
);


/* Drag Drop */

[
  "dragenter",
  "dragover"
].forEach(
  eventName => {
    dropzone?.addEventListener(
      eventName,
      e => {
        e.preventDefault();
        e.stopPropagation();

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
      e => {
        e.preventDefault();
        e.stopPropagation();

        dropzone.classList.remove(
          "dragging"
        );
      }
    );
  }
);


dropzone?.addEventListener(
  "drop",
  e => {
    const file =
      e.dataTransfer
        .files[0];

    if (file) {
      setVideo(
        file
      );
    }
  }
);


/* Remove */

$("#removeVideo")
  ?.addEventListener(
    "click",
    () => {
      selectedVideo =
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
    e => {
      const file =
        e.target.files[0];

      if (!file)
        return;

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
          `<img src="${url}" alt="Logo preview">`;
      }

      showToast(
        "Custom logo added."
      );
    }
  );


/* =====================================================
   RESET
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

  if (panel)
    return panel;

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

              return `${character.name || "Unknown"} — ${character.role || ""}`;
            }
          )
          .join(
            ", "
          )
      : (
          data.characters ||
          ""
        );

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
            <p>${escapeHtml(
              hook
            )}</p>
          </div>
        `
        : ""
    }

    ${
      summary
        ? `
          <div style="margin-bottom:18px;">
            <strong>Summary</strong>
            <p>${escapeHtml(
              summary
            )}</p>
          </div>
        `
        : ""
    }

    ${
      characters
        ? `
          <div style="margin-bottom:18px;">
            <strong>Characters</strong>
            <p>${escapeHtml(
              characters
            )}</p>
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
              ${escapeHtml(
                script
              )}
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
            <p>${escapeHtml(
              ending
            )}</p>
          </div>
        `
        : ""
    }

    ${
      hashtags
        ? `
          <div>
            <strong>Hashtags</strong>
            <p>${escapeHtml(
              hashtags
            )}</p>
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

  panel.innerHTML = `
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
        ${escapeHtml(
          message
        )}
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
        cache:
          "no-store"
      }
    );

  const data =
    await response.json();

  console.log(
    "SUN SPY BACKEND:",
    data
  );

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
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
        cache:
          "no-store"
      }
    );

  const data =
    await response.json();

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
   POLL JOB
===================================================== */

async function waitForRecapJob(
  jobId
) {
  let lastMessage =
    "";

  while (true) {
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

    if (
      job.step ===
      "Upload"
    ) {
      updatePipeline(
        1,
        message
      );
    }

    else if (
      job.step ===
      "Processing"
    ) {
      updatePipeline(
        2,
        message
      );
    }

    else if (
      job.step ===
      "Analyzing"
    ) {
      updatePipeline(
        2,
        message
      );
    }

    else if (
      job.step ===
      "Recap"
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
      return job;
    }

    if (
      job.status ===
      "failed"
    ) {
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

        /* ---------------------------------------------
           HEALTH
        --------------------------------------------- */

        button.textContent =
          "Connecting...";

        updatePipeline(
          0,
          "Waking SUN SPY backend..."
        );

        await testBackend();

        /* ---------------------------------------------
           FORM DATA
        --------------------------------------------- */

        const formData =
          new FormData();

        formData.append(
          "video",
          selectedVideo,
          selectedVideo.name
        );

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

        /* ---------------------------------------------
           CREATE BACKGROUND JOB
        --------------------------------------------- */

        button.textContent =
          "Starting AI...";

        updatePipeline(
          1,
          "Creating AI recap job..."
        );

        const created =
          await postFormData(
            "/api/recap",
            formData
          );

        if (
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

        /* ---------------------------------------------
           POLL
        --------------------------------------------- */

        button.textContent =
          "AI Analyzing...";

        const completed =
          await waitForRecapJob(
            created.jobId
          );

        currentRecap =
          completed.recap;

        displayRecap(
          completed.recap
        );

        /* ---------------------------------------------
           FFmpeg
        --------------------------------------------- */

        button.textContent =
          "Rendering MP4...";

        updatePipeline(
          3,
          "FFmpeg is rendering your video..."
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
          "aspectRatio",
          aspectRatio
        );

        processData.append(
          "resolution",
          resolution
        );

        updatePipeline(
          4,
          "Rendering final MP4..."
        );

        const processed =
          await postFormData(
            "/api/process-video",
            processData
          );

        const output =
          processed.outputUrl ||
          processed.videoUrl ||
          processed.url ||
          processed.file ||
          processed.path;

        if (!output) {
          throw new Error(
            "FFmpeg completed but no video URL was returned."
          );
        }

        /* ---------------------------------------------
           COMPLETE
        --------------------------------------------- */

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
   MOBILE
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
  "Background Job System: ENABLED"
);

console.log(
  "Backend:",
  API_BASE
);

console.log(
  "========================================"
);
