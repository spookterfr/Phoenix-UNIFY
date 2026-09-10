/*  PAGE SWITCHING*/
const pages = Array.from(document.querySelectorAll(".page"));
const homeButton = document.querySelector(".home-button");
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const allNavLinks = [homeButton, ...navItems];

function showPage(name) {
  pages.forEach((p) => { p.hidden = p.dataset.page !== name; });
  allNavLinks.forEach((l) => l.classList.toggle("active", l.dataset.page === name));
}

function activateFromHash() {
  const name = (window.location.hash || "#home").slice(1);
  const valid = allNavLinks.some((l) => l.dataset.page === name);
  showPage(valid ? name : "home");
}

allNavLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", link.getAttribute("href"));
    showPage(link.dataset.page);
  });
});
window.addEventListener("hashchange", activateFromHash);
activateFromHash();

/* Keep the round Home button the same height as the pill next to it */
const bottomNav = document.querySelector(".bottom-nav");
function syncHomeButtonSize() {
  const h = bottomNav.getBoundingClientRect().height;
  if (h > 0) { homeButton.style.width = h + "px"; homeButton.style.height = h + "px"; }
}
syncHomeButtonSize();
requestAnimationFrame(syncHomeButtonSize);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHomeButtonSize);
window.addEventListener("resize", syncHomeButtonSize);
window.addEventListener("orientationchange", syncHomeButtonSize);

/* LIQUID GLASS DRAG INDICATOR */
const navInner = document.querySelector(".nav-inner");
const indicator = document.createElement("div");
indicator.className = "glass-indicator";
navInner.appendChild(indicator);

const DRAG_THRESHOLD = 6, EASE = 0.22, MAGNETISM = 0.15, SQUISH_K = 0.012, SQUISH_MAX = 0.22;
let pointerId = null, dragging = false, lensMode = false, moved = false;
let startX = 0, startY = 0, pointerX = 0, lastCenter = null, targetItem = null;
let lensW = 0, lensH = 0, rowCenterY = 0, current = { x: 0, y: 0, w: 0, h: 0 }, rafId = null;

const navRect = () => navInner.getBoundingClientRect();
const rectFor = (item) => {
  const ir = item.getBoundingClientRect(), pr = navRect();
  return { x: ir.left - pr.left, y: ir.top - pr.top, w: ir.width, h: ir.height };
};
const itemAtX = (x) => {
  const pr = navRect();
  let best = navItems[0], bestDist = Infinity;
  navItems.forEach((item) => {
    const ir = item.getBoundingClientRect();
    const center = (ir.left - pr.left) + ir.width / 2;
    const dist = Math.abs(x - center);
    if (dist < bestDist) { bestDist = dist; best = item; }
  });
  return best;
};
const placeIndicator = (rect) => {
  indicator.style.left = rect.x + "px";
  indicator.style.top = rect.y + "px";
  indicator.style.width = rect.w + "px";
  indicator.style.height = rect.h + "px";
};

function tick() {
  if (!dragging) return;
  if (lensMode) {
    const nearest = itemAtX(pointerX);
    targetItem = nearest;
    const nr = rectFor(nearest);
    const nearestCenter = nr.x + nr.w / 2;
    const desiredCenter = pointerX * (1 - MAGNETISM) + nearestCenter * MAGNETISM;
    const maxX = Math.max(navRect().width - lensW, 0);
    const desiredX = Math.min(Math.max(desiredCenter - lensW / 2, 0), maxX);
    const desiredY = rowCenterY - lensH / 2;
    const velocity = lastCenter === null ? 0 : desiredCenter - lastCenter;
    lastCenter = desiredCenter;
    current.x += (desiredX - current.x) * EASE;
    current.y += (desiredY - current.y) * EASE;
    current.w += (lensW - current.w) * EASE;
    current.h += (lensH - current.h) * EASE;
    const squish = Math.min(Math.abs(velocity) * SQUISH_K, SQUISH_MAX);
    const hl = ((pointerX - current.x) / current.w) * 100;
    indicator.style.left = current.x + "px";
    indicator.style.top = current.y + "px";
    indicator.style.width = current.w + "px";
    indicator.style.height = current.h + "px";
    indicator.style.transform = "scale(" + (1 + squish) + ", " + (1 - squish * 0.7) + ")";
    indicator.style.setProperty("--hl-x", hl + "%");
  }
  rafId = requestAnimationFrame(tick);
}

