const pdfjsLib = window.pdfjsLib;

if (!pdfjsLib) {
  throw new Error("PDF.js failed to load. Check your internet connection or script path.");
}

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";

const STORAGE_KEY = "paper-pdf-manager-items";

const state = {
  items: [],
  filtered: [],
};

const elements = {
  fileInput: document.getElementById("file-input"),
  clearButton: document.getElementById("clear-button"),
  searchInput: document.getElementById("search-input"),
  stats: document.getElementById("stats"),
  papersBody: document.getElementById("papers-body"),
  rowTemplate: document.getElementById("paper-row-template"),
};

const formatDate = (value) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const loadState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.items = parsed;
      state.filtered = [...parsed];
    }
  } catch (error) {
    console.warn("Unable to load saved PDF library", error);
  }
};

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
};

const readAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });

const toDataUrl = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
};

const generateThumbnailAndPages = async (arrayBuffer) => {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const firstPage = await pdf.getPage(1);

  const viewport = firstPage.getViewport({ scale: 0.35 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await firstPage.render({ canvasContext: context, viewport }).promise;

  return {
    pageCount: pdf.numPages,
    thumbnailDataUrl: canvas.toDataURL("image/jpeg", 0.82),
  };
};

const createPaperRecord = async (file) => {
  const arrayBuffer = await readAsArrayBuffer(file);
  const pdfDataUrl = toDataUrl(arrayBuffer);
  const { pageCount, thumbnailDataUrl } = await generateThumbnailAndPages(arrayBuffer);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    title: file.name.replace(/\.pdf$/i, ""),
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    uploadedAt: new Date().toISOString(),
    pageCount,
    thumbnailDataUrl,
    pdfDataUrl,
  };
};

const renderStats = () => {
  elements.stats.textContent = `${state.filtered.length} of ${state.items.length} papers`;
}

const renderTable = () => {
  elements.papersBody.innerHTML = "";

  if (!state.filtered.length) {
    elements.papersBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No papers match your search. Try another query or upload more PDFs.</td>
      </tr>
    `;
    return;
  }

  state.filtered.forEach((item) => {
    const fragment = elements.rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector("tr");
    row.querySelector(".thumb").src = item.thumbnailDataUrl;
    row.querySelector(".paper-title").textContent = item.title;
    row.querySelector(".paper-meta").textContent = `File: ${item.name} • Modified: ${formatDate(
      item.lastModified
    )}`;
    row.querySelector(".paper-pages").textContent = String(item.pageCount);
    row.querySelector(".paper-size").textContent = formatSize(item.size);
    row.querySelector(".paper-uploaded").textContent = formatDate(item.uploadedAt);

    const openLink = row.querySelector("a");
    openLink.href = item.pdfDataUrl;
    openLink.setAttribute("aria-label", `Open ${item.name}`);

    elements.papersBody.appendChild(fragment);
  });
};

const render = () => {
  renderTable();
  renderStats();
};

const applySearch = () => {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) {
    state.filtered = [...state.items];
  } else {
    state.filtered = state.items.filter((item) => {
      const haystack = [
        item.title,
        item.name,
        item.type,
        String(item.pageCount),
        formatDate(item.uploadedAt),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }
  render();
};

const handleUpload = async (files) => {
  const pdfFiles = Array.from(files).filter((file) => file.type === "application/pdf");
  if (!pdfFiles.length) return;

  for (const file of pdfFiles) {
    try {
      const paper = await createPaperRecord(file);
      state.items.unshift(paper);
    } catch (error) {
      console.warn(`Skipping file ${file.name}. Could not process PDF.`, error);
    }
  }

  state.filtered = [...state.items];
  saveState();
  render();
};

const clearLibrary = () => {
  state.items = [];
  state.filtered = [];
  saveState();
  render();
};

loadState();
render();

elements.fileInput?.addEventListener("change", (event) => {
  handleUpload(event.target.files);
  event.target.value = "";
});

elements.clearButton?.addEventListener("click", clearLibrary);
elements.searchInput?.addEventListener("input", applySearch);
