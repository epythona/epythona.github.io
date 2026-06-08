(function () {
  const state = {
    files: [],
    mode: "idle",
    objectUrls: []
  };

  const els = {
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    detectedMode: document.getElementById("detectedMode"),
    fileList: document.getElementById("fileList"),
    convertButton: document.getElementById("convertButton"),
    clearButton: document.getElementById("clearButton"),
    statusBox: document.getElementById("statusBox"),
    downloads: document.getElementById("downloads"),
    quality: document.getElementById("imageQuality"),
    qualityValue: document.getElementById("qualityValue"),
    startButton: document.getElementById("startButton"),
    startMenu: document.getElementById("startMenu"),
    tabButtons: document.querySelectorAll(".tab-button"),
    panels: document.querySelectorAll(".panel")
  };

  const modeLabels = {
    idle: "대기 중",
    imagesToPdf: "이미지 → PDF",
    pdfToImages: "PDF → 이미지",
    mixed: "지원 형식 혼합됨"
  };

  const converters = {
    imagesToPdf: convertImagesToPdf,
    pdfToImages: convertPdfToImages
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindTabs();
    bindStartMenu();
    bindUploader();
    bindControls();
    updateQualityLabel();
  }

  function bindTabs() {
    els.tabButtons.forEach((button) => {
      button.addEventListener("click", () => showPanel(button.dataset.panel));
    });
  }

  function bindStartMenu() {
    els.startButton.addEventListener("click", () => {
      const willOpen = els.startMenu.hasAttribute("hidden");
      els.startMenu.toggleAttribute("hidden", !willOpen);
      els.startButton.setAttribute("aria-expanded", String(willOpen));
    });

    els.startMenu.querySelectorAll("[data-panel-target]").forEach((button) => {
      button.addEventListener("click", () => {
        showPanel(button.dataset.panelTarget);
        els.startMenu.setAttribute("hidden", "");
        els.startButton.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", (event) => {
      if (els.startMenu.hidden) return;
      if (els.startMenu.contains(event.target) || els.startButton.contains(event.target)) return;
      els.startMenu.setAttribute("hidden", "");
      els.startButton.setAttribute("aria-expanded", "false");
    });
  }

  function bindUploader() {
    els.fileInput.addEventListener("change", (event) => {
      setFiles(Array.from(event.target.files || []));
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragging");
      });
    });

    els.dropZone.addEventListener("drop", (event) => {
      setFiles(Array.from(event.dataTransfer.files || []));
    });
  }

  function bindControls() {
    els.quality.addEventListener("input", updateQualityLabel);
    els.convertButton.addEventListener("click", runConversion);
    els.clearButton.addEventListener("click", clearAll);
  }

  function showPanel(panelId) {
    els.tabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.panel === panelId);
    });

    els.panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === panelId);
    });
  }

  function setFiles(files) {
    cleanupObjectUrls();
    state.files = files.filter(isSupportedFile);
    state.mode = detectMode(state.files);
    renderFileList();
    renderMode();
    els.downloads.innerHTML = "";

    if (!files.length) {
      setStatus("파일을 선택하면 자동으로 변환 방향을 감지합니다.");
      return;
    }

    if (!state.files.length) {
      setStatus("지원하는 파일 형식은 JPG, PNG, WebP, PDF입니다.");
      return;
    }

    if (state.mode === "mixed") {
      setStatus("이미지와 PDF가 함께 선택되었습니다. 한 번에 한 종류의 파일만 선택해 주세요.");
      return;
    }

    setStatus("변환할 준비가 되었습니다.");
  }

  function detectMode(files) {
    if (!files.length) return "idle";

    const imageCount = files.filter((file) => file.type.startsWith("image/")).length;
    const pdfCount = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")).length;

    if (imageCount && !pdfCount) return "imagesToPdf";
    if (pdfCount === 1 && !imageCount) return "pdfToImages";
    return "mixed";
  }

  function renderMode() {
    els.detectedMode.textContent = modeLabels[state.mode] || modeLabels.idle;
    els.convertButton.disabled = !converters[state.mode];
  }

  function renderFileList() {
    if (!state.files.length) {
      els.fileList.innerHTML = '<li class="empty">아직 선택된 파일이 없습니다.</li>';
      return;
    }

    els.fileList.innerHTML = state.files.map((file) => {
      return `<li><span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><span>${formatBytes(file.size)}</span></li>`;
    }).join("");
  }

  async function runConversion() {
    const converter = converters[state.mode];
    if (!converter) return;

    els.convertButton.disabled = true;
    els.downloads.innerHTML = "";
    setStatus("변환 중입니다. 파일 크기와 페이지 수에 따라 시간이 걸릴 수 있습니다.");

    try {
      await converter(state.files);
      setStatus("변환이 완료되었습니다. 아래 다운로드 버튼을 눌러 저장하세요.");
    } catch (error) {
      console.error(error);
      setStatus("변환 중 문제가 발생했습니다. 파일이 손상되었거나 브라우저에서 처리하기 어려운 형식일 수 있습니다.");
    } finally {
      els.convertButton.disabled = !converters[state.mode];
    }
  }

  async function convertImagesToPdf(files) {
    const jsPdfFactory = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfFactory) {
      throw new Error("jsPDF library is not loaded.");
    }

    const pdf = new jsPdfFactory({ unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;

    for (let index = 0; index < files.length; index += 1) {
      const image = await readImage(files[index]);
      if (index > 0) pdf.addPage();

      const bounds = fitIntoBox(image.width, image.height, pageWidth - margin * 2, pageHeight - margin * 2);
      const x = (pageWidth - bounds.width) / 2;
      const y = (pageHeight - bounds.height) / 2;
      const dataUrl = await imageToDataUrl(image, Number(els.quality.value));
      pdf.addImage(dataUrl, "JPEG", x, y, bounds.width, bounds.height);
    }

    const blob = pdf.output("blob");
    addDownload(blob, "xp-converter-images.pdf", "PDF 다운로드");
  }

  async function convertPdfToImages(files) {
    const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

    const data = await files[0].arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const scale = 2;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus(`${pdf.numPages}페이지 중 ${pageNumber}페이지를 이미지로 변환 중입니다.`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas, "image/png");
      addDownload(blob, `xp-converter-page-${String(pageNumber).padStart(2, "0")}.png`, `페이지 ${pageNumber} PNG 다운로드`);
    }
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      state.objectUrls.push(url);

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  function imageToDataUrl(image, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return Promise.resolve(canvas.toDataURL("image/jpeg", quality));
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas conversion failed."));
      }, type);
    });
  }

  function fitIntoBox(width, height, maxWidth, maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: width * ratio,
      height: height * ratio
    };
  }

  function addDownload(blob, filename, label) {
    const url = URL.createObjectURL(blob);
    state.objectUrls.push(url);

    const link = document.createElement("a");
    link.className = "download-link";
    link.href = url;
    link.download = filename;
    link.innerHTML = `<span>${escapeHtml(label)}</span><span>${escapeHtml(filename)}</span>`;
    els.downloads.appendChild(link);
  }

  function clearAll() {
    cleanupObjectUrls();
    state.files = [];
    state.mode = "idle";
    els.fileInput.value = "";
    els.downloads.innerHTML = "";
    renderFileList();
    renderMode();
    setStatus("파일을 선택하면 자동으로 변환 방향을 감지합니다.");
  }

  function cleanupObjectUrls() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls = [];
  }

  function updateQualityLabel() {
    els.qualityValue.textContent = `${Math.round(Number(els.quality.value) * 100)}%`;
  }

  function setStatus(message) {
    els.statusBox.textContent = message;
  }

  function isSupportedFile(file) {
    return file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, power);
    return `${value.toFixed(value >= 10 || power === 0 ? 0 : 1)} ${units[power]}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