function beginDrag(item) {
  const r = rectFor(item);
  current = { x: r.x, y: r.y, w: r.w, h: r.h };
  targetItem = item; lensMode = false; lastCenter = null;
  const rowH = navRect().height;
  rowCenterY = rowH / 2;
  lensH = Math.max(rowH * 1.45, r.h * 1.3);
  lensW = lensH * 1.35;
  indicator.classList.remove("snapping", "lens");
  indicator.style.opacity = "";
  indicator.style.borderRadius = "17px";
  indicator.style.transform = "scale(1, 1)";
  placeIndicator(current);
  indicator.classList.add("dragging");
  bottomNav.classList.add("holding");
  rafId = requestAnimationFrame(tick);
}

function cancelDrag() {
  dragging = false; lensMode = false;
  if (rafId) cancelAnimationFrame(rafId);
  indicator.classList.remove("dragging", "snapping", "lens");
  indicator.style.opacity = "0";
  bottomNav.classList.remove("holding");
  targetItem = null;
}

function finishDrag() {
  dragging = false; lensMode = false;
  if (rafId) cancelAnimationFrame(rafId);
  indicator.classList.remove("dragging", "lens");
  bottomNav.classList.remove("holding");
  if (!targetItem) return;
  const r = rectFor(targetItem);
  indicator.classList.add("snapping");
  indicator.style.transform = "scale(1, 1)";
  indicator.style.borderRadius = "17px";
  indicator.style.left = r.x + "px";
  indicator.style.top = r.y + "px";
  indicator.style.width = r.w + "px";
  indicator.style.height = r.h + "px";
  const chosen = targetItem;
  window.setTimeout(() => {
    indicator.classList.remove("snapping");
    indicator.style.opacity = "0";
    history.replaceState(null, "", chosen.getAttribute("href"));
    showPage(chosen.dataset.page);
  }, 280);
  targetItem = null;
}

navInner.addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".nav-item");
  if (!item) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pointerId = e.pointerId;
  startX = e.clientX; startY = e.clientY;
  pointerX = e.clientX - navRect().left;
  moved = false; dragging = true;
  beginDrag(item);
});
navInner.addEventListener("pointermove", (e) => {
  if (!dragging || e.pointerId !== pointerId) return;
  const dx = e.clientX - startX, dy = e.clientY - startY;
  if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    moved = true; lensMode = true;
    indicator.classList.add("lens");
    indicator.style.borderRadius = "";
    if (navInner.setPointerCapture) navInner.setPointerCapture(pointerId);
  }
  if (moved) e.preventDefault();
  pointerX = e.clientX - navRect().left;
});
function onPointerUp(e) {
  if (e.pointerId !== pointerId || !dragging) return;
  if (navInner.hasPointerCapture && navInner.hasPointerCapture(pointerId)) navInner.releasePointerCapture(pointerId);
  if (moved) finishDrag(); else cancelDrag();
}
navInner.addEventListener("pointerup", onPointerUp);
navInner.addEventListener("pointercancel", cancelDrag);
navInner.addEventListener("click", (e) => e.preventDefault());

/*  Saving and Loading*/
const SAVE_KEY = "liquidGlassNavApp";

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore a corrupted or blocked save and start fresh */ }
  return {};
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ calendarNotes, subjects }));
  } catch (e) { /* storage may be full or disabled — the app still works, it just won't persist */ }
}

const savedState = loadState();

/* 
   CALENDAR
  
    */
let calViewYear, calViewMonth; // the month currently shown
let calSelectedKey = null;     // date key of the day open in the editor
const calendarNotes = savedState.calendarNotes || {};

const calGrid = document.getElementById("calGrid");
const calMonthLabel = document.getElementById("calMonthLabel");
const calEditor = document.getElementById("calEditor");
const calEditorLabel = document.getElementById("calEditorLabel");
const calNoteInput = document.getElementById("calNoteInput");
const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function dateKey(y, m, d) { return y + "-" + m + "-" + d; }

