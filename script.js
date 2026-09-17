const SAVE_KEY = "liquidGlassNavApp";
const THEME_KEY = "liquidGlassNavTheme";

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

const savedState = loadState();
const calendarNotes = savedState.calendarNotes || {};
let reminders = savedState.reminders || [];

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ calendarNotes, subjects, reminders }));
  } catch (e) {}
}

/* THEME */
const themeToggle = document.getElementById("themeToggle");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const themeColorMeta = document.getElementById("themeColorMeta");

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  themeToggleIcon.textContent = mode === "dark" ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
  themeColorMeta.setAttribute("content", mode === "dark" ? "#0d1a24" : "#5aa0c2");
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
  applyMapTheme(mode);
}

let storedTheme = null;
try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
applyTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

if (!storedTheme && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    applyTheme(e.matches ? "dark" : "light");
  });
}

/* PAGE SWITCHING */
const pages = Array.from(document.querySelectorAll(".page"));
const homeButton = document.querySelector(".home-button");
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const allNavLinks = [homeButton, ...navItems];

function showPage(name) {
  pages.forEach((p) => { p.hidden = p.dataset.page !== name; });
  allNavLinks.forEach((l) => l.classList.toggle("active", l.dataset.page === name));
  if (name === "home") scrollToCurrentWeek(false);
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

/* DATE HELPERS */
const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_MS = 86400000;

function dateKey(y, m, d) { return y + "-" + m + "-" + d; }
function keyOf(date) { return dateKey(date.getFullYear(), date.getMonth(), date.getDate()); }
function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d);
}
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatClock(time) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return hour + ":" + String(m).padStart(2, "0") + " " + suffix;
}
function remindersFor(key) {
  return reminders.filter((r) => r.key === key).sort((a, b) => a.time.localeCompare(b.time));
}

/* WEEK STRIP */
const weekStrip = document.getElementById("weekStrip");
const weekLabel = document.getElementById("weekLabel");
const WEEKS_BACK = 8, WEEKS_FWD = 52;
let weekPages = [];

function buildWeekStrip() {
  weekStrip.innerHTML = "";
  weekPages = [];
  const base = startOfWeek(new Date());
  for (let w = -WEEKS_BACK; w <= WEEKS_FWD; w++) {
    const weekStart = new Date(base.getTime() + w * 7 * DAY_MS);
    const page = document.createElement("div");
    page.className = "week-page";
    page.dataset.start = weekStart.getTime();
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      page.appendChild(buildDayChip(date));
    }
    weekStrip.appendChild(page);
    weekPages.push(page);
  }
}

function buildDayChip(date) {
  const key = keyOf(date);
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "day-chip";
  chip.dataset.key = key;
  if (isSameDay(date, new Date())) chip.classList.add("today");
  if (date.getMonth() !== new Date().getMonth()) chip.classList.add("other-month");

  const dow = document.createElement("span");
  dow.className = "dow";
  dow.textContent = DOW_LABELS[date.getDay()];

  const num = document.createElement("span");
  num.className = "num";
  num.textContent = date.getDate();

  const dots = document.createElement("span");
  dots.className = "chip-dots";
  if (calendarNotes[key]) {
    const d = document.createElement("span");
    d.className = "dot-note";
    dots.appendChild(d);
  }
  if (remindersFor(key).length) {
    const d = document.createElement("span");
    d.className = "dot-rem";
    dots.appendChild(d);
  }

  chip.append(dow, num, dots);
  chip.addEventListener("click", () => openDay(key));
  return chip;
}

function refreshChipDots() {
  weekStrip.querySelectorAll(".day-chip").forEach((chip) => {
    const key = chip.dataset.key;
    const dots = chip.querySelector(".chip-dots");
    dots.innerHTML = "";
    if (calendarNotes[key]) {
      const d = document.createElement("span");
      d.className = "dot-note";
      dots.appendChild(d);
    }
    if (remindersFor(key).length) {
      const d = document.createElement("span");
      d.className = "dot-rem";
      dots.appendChild(d);
    }
  });
}

function scrollToCurrentWeek(smooth) {
  const page = weekPages[WEEKS_BACK];
  if (!page) return;
  weekStrip.scrollTo({ left: page.offsetLeft - weekStrip.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  updateWeekLabel();
}

function updateWeekLabel() {
  const index = Math.round(weekStrip.scrollLeft / Math.max(weekStrip.clientWidth, 1));
  const page = weekPages[Math.min(Math.max(index, 0), weekPages.length - 1)];
  if (!page) return;
  const start = new Date(Number(page.dataset.start));
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const left = MONTH_SHORT[start.getMonth()] + " " + start.getDate();
  const right = (start.getMonth() === end.getMonth() ? "" : MONTH_SHORT[end.getMonth()] + " ") + end.getDate();
  weekLabel.textContent = left + " – " + right + ", " + end.getFullYear();
}

weekStrip.addEventListener("scroll", () => {
  window.clearTimeout(weekStrip._t);
  weekStrip._t = window.setTimeout(updateWeekLabel, 80);
});

buildWeekStrip();
scrollToCurrentWeek(false);
window.addEventListener("resize", () => updateWeekLabel());

/* DAY SHEET */
const daySheet = document.getElementById("daySheet");
const sheetTitle = document.getElementById("sheetTitle");
const sheetSub = document.getElementById("sheetSub");
const sheetNote = document.getElementById("sheetNote");
const sheetReminders = document.getElementById("sheetReminders");
const reminderText = document.getElementById("reminderText");
const reminderTime = document.getElementById("reminderTime");
const reminderLead = document.getElementById("reminderLead");
let openKey = null;

function openDay(key) {
  openKey = key;
  const date = dateFromKey(key);
  sheetTitle.textContent = MONTH_NAMES[date.getMonth()] + " " + date.getDate();
  sheetSub.textContent = DAY_NAMES[date.getDay()] + ", " + date.getFullYear();
  sheetNote.value = calendarNotes[key] || "";
  renderSheetReminders();
  daySheet.hidden = false;
  document.body.style.overflow = "hidden";
  sheetNote.focus({ preventScroll: true });
}

function closeDay() {
  daySheet.hidden = true;
  document.body.style.overflow = "";
  openKey = null;
  refreshChipDots();
  renderCalendar();
  renderUpNext();
}

document.getElementById("sheetClose").addEventListener("click", closeDay);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !daySheet.hidden) closeDay(); });

sheetNote.addEventListener("input", () => {
  if (!openKey) return;
  const text = sheetNote.value.trim();
  if (text) calendarNotes[openKey] = text;
  else delete calendarNotes[openKey];
  saveState();
});

function renderSheetReminders() {
  sheetReminders.innerHTML = "";
  const list = remindersFor(openKey);
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No reminders for this day yet.";
    sheetReminders.appendChild(empty);
    return;
  }
  list.forEach((rem) => {
    const row = document.createElement("div");
    row.className = "reminder-row";

    const time = document.createElement("span");
    time.className = "r-time";
    time.textContent = formatClock(rem.time);

    const text = document.createElement("span");
    text.className = "r-text";
    text.textContent = rem.text;

    const lead = document.createElement("span");
    lead.className = "r-lead";
    lead.textContent = leadLabel(rem.lead);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      reminders = reminders.filter((r) => r.id !== rem.id);
      saveState();
      renderSheetReminders();
      refreshChipDots();
      renderUpNext();
    });

    row.append(time, text, lead, remove);
    sheetReminders.appendChild(row);
  });
}

function leadLabel(lead) {
  if (!lead) return "";
  if (lead === 1440) return "1 day early";
  if (lead === 60) return "1 hr early";
  return lead + " min early";
}

document.getElementById("reminderAdd").addEventListener("click", () => {
  const text = reminderText.value.trim();
  if (!openKey || !text || !reminderTime.value) return;
  reminders.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    key: openKey,
    time: reminderTime.value,
    text,
    lead: Number(reminderLead.value),
    firedLead: false,
    fired: false
  });
  reminderText.value = "";
  saveState();
  renderSheetReminders();
  refreshChipDots();
  renderUpNext();
  requestPermission();
});

reminderText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("reminderAdd").click();
});

/* UP NEXT */
const upNextList = document.getElementById("upNextList");

function reminderDate(rem) {
  const date = dateFromKey(rem.key);
  const [h, m] = rem.time.split(":").map(Number);
  date.setHours(h, m, 0, 0);
  return date;
}

function renderUpNext() {
  upNextList.innerHTML = "";
  const now = new Date();
  const upcoming = reminders
    .map((r) => ({ rem: r, at: reminderDate(r) }))
    .filter((x) => x.at >= now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 5);

  if (!upcoming.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Nothing scheduled. Tap a day above to add a reminder.";
    upNextList.appendChild(empty);
    return;
  }

  upcoming.forEach(({ rem, at }) => {
    const row = document.createElement("div");
    row.className = "next-item";

    const when = document.createElement("span");
    when.className = "when";
    const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
    const dayText = days === 0 ? "Today" : days === 1 ? "Tomorrow" : MONTH_SHORT[at.getMonth()] + " " + at.getDate();
    when.textContent = dayText + " · " + formatClock(rem.time);

    const what = document.createElement("span");
    what.className = "what";
    what.textContent = rem.text;

    row.append(when, what);
    upNextList.appendChild(row);
  });
}

/* NOTIFICATIONS */
const toastStack = document.getElementById("toastStack");
const notifyBtn = document.getElementById("notifyBtn");

function notificationsSupported() { return "Notification" in window; }

function syncNotifyBtn() {
  notifyBtn.hidden = !notificationsSupported() || Notification.permission === "granted";
}

function requestPermission() {
  if (!notificationsSupported() || Notification.permission !== "default") return;
  Notification.requestPermission().then(syncNotifyBtn);
}

notifyBtn.addEventListener("click", () => {
  if (!notificationsSupported()) return;
  Notification.requestPermission().then(syncNotifyBtn);
});
syncNotifyBtn();

function toast(title, body) {
  const el = document.createElement("div");
  el.className = "toast";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = body;
  el.append(strong, span);
  toastStack.appendChild(el);
  window.setTimeout(() => el.remove(), 9000);
}

function alertUser(title, body) {
  if (notificationsSupported() && Notification.permission === "granted") {
    try { new Notification(title, { body, tag: title + body }); } catch (e) {}
  }
  toast(title, body);
}

function checkReminders() {
  const now = Date.now();
  let changed = false;

  reminders.forEach((rem) => {
    const at = reminderDate(rem).getTime();
    const leadMs = (rem.lead || 0) * 60000;

    if (rem.lead && !rem.firedLead && now >= at - leadMs) {
      if (now <= at) alertUser(rem.text, "Coming up " + leadLabel(rem.lead).replace(" early", "") + " from now.");
      rem.firedLead = true;
      changed = true;
    }
    if (!rem.fired && now >= at) {
      if (now - at < 6 * 3600000) alertUser(rem.text, "It's " + formatClock(rem.time) + " — this is your reminder.");
      rem.fired = true;
      changed = true;
    }
  });

  if (changed) { saveState(); renderUpNext(); }
}

reminders.forEach((rem) => {
  const at = reminderDate(rem).getTime();
  if (Date.now() - at > 6 * 3600000) { rem.fired = true; rem.firedLead = true; }
});

window.setInterval(checkReminders, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });

/* CALENDAR PAGE */
let calViewYear, calViewMonth;

const calGrid = document.getElementById("calGrid");
const calMonthLabel = document.getElementById("calMonthLabel");

function renderCalendar() {
  calMonthLabel.textContent = MONTH_NAMES[calViewMonth] + " " + calViewYear;
  calGrid.innerHTML = "";

  DOW_LABELS.forEach((label) => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = label;
    calGrid.appendChild(el);
  });

  const firstWeekday = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const today = new Date();

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

    const numberEl = document.createElement("span");
    numberEl.textContent = day;
    cell.appendChild(numberEl);

    const dots = document.createElement("span");
    dots.className = "cal-dots";
    if (calendarNotes[key]) {
      const d = document.createElement("span");
      d.className = "dot-note";
      dots.appendChild(d);
    }
    if (remindersFor(key).length) {
      const d = document.createElement("span");
      d.className = "dot-rem";
      dots.appendChild(d);
    }
    cell.appendChild(dots);

    cell.addEventListener("click", () => openDay(key));
    calGrid.appendChild(cell);
  }
}

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

/* MAP */
function applyMapTheme(mode) {
  const mapCard = document.getElementById("mapCard");
  if (!mapCard) return;
  if (!window.customElements || !customElements.get("gmp-map")) {
    if (!mapCard.querySelector(".map-fallback")) {
      const note = document.createElement("p");
      note.className = "map-fallback";
      note.textContent = "Map is loading. If it stays empty, check the network connection and the Google Maps key.";
      mapCard.appendChild(note);
    }
    return;
  }
  mapCard.innerHTML = "";
  const map = document.createElement("gmp-map");
  map.setAttribute("center", "38.7946,-106.5348");
  map.setAttribute("zoom", "4");
  map.setAttribute("map-id", "DEMO_MAP_ID");
  map.setAttribute("color-scheme", mode === "dark" ? "DARK" : "LIGHT");
  mapCard.appendChild(map);
}

if (window.customElements && customElements.whenDefined) {
  customElements.whenDefined("gmp-map").then(() => {
    applyMapTheme(document.documentElement.getAttribute("data-theme"));
  });
}

/* GRADES */
let subjectIdCounter = 0;
let subjects = (savedState.subjects && savedState.subjects.length)
  ? savedState.subjects
  : [{ id: subjectIdCounter++, title: "", color: "#0a90b8", rows: [{ label: "", score: "", max: "" }] }];
subjects.forEach((s) => { if (s.id >= subjectIdCounter) subjectIdCounter = s.id + 1; });

const subjectsContainer = document.getElementById("subjectsContainer");
const gradeSummaryEl = document.getElementById("gradeSummary");

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
renderUpNext();
checkReminders();
activateFromHash();
