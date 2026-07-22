const documents = [
  ["Verification report", "docs/05-testing/FIRST_RUN_VERIFICATION_REPORT.md"],
  ["CNC / waterjet / profiling", "docs/03-workflows/CNC_WATERJET_PROFILING_CONTROL.md"],
  ["Fabrication workflow", "docs/03-workflows/FABRICATION_AND_SPOOL_CONTROL.md"],
  ["Functional requirements", "docs/01-requirements/FUNCTIONAL_REQUIREMENTS.md"],
  ["Roles & permissions", "docs/01-requirements/USER_ROLES.md"],
  ["Expansion acceptance", "docs/01-requirements/EXPANSION_ACCEPTANCE_CRITERIA.md"],
  ["Domain & permission model", "docs/02-architecture/PRODUCTION_DOMAIN_AND_PERMISSION_MODEL.md"],
  ["Traceability matrix", "docs/05-testing/REQUIREMENTS_TRACEABILITY_MATRIX.md"],
  ["Controlled expansion change", "docs/00-program/CONTROLLED_CHANGE_2026-07-21_ENTERPRISE_EXPANSION.md"],
];

const selector = document.querySelector("#document-select");
const paper = document.querySelector("#document");
const sourceName = document.querySelector("#source-name");
const sourcePath = document.querySelector("#source-path");
const refreshState = document.querySelector("#refresh-state");
let priorSource = "";

for (const [label, path] of documents) {
  const option = document.createElement("option");
  option.value = path;
  option.textContent = label;
  selector.append(option);
}

const requested = new URLSearchParams(location.search).get("doc");
selector.value = documents.some(([, path]) => path === requested) ? requested : documents[0][1];

function cells(line) {
  return line.trim().replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim());
}

function appendTextElement(parent, tagName, text, className = "") {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function render(source) {
  paper.replaceChildren();
  const lines = source.replaceAll("\r", "").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading) {
      appendTextElement(paper, `h${heading[1].length}`, heading[2]);
      index += 1;
      continue;
    }
    if (line.startsWith("|") && lines[index + 1]?.match(/^\|?\s*:?-+/u)) {
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const value of cells(line)) appendTextElement(headRow, "th", value);
      head.append(headRow); table.append(head); index += 2;
      const body = document.createElement("tbody");
      while (index < lines.length && lines[index].startsWith("|")) {
        const row = document.createElement("tr");
        for (const value of cells(lines[index])) appendTextElement(row, "td", value);
        body.append(row); index += 1;
      }
      table.append(body); const frame = document.createElement("div"); frame.className = "table-frame"; frame.append(table); paper.append(frame);
      continue;
    }
    if (/^[-*]\s+/u.test(line)) {
      const list = document.createElement("ul");
      while (index < lines.length && /^[-*]\s+/u.test(lines[index])) {
        appendTextElement(list, "li", lines[index].replace(/^[-*]\s+/u, "")); index += 1;
      }
      paper.append(list); continue;
    }
    if (/^\d+\.\s+/u.test(line)) {
      const list = document.createElement("ol");
      while (index < lines.length && /^\d+\.\s+/u.test(lines[index])) {
        appendTextElement(list, "li", lines[index].replace(/^\d+\.\s+/u, "")); index += 1;
      }
      paper.append(list); continue;
    }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim(); const values = []; index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) { values.push(lines[index]); index += 1; }
      index += 1; appendTextElement(paper, "pre", values.join("\n"), language ? `language-${language}` : ""); continue;
    }
    const paragraph = [line.trim()]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^[-*]\s|^\d+\.\s|^\||^```/u.test(lines[index])) {
      paragraph.push(lines[index].trim()); index += 1;
    }
    appendTextElement(paper, "p", paragraph.join(" "));
  }
}

async function refresh() {
  const path = selector.value;
  const label = documents.find(([, itemPath]) => itemPath === path)?.[0] ?? "Controlled document";
  try {
    const response = await fetch(`/${path}?time=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Source unavailable (${response.status})`);
    const source = await response.text();
    if (source !== priorSource) { render(source); priorSource = source; refreshState.textContent = `Rendered ${new Date().toLocaleTimeString()}`; }
    else refreshState.textContent = `Watching · ${new Date().toLocaleTimeString()}`;
    sourceName.textContent = label; sourcePath.textContent = path;
  } catch (error) {
    refreshState.textContent = error instanceof Error ? error.message : "Source unavailable";
  }
}

selector.addEventListener("change", () => {
  priorSource = "";
  const url = new URL(location.href); url.searchParams.set("doc", selector.value); history.replaceState(null, "", url);
  void refresh();
});
void refresh();
setInterval(() => void refresh(), 2_000);