function renderCalendar() {
  calMonthLabel.textContent = MONTH_NAMES[calViewMonth] + " " + calViewYear;
  calGrid.innerHTML = "";

  // day-of-week header row
  DOW_LABELS.forEach((label) => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = label;
    calGrid.appendChild(el);
  });

  const firstWeekday = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const today = new Date();

  // blank filler cells so day 1 lands in the right weekday column
  for (let i = 0; i < firstWeekday; i++) {
    const filler = document.createElement("div");
    filler.className = "cal-day empty";
    calGrid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(calViewYear, calViewMonth, day);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-day";
    if (today.getFullYear() === calViewYear && today.getMonth() === calViewMonth && today.getDate() === day) {
      cell.classList.add("today");
    }
    if (key === calSelectedKey) cell.classList.add("selected");

    const numberEl = document.createElement("span");
    numberEl.textContent = day;
    cell.appendChild(numberEl);

    if (calendarNotes[key]) {
      const dot = document.createElement("span");
      dot.className = "note-dot";
      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => openDayEditor(key, day));
    calGrid.appendChild(cell);
  }
}

function openDayEditor(key, day) {
  calSelectedKey = key;
  calEditorLabel.textContent = "Note for " + MONTH_NAMES[calViewMonth] + " " + day;
  calNoteInput.value = calendarNotes[key] || "";
  calEditor.hidden = false;
  renderCalendar();
  calNoteInput.focus();
}

// saves as you type, so there's no separate "save" button to remember to press
calNoteInput.addEventListener("input", () => {
  if (!calSelectedKey) return;
  const text = calNoteInput.value.trim();
  if (text) calendarNotes[calSelectedKey] = text;
  else delete calendarNotes[calSelectedKey];
  renderCalendar();
  saveState();
});

document.getElementById("calPrev").addEventListener("click", () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});
document.getElementById("calNext").addEventListener("click", () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});

(function initCalendar() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  renderCalendar();
})();

/* 
   PAGE 2 — GRADES
    */
let subjectIdCounter = 0;
let subjects = (savedState.subjects && savedState.subjects.length)
  ? savedState.subjects
  : [{ id: subjectIdCounter++, title: "", color: "#0a90b8", rows: [{ label: "", score: "", max: "" }] }];
// keep the id counter ahead of any restored subjects so new ones never collide
subjects.forEach((s) => { if (s.id >= subjectIdCounter) subjectIdCounter = s.id + 1; });

const subjectsContainer = document.getElementById("subjectsContainer");
const gradeSummaryEl = document.getElementById("gradeSummary");

// turns a "#rrggbb" color into an rgba() string so headers stay translucent
// and consistent with the rest of the glass UI, whatever color is picked
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function subjectTotals(subject) {
  let earned = 0, possible = 0;
  subject.rows.forEach((row) => {
    const score = parseFloat(row.score);
    const max = parseFloat(row.max);
    if (!isNaN(score) && !isNaN(max) && max > 0) { earned += score; possible += max; }
  });
  return { earned, possible };
}

function renderSubjects() {
  subjectsContainer.innerHTML = "";

  subjects.forEach((subject) => {
    const card = document.createElement("div");
    card.className = "subject-card";

    // header: color picker + editable title + remove button 
    const header = document.createElement("div");
    header.className = "subject-header";
    header.style.background = hexToRgba(subject.color, 0.35);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = subject.color;
    colorInput.title = "Subject color";
    colorInput.addEventListener("input", () => {
      subject.color = colorInput.value;
      header.style.background = hexToRgba(subject.color, 0.35);
      saveState();
    });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Subject name";
    titleInput.value = subject.title;
    titleInput.addEventListener("input", () => { subject.title = titleInput.value; saveState(); });

    const removeSubjectBtn = document.createElement("button");
    removeSubjectBtn.type = "button";
    removeSubjectBtn.className = "subject-remove";
    removeSubjectBtn.textContent = "✕";
    removeSubjectBtn.addEventListener("click", () => {
      subjects = subjects.filter((s) => s.id !== subject.id);
      renderSubjects();
      saveState();
    });

    header.append(colorInput, titleInput, removeSubjectBtn);

    //  body: the rows/columns table of assignments 
    const body = document.createElement("div");
    body.className = "subject-body";

    const table = document.createElement("table");
    table.className = "grade-table";
    table.innerHTML =
      '<thead><tr>' +
      '<th>Assignment</th><th class="col-narrow">Score</th><th class="col-narrow">Out of</th><th class="col-remove"></th>' +
      '</tr></thead>';

    const tbody = document.createElement("tbody");
    subject.rows.forEach((row, index) => {
      const tr = document.createElement("tr");

      const labelCell = document.createElement("td");
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.placeholder = "Assignment";
      labelInput.value = row.label;
      labelInput.addEventListener("input", () => { row.label = labelInput.value; saveState(); });
      labelCell.appendChild(labelInput);

      const scoreCell = document.createElement("td");
      scoreCell.className = "col-narrow";
      const scoreInput = document.createElement("input");
      scoreInput.type = "number";
      scoreInput.placeholder = "Score";
      scoreInput.value = row.score;
      scoreInput.addEventListener("input", () => { row.score = scoreInput.value; updateSummaries(); saveState(); });
      scoreCell.appendChild(scoreInput);

      const maxCell = document.createElement("td");
      maxCell.className = "col-narrow";
      const maxInput = document.createElement("input");
      maxInput.type = "number";
      maxInput.placeholder = "Out of";
      maxInput.value = row.max;
      maxInput.addEventListener("input", () => { row.max = maxInput.value; updateSummaries(); saveState(); });
      maxCell.appendChild(maxInput);

      const removeCell = document.createElement("td");
      removeCell.className = "col-remove";
      const removeRowBtn = document.createElement("button");
      removeRowBtn.type = "button";
      removeRowBtn.className = "grade-remove-row";
      removeRowBtn.textContent = "✕";
      removeRowBtn.addEventListener("click", () => {
        subject.rows.splice(index, 1);
        renderSubjects();
        saveState();
      });
      removeCell.appendChild(removeRowBtn);

      tr.append(labelCell, scoreCell, maxCell, removeCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    const addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.className = "subject-add-row";
    addRowBtn.textContent = "+ Add assignment";
    addRowBtn.addEventListener("click", () => {
      subject.rows.push({ label: "", score: "", max: "" });
      renderSubjects();
      saveState();
    });
    body.appendChild(addRowBtn);

    const subtotalEl = document.createElement("div");
    subtotalEl.className = "subject-subtotal";
    const { earned, possible } = subjectTotals(subject);
    subtotalEl.textContent = possible > 0
      ? "Subtotal: " + earned + " / " + possible + " (" + ((earned / possible) * 100).toFixed(1) + "%)"
      : "Subtotal: —";
    body.appendChild(subtotalEl);

    card.append(header, body);
    subjectsContainer.appendChild(card);
  });

  updateSummaries();
}

// recomputes just the numbers (subtotal lines + grand total) without
// rebuilding every input, so typing doesn't lose focus mid-row
function updateSummaries() {
  document.querySelectorAll(".subject-card").forEach((card, i) => {
    const { earned, possible } = subjectTotals(subjects[i]);
    card.querySelector(".subject-subtotal").textContent = possible > 0
      ? "Subtotal: " + earned + " / " + possible + " (" + ((earned / possible) * 100).toFixed(1) + "%)"
      : "Subtotal: —";
  });

  let earned = 0, possible = 0;
  subjects.forEach((subject) => {
    const totals = subjectTotals(subject);
    earned += totals.earned; possible += totals.possible;
  });
  gradeSummaryEl.textContent = possible > 0
    ? "Overall: " + earned + " / " + possible + " (" + ((earned / possible) * 100).toFixed(1) + "%)"
    : "Overall: —";
}

document.getElementById("subjectAddBtn").addEventListener("click", () => {
  subjects.push({ id: subjectIdCounter++, title: "", color: "#0a90b8", rows: [{ label: "", score: "", max: "" }] });
  renderSubjects();
  saveState();
});

renderSubjects();
