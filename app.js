const STORAGE_KEY = "personal-wiki-items";

const state = {
  items: [],
  filtered: [],
  activeId: null,
};

const elements = {
  fileInput: document.getElementById("file-input"),
  searchInput: document.getElementById("search-input"),
  list: document.getElementById("wiki-list"),
  page: document.getElementById("wiki-page"),
  stats: document.getElementById("stats"),
  clearButton: document.getElementById("clear-button"),
  listItemTemplate: document.getElementById("list-item-template"),
  pageTemplate: document.getElementById("page-template"),
};

const supportedFileTypes = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/json",
];

const loadState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.items = parsed;
      state.filtered = [...state.items];
      state.activeId = state.items[0]?.id ?? null;
    }
  } catch (error) {
    console.warn("Unable to load wiki data", error);
  }
};

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
};

const formatDate = (value) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

const extractSummary = (text) => {
  if (!text) return "No summary available.";
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(" ").slice(0, 220);
};

const extractTags = (text) => {
  const words = normalizeText(text).toLowerCase().split(" ");
  const tagCounts = words.reduce((acc, word) => {
    if (word.length < 5) return acc;
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
};

const synthesizePage = ({ name, content, type }) => {
  const cleanText = normalizeText(content);
  return {
    id: crypto.randomUUID(),
    title: name.replace(/\.[^/.]+$/, ""),
    summary: extractSummary(cleanText),
    tags: extractTags(cleanText),
    body: cleanText || "No readable text was found in this file.",
    type,
    updatedAt: new Date().toISOString(),
  };
};

const renderList = () => {
  elements.list.innerHTML = "";
  state.filtered.forEach((item) => {
    const fragment = elements.listItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    const title = fragment.querySelector("h3");
    const description = fragment.querySelector("p");
    const meta = fragment.querySelector(".wiki-list__meta");

    button.dataset.id = item.id;
    if (item.id === state.activeId) {
      button.classList.add("wiki-list__item--active");
    }

    title.textContent = item.title;
    description.textContent = item.summary;
    meta.textContent = formatDate(item.updatedAt);
    elements.list.appendChild(fragment);
  });
};

const renderPage = () => {
  elements.page.innerHTML = "";
  const active = state.items.find((item) => item.id === state.activeId);
  if (!active) {
    elements.page.innerHTML = `
      <div class="empty-state">
        <h2>No matching pages</h2>
        <p>Try adjusting your search or upload more files to grow your wiki.</p>
      </div>
    `;
    return;
  }

  const fragment = elements.pageTemplate.content.cloneNode(true);
  fragment.querySelector("h2").textContent = active.title;
  fragment.querySelector(".wiki-page__summary").textContent = active.summary;
  const tagsContainer = fragment.querySelector(".wiki-page__tags");
  tagsContainer.innerHTML = active.tags
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");
  fragment.querySelector(".wiki-page__body").textContent = active.body;
  elements.page.appendChild(fragment);
};

const renderStats = () => {
  elements.stats.textContent = `${state.filtered.length} of ${state.items.length} pages`;
};

const render = () => {
  renderList();
  renderPage();
  renderStats();
};

const updateSearch = () => {
  const query = elements.searchInput.value.toLowerCase();
  if (!query) {
    state.filtered = [...state.items];
  } else {
    state.filtered = state.items.filter((item) => {
      const haystack = [item.title, item.summary, item.body, item.tags.join(" ")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }
  state.activeId = state.filtered[0]?.id ?? null;
  render();
};

const readFile = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result?.toString() ?? "");
    reader.onerror = () => resolve("");

    if (file.type === "application/pdf") {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });

const handleFiles = async (files) => {
  const fileList = Array.from(files).filter(
    (file) => supportedFileTypes.includes(file.type) || file.type.startsWith("text/")
  );
  if (!fileList.length) return;

  for (const file of fileList) {
    const content = await readFile(file);
    const synthesized = synthesizePage({
      name: file.name,
      content,
      type: file.type,
    });
    state.items.unshift(synthesized);
  }

  state.filtered = [...state.items];
  state.activeId = state.items[0]?.id ?? null;
  saveState();
  render();
};

const handleListClick = (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  state.activeId = button.dataset.id;
  render();
};

const clearWiki = () => {
  state.items = [];
  state.filtered = [];
  state.activeId = null;
  saveState();
  render();
};

loadState();
render();

if (elements.fileInput) {
  elements.fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  });
}

if (elements.searchInput) {
  elements.searchInput.addEventListener("input", updateSearch);
}

if (elements.list) {
  elements.list.addEventListener("click", handleListClick);
}

if (elements.clearButton) {
  elements.clearButton.addEventListener("click", clearWiki);
}
