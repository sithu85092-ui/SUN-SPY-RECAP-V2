const $ = (s) => document.querySelector(s);

const videoInput = $("#videoInput");
const videoPreview = $("#videoPreview");
const videoWrap = $("#videoWrap");
const dropzone = $("#dropzone");
const readyText = $("#readyText");
const toast = $("#toast");

function showToast(message){
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),2200);
}

function setVideo(file){
  if(!file) return;
  if(!file.type.startsWith("video/")) return showToast("Please choose a video file.");
  const url = URL.createObjectURL(file);
  videoPreview.src = url;
  $("#videoName").textContent = file.name;
  $("#videoInfo").textContent = `${(file.size/1024/1024).toFixed(1)} MB · Ready`;
  dropzone.classList.add("hidden");
  videoWrap.classList.remove("hidden");
  readyText.textContent = "Video loaded. Configure your recap settings.";
  showToast("Video loaded successfully.");
}
videoInput.addEventListener("change", e => setVideo(e.target.files[0]));

["dragenter","dragover"].forEach(ev => dropzone.addEventListener(ev,e=>{
  e.preventDefault(); dropzone.classList.add("dragging");
}));
["dragleave","drop"].forEach(ev => dropzone.addEventListener(ev,e=>{
  e.preventDefault(); dropzone.classList.remove("dragging");
}));
dropzone.addEventListener("drop", e => setVideo(e.dataTransfer.files[0]));

$("#removeVideo").addEventListener("click",()=>{
  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoInput.value="";
  videoWrap.classList.add("hidden");
  dropzone.classList.remove("hidden");
  readyText.textContent="Upload a video to begin.";
});

$("#logoInput").addEventListener("change", e=>{
  const file=e.target.files[0];
  if(!file) return;
  const url=URL.createObjectURL(file);
  $("#logoPreview").innerHTML=`<img src="${url}" alt="Logo preview">`;
  showToast("Custom logo added.");
});

$("#resetSettings").addEventListener("click",()=>{
  $("#duration").value="90 seconds";
  $("#language").value="Burmese";
  $("#voice").selectedIndex=0;
  $("#ratio").selectedIndex=0;
  $("#resolution").value="1080p";
  $("#style").selectedIndex=0;
  $("#prompt").value="";
  showToast("Settings reset.");
});

const steps=[...document.querySelectorAll(".step")];
$("#generateBtn").addEventListener("click",()=>{
  if(videoWrap.classList.contains("hidden")) return showToast("Upload a video first.");
  let i=0;
  $("#pipelineStatus").textContent="Preparing";
  const timer=setInterval(()=>{
    steps.forEach((s,n)=>{
      s.classList.toggle("active",n===i);
      if(n<i) s.classList.add("done");
    });
    $("#pipelineStatus").textContent=["Uploading","Analyzing","Writing recap","Preparing voice","Preparing subtitles","Rendering"][i];
    i++;
    if(i>=steps.length){
      clearInterval(timer);
      steps.forEach(s=>s.classList.add("done"));
      $("#pipelineStatus").textContent="Ready for backend";
      showToast("Studio flow complete — backend is the next phase.");
    }
  },500);
});

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    const page=btn.dataset.page;
    if(page!=="studio"){
      $("#pageTitle").textContent=btn.querySelector("span").textContent;
      showToast(`${btn.querySelector("span").textContent} module is ready for Phase 2.`);
    }else $("#pageTitle").textContent="Create Recap";
    $("#sidebar").classList.remove("open");
  });
});
$("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));