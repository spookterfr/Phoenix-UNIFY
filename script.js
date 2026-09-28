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
let busStop = savedState.busStop || null;
let savedBarcode = savedState.barcode || null;   // { value, format, label }

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ calendarNotes, subjects, reminders, busStop, barcode: savedBarcode }));
  } catch (e) {}
}

/* MAP VIEW STATE (declared early: applyTheme() below calls applyMapTheme) */
const mapViews = {
  main: { host: "mapCard", el: null, marker: null, compact: false },
  home: { host: "homeMap", el: null, marker: null, compact: true }
};

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
  const bcBtn = document.getElementById("barcodeBtn");
  if (bcBtn) bcBtn.hidden = name !== "home";
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

/* NUTRISLICE INTEGRATION */
const API_BASE = "";
const NUTRISLICE_SCHOOL = "phoenix-coding-academy";
const MENU_TYPES = { breakfast: "breakfast", lunch: "lunch" };
const menuWeekCache = {};
const menuWeekPending = {};

function nutrisliceDayId(dateKeyStr) {
  const [y, m, d] = dateKeyStr.split("-").map(Number);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function weekAnchorFor(dateKeyStr) {
  const [y, m, d] = dateKeyStr.split("-").map(Number);
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

async function loadMenuWeek(mealType, dateKeyStr) {
  const anchor = weekAnchorFor(dateKeyStr);
  const cacheKey = `${mealType}|${anchor}`;
  if (menuWeekCache[cacheKey]) return menuWeekCache[cacheKey];
  if (menuWeekPending[cacheKey]) return menuWeekPending[cacheKey];

  const slug = MENU_TYPES[mealType] || mealType;
  const endpoint = `${API_BASE}/api/menu/week?school=${encodeURIComponent(NUTRISLICE_SCHOOL)}&type=${encodeURIComponent(slug)}&date=${encodeURIComponent(anchor)}`;

  menuWeekPending[cacheKey] = (async () => {
    try {
      const res = await fetch(endpoint);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      menuWeekCache[cacheKey] = body.days || {};
      return menuWeekCache[cacheKey];
    } catch (err) {
      console.warn(`Nutrislice ${mealType} week ${anchor} failed:`, err.message);
      return null;
    } finally {
      delete menuWeekPending[cacheKey];
    }
  })();

  return menuWeekPending[cacheKey];
}

async function fetchNutrisliceMenu(mealType, dateKeyStr) {
  const week = await loadMenuWeek(mealType, dateKeyStr);
  if (!week) return null;
  return week[nutrisliceDayId(dateKeyStr)] || [];
}

/* Lunch specials come from lunch-specials.js (built from the monthly lunch sheet) */
function lunchInfoFor(dateKeyStr) {
  const all = window.LUNCH_SPECIALS || {};
  return all[nutrisliceDayId(dateKeyStr)] || null;
}

function specialText(info) {
  if (!info || info.closed) return "";
  if (info.earlyRelease) return "Early release – " + (info.special || "Grab and Go");
  return info.special || "";
}

function specialListItem(info) {
  if (!info || info.closed) return "";
  const text = specialText(info);
  return `<li class="lunch-special${text ? "" : " none"}"><span class="special-tag">Special</span> ${text ? escapeHtml(text) : "None today"}</li>`;
}

function renderMenuList(el, items, emptyText, extra) {
  if (!el) return;
  extra = extra || {};
  if (extra.closed) {
    el.innerHTML = `<li class="lunch-closed">${escapeHtml(extra.closed)}</li>`;
    return;
  }
  const head = extra.headHtml || "";
  let body;
  if (items === null) body = '<li class="empty-note">Menu server unreachable</li>';
  else if (items.length) body = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  else body = head ? "" : `<li class="empty-note">${emptyText}</li>`;
  el.innerHTML = head + body;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function renderHomeMenu() {
  const dateKeyStr = keyOf(new Date());
  const info = lunchInfoFor(dateKeyStr);
  const closed = info && info.closed ? info.closed : null;

  const [breakfast, lunch] = await Promise.all([
    fetchNutrisliceMenu("breakfast", dateKeyStr),
    fetchNutrisliceMenu("lunch", dateKeyStr)
  ]);

  renderMenuList(document.getElementById("homeBreakfastList"), breakfast, "No breakfast listed", { closed });
  renderMenuList(document.getElementById("homeLunchList"), lunch, "No lunch listed", { closed, headHtml: specialListItem(info) });
}

async function renderSheetMenu(key) {
  const menuContainer = document.getElementById("sheetMenuContent");
  if (!menuContainer) return;

  const info = lunchInfoFor(key);
  if (info && info.closed) {
    menuContainer.innerHTML = `<p class="lunch-closed">${escapeHtml(info.closed)}</p>`;
    return;
  }

  const special = specialText(info);
  const specialLine = info
    ? `<div class="sheet-meal-group sheet-special"><strong>Lunch special:</strong> ${special ? escapeHtml(special) : "None today"}</div>`
    : "";

  menuContainer.innerHTML = specialLine + `<p class="empty-note">Fetching menu…</p>`;
  const [breakfast, lunch] = await Promise.all([
    fetchNutrisliceMenu("breakfast", key),
    fetchNutrisliceMenu("lunch", key)
  ]);
  if (openKey !== key) return; // sheet was closed or switched while loading

  if (breakfast === null && lunch === null) {
    menuContainer.innerHTML = specialLine + `<p class="empty-note">Menu server unreachable.</p>`;
    return;
  }

  const b = breakfast || [];
  const l = lunch || [];

  if (!b.length && !l.length) {
    menuContainer.innerHTML = specialLine || `<p class="empty-note">No meals listed for this date.</p>`;
    return;
  }

  menuContainer.innerHTML = specialLine + `
    <div class="sheet-meal-group">
      <strong>Breakfast:</strong> ${escapeHtml(b.join(", ")) || "None listed"}
    </div>
    <div class="sheet-meal-group">
      <strong>Lunch:</strong> ${escapeHtml(l.join(", ")) || "None listed"}
    </div>
  `;
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
  renderSheetMenu(key);
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
      schedulePushSync();
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
  requestPermission().then(schedulePushSync);
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

/* NOTIFICATIONS
   Two layers:
   1. While the app is open, checkReminders() fires them locally.
   2. For when the app is closed, the browser is subscribed to Web Push and the
      reminder schedule is synced to the server (push-server.js), which sends a
      push at the right time. sw.js receives it and shows the system notification. */
const toastStack = document.getElementById("toastStack");
const notifyBtn = document.getElementById("notifyBtn");
const pushStatusEl = document.getElementById("pushStatus");
const ICON = "PHXunify2.png";
let swReg = null;

function notificationsSupported() { return "Notification" in window; }
function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
// iPhone/iPad only allow web push once the app is added to the Home Screen
function needsInstall() { return isIOS() && !isStandalone() && !pushSupported(); }

function setPushStatus(text) {
  if (!pushStatusEl) return;
  pushStatusEl.textContent = text || "";
  pushStatusEl.hidden = !text;
}

function syncNotifyBtn() {
  const show = needsInstall() || (notificationsSupported() && Notification.permission !== "granted");
  notifyBtn.hidden = !show;
}

function requestPermission() {
  if (!notificationsSupported() || Notification.permission !== "default") return Promise.resolve();
  return Notification.requestPermission().then(() => { syncNotifyBtn(); return syncPush(); });
}

notifyBtn.addEventListener("click", () => {
  if (needsInstall()) {
    toast("Add to Home Screen first", "In Safari tap Share → Add to Home Screen, then open Phoenix UNIFY from your home screen and turn on alerts there.");
    return;
  }
  if (!notificationsSupported()) return;
  if (Notification.permission === "denied") {
    toast("Alerts are blocked", "Allow notifications for this site in your browser or phone settings, then try again.");
    return;
  }
  Notification.requestPermission().then(() => { syncNotifyBtn(); return syncPush(); });
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

/* Service worker */
async function registerSW() {
  if (swReg) return swReg;
  if (!("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("sw.js");
    swReg = await navigator.serviceWorker.ready;
    return swReg;
  } catch (e) {
    console.warn("Service worker registration failed:", e);
    return null;
  }
}

async function showSystemNotification(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const opts = { body, tag, icon: ICON, badge: ICON, data: { url: "./" } };
  try {
    const reg = swReg || await registerSW();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) {}
  try { new Notification(title, opts); } catch (e) {}
}

// Same tag as the server push, so a reminder that arrives both ways shows once
function alertUser(title, body, tag) {
  showSystemNotification(title, body, tag);
  toast(title, body);
}

/* Web Push subscription + schedule sync */
function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function ensurePushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  const reg = await registerSW();
  if (!reg) return null;
  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;

  const res = await fetch(`${API_BASE}/api/push/key`);
  if (!res.ok) throw new Error("push key HTTP " + res.status);
  const { key } = await res.json();
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) };
  try {
    return await reg.pushManager.subscribe(options);
  } catch (e) {
    // an old subscription made with different server keys blocks a new one
    const old = await reg.pushManager.getSubscription();
    if (old) { await old.unsubscribe(); return reg.pushManager.subscribe(options); }
    throw e;
  }
}

function buildPushSchedule() {
  const now = Date.now();
  const out = [];
  reminders.forEach((rem) => {
    const at = reminderDate(rem).getTime();
    const leadMs = (rem.lead || 0) * 60000;
    if (rem.lead && at - leadMs > now) {
      out.push({
        id: rem.id + ":lead", at: at - leadMs, title: rem.text,
        body: "Coming up " + leadLabel(rem.lead).replace(" early", "") + " from now.",
        tag: "rem-" + rem.id + "-lead"
      });
    }
    if (at > now) {
      out.push({
        id: rem.id + ":at", at, title: rem.text,
        body: "It's " + formatClock(rem.time) + " — this is your reminder.",
        tag: "rem-" + rem.id + "-at"
      });
    }
  });
  return out;
}

async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const sub = await ensurePushSubscription();
    if (!sub) return;
    const res = await fetch(`${API_BASE}/api/push/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), notifications: buildPushSchedule() })
    });
    if (!res.ok) throw new Error("sync HTTP " + res.status);
    setPushStatus("Alerts will arrive even when the app is closed.");
  } catch (e) {
    console.warn("Push sync failed:", e);
    setPushStatus("Background alerts unavailable right now — alerts only work while the app is open.");
  }
}

let pushSyncTimer = null;
function schedulePushSync() {
  window.clearTimeout(pushSyncTimer);
  pushSyncTimer = window.setTimeout(syncPush, 400);
}

function checkReminders() {
  const now = Date.now();
  let changed = false;

  reminders.forEach((rem) => {
    const at = reminderDate(rem).getTime();
    const leadMs = (rem.lead || 0) * 60000;

    if (rem.lead && !rem.firedLead && now >= at - leadMs) {
      if (now <= at) alertUser(rem.text, "Coming up " + leadLabel(rem.lead).replace(" early", "") + " from now.", "rem-" + rem.id + "-lead");
      rem.firedLead = true;
      changed = true;
    }
    if (!rem.fired && now >= at) {
      if (now - at < 6 * 3600000) alertUser(rem.text, "It's " + formatClock(rem.time) + " — this is your reminder.", "rem-" + rem.id + "-at");
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { checkReminders(); schedulePushSync(); }
});

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
const PHOENIX_BOUNDS = { north: 33.75, south: 33.25, east: -111.75, west: -112.45 };
const PHOENIX_CENTER = "33.4484,-112.0740";
const homeMapStatus = document.getElementById("homeMapStatus");

function applyMapTheme(mode) {
  const ready = window.customElements && customElements.get("gmp-map");
  Object.values(mapViews).forEach((view) => {
    const host = document.getElementById(view.host);
    if (!host) return;
    if (!ready) {
      if (!host.querySelector(".map-fallback")) {
        const note = document.createElement("p");
        note.className = "map-fallback";
        note.textContent = "Map is loading. If it stays empty, check the network connection and the Google Maps key.";
        host.appendChild(note);
      }
      return;
    }
    host.innerHTML = "";
    view.marker = null;
    const el = document.createElement("gmp-map");
    const center = busStop ? `${busStop.lat},${busStop.lng}` : (view.compact ? PHOENIX_CENTER : "38.7946,-106.5348");
    el.setAttribute("center", center);
    el.setAttribute("zoom", busStop ? (view.compact ? "16" : "17") : (view.compact ? "10" : "4"));
    el.setAttribute("map-id", "DEMO_MAP_ID");
    el.setAttribute("color-scheme", mode === "dark" ? "DARK" : "LIGHT");
    host.appendChild(el);
    view.el = el;
    if (view.compact) {
      // simple: no controls, and one-finger scrolling keeps working over the map
      try { el.innerMap.setOptions({ disableDefaultUI: true, gestureHandling: "cooperative", clickableIcons: false }); } catch (e) {}
    }
    if (busStop) placeBusMarker(view, busStop);
  });
}

if (window.customElements && customElements.whenDefined) {
  customElements.whenDefined("gmp-map").then(() => {
    applyMapTheme(document.documentElement.getAttribute("data-theme"));
  });
}

const mapSearchForm = document.getElementById("mapSearchForm");
const mapSearchInput = document.getElementById("mapSearchInput");
const mapStatus = document.getElementById("mapStatus");
const mapResults = document.getElementById("mapResults");

async function placeBusMarker(view, stop) {
  try {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    if (!view.el) return;
    if (view.marker) view.marker.remove();
    view.marker = new AdvancedMarkerElement({
      position: { lat: stop.lat, lng: stop.lng },
      title: stop.name
    });
    view.el.appendChild(view.marker);
  } catch (e) {}
}

function stopLabel(stop) {
  return stop.address ? `${stop.name} — ${stop.address}` : stop.name;
}

function updateHomeMapStatus() {
  if (!homeMapStatus) return;
  homeMapStatus.textContent = busStop ? stopLabel(busStop) : "No bus stop saved yet. Tap Change to pick one.";
}

function goToBusStop(stop) {
  busStop = stop;
  saveState();
  Object.values(mapViews).forEach((view) => {
    if (view.el) {
      view.el.center = { lat: stop.lat, lng: stop.lng };
      view.el.zoom = view.compact ? 16 : 17;
    }
    placeBusMarker(view, stop);
  });
  mapStatus.textContent = stopLabel(stop);
  updateHomeMapStatus();
}

document.getElementById("homeMapChange")?.addEventListener("click", () => {
  history.replaceState(null, "", "#page3");
  showPage("page3");
  window.setTimeout(() => mapSearchInput && mapSearchInput.focus({ preventScroll: true }), 50);
});
updateHomeMapStatus();

async function searchBusStops(query) {
  const { Place } = await google.maps.importLibrary("places");
  const base = {
    fields: ["displayName", "formattedAddress", "location"],
    locationBias: PHOENIX_BOUNDS,
    maxResultCount: 6
  };
  let res = await Place.searchByText({
    ...base,
    textQuery: query,
    includedType: "bus_stop",
    useStrictTypeFiltering: true
  });
  if (!res.places || !res.places.length) {
    res = await Place.searchByText({ ...base, textQuery: `${query} bus stop` });
  }
  return (res.places || []).map((p) => ({
    name: p.displayName,
    address: p.formattedAddress || "",
    lat: p.location.lat(),
    lng: p.location.lng()
  }));
}

function renderBusResults(stops) {
  mapResults.innerHTML = "";
  if (stops.length < 2) return;
  stops.forEach((stop) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-result";
    btn.innerHTML = `<strong>${escapeHtml(stop.name)}</strong><span>${escapeHtml(stop.address)}</span>`;
    btn.addEventListener("click", () => goToBusStop(stop));
    mapResults.appendChild(btn);
  });
}

if (mapSearchForm) {
  mapSearchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = mapSearchInput.value.trim();
    if (!query) return;
    if (!window.google || !google.maps || !google.maps.importLibrary) {
      mapStatus.textContent = "Map is still loading. Try again in a moment.";
      return;
    }
    mapSearchInput.blur();
    mapStatus.textContent = "Searching…";
    mapResults.innerHTML = "";
    try {
      const stops = await searchBusStops(query);
      if (!stops.length) {
        mapStatus.textContent = "No bus stops found. Try a nearby intersection or street name.";
        return;
      }
      goToBusStop(stops[0]);
      renderBusResults(stops);
    } catch (err) {
      mapStatus.textContent = "Search failed. Make sure Places API (New) is enabled for your Google Maps key.";
    }
  });
  if (busStop) mapStatus.textContent = stopLabel(busStop);
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
renderHomeMenu();
checkReminders();
activateFromHash();

// Register the service worker and (if alerts are already allowed) refresh the push schedule
registerSW().then(() => syncPush());

/* ==========================================================
   BARCODE — scan (camera) or type a barcode once, then show a
   digital copy rendered with JsBarcode whenever you need it.
   ========================================================== */
(function initBarcode() {
  const $ = (id) => document.getElementById(id);
  const btn = $("barcodeBtn"), sheet = $("bcSheet");
  const views = { show: $("bcViewShow"), scan: $("bcViewScan"), edit: $("bcViewEdit") };
  const video = $("bcVideo"), scanStatus = $("bcScanStatus");
  const valueIn = $("bcValue"), formatSel = $("bcFormat"), labelIn = $("bcLabel"), errEl = $("bcEditError");

  // JsBarcode format  ->  label, BarcodeDetector name, ZXing name
  const FORMATS = {
    CODE128: { label: "Code 128", det: "code_128", zx: "CODE_128" },
    CODE39:  { label: "Code 39",  det: "code_39",  zx: "CODE_39" },
    EAN13:   { label: "EAN-13",   det: "ean_13",   zx: "EAN_13" },
    EAN8:    { label: "EAN-8",    det: "ean_8",    zx: "EAN_8" },
    UPC:     { label: "UPC-A",    det: "upc_a",    zx: "UPC_A" },
    UPCE:    { label: "UPC-E",    det: "upc_e",    zx: "UPC_E" },
    ITF:     { label: "ITF (Interleaved 2 of 5)", det: "itf", zx: "ITF" },
    codabar: { label: "Codabar",  det: "codabar",  zx: "CODABAR" }
  };
  Object.keys(FORMATS).forEach((k) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = FORMATS[k].label;
    formatSel.appendChild(o);
  });
  const byDetector = {}, byZXing = {};
  Object.keys(FORMATS).forEach((k) => { byDetector[FORMATS[k].det] = k; byZXing[FORMATS[k].zx] = k; });

  function setView(name, title, sub) {
    Object.keys(views).forEach((k) => { views[k].hidden = k !== name; });
    $("bcTitle").textContent = title;
    $("bcSub").textContent = sub || "";
  }

  /* Draw a barcode into an <svg>. Returns true if the value is valid for the format. */
  function draw(svg, value, format) {
    let ok = true;
    svg.innerHTML = "";
    try {
      JsBarcode(svg, value, {
        format, width: 3, height: 110, margin: 8, displayValue: true, fontSize: 18,
        lineColor: "#000", background: "#fff",
        valid: (v) => { ok = v; }
      });
    } catch (e) { ok = false; svg.innerHTML = ""; }
    return ok;
  }

  /* ---------- wake lock (keeps the screen on while showing the code) ---------- */
  let wakeLock = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  function releaseAwake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

  /* ---------- saved view ---------- */
  function showSaved() {
    stopScan();
    if (!savedBarcode) { startScan(); return; }
    setView("show", savedBarcode.label || "My barcode", FORMATS[savedBarcode.format] ? FORMATS[savedBarcode.format].label : "");
    if (!draw($("bcSvgShow"), savedBarcode.value, savedBarcode.format)) {
      toast("Couldn't draw barcode", "The saved number isn't valid for that type. Tap Edit to fix it.");
    }
    $("bcShowName").textContent = savedBarcode.value;
    keepAwake();
  }

  /* ---------- edit / confirm view ---------- */
  function openEdit(value, format, label, title) {
    stopScan();
    setView("edit", title || "Save barcode", "Check it looks right, then save.");
    valueIn.value = value || "";
    formatSel.value = FORMATS[format] ? format : "CODE128";
    labelIn.value = label || "";
    updatePreview();
  }
  function updatePreview() {
    const v = valueIn.value.trim();
    errEl.textContent = "";
    if (!v) { $("bcSvgPreview").innerHTML = ""; return false; }
    const ok = draw($("bcSvgPreview"), v, formatSel.value);
    if (!ok) errEl.textContent = "That number isn't valid for " + FORMATS[formatSel.value].label + ". Try another type.";
    return ok;
  }
  valueIn.addEventListener("input", updatePreview);
  formatSel.addEventListener("change", updatePreview);

  $("bcSave").addEventListener("click", () => {
    const v = valueIn.value.trim();
    if (!v || !updatePreview()) return;
    savedBarcode = { value: v, format: formatSel.value, label: labelIn.value.trim() };
    saveState();
    showSaved();
    toast("Barcode saved", "Tap the barcode button any time to show it.");
  });
  $("bcEditCancel").addEventListener("click", () => { savedBarcode ? showSaved() : closeSheet(); });

  /* ---------- scanning ---------- */
  let stream = null, scanning = false, scanTimer = null, detector = null, zx = null, canvas = null;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
      s.onload = resolve; s.onerror = () => reject(new Error("zxing"));
      document.head.appendChild(s);
    });
  }

  async function makeDecoder() {
    if ("BarcodeDetector" in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const wanted = Object.keys(byDetector).filter((f) => supported.includes(f));
        if (wanted.length) {
          detector = new BarcodeDetector({ formats: wanted });
          return async () => {
            const found = await detector.detect(video);
            if (!found.length) return null;
            return { value: found[0].rawValue, format: byDetector[found[0].format] || "CODE128" };
          };
        }
      } catch (e) {}
    }
    // Fallback (e.g. iPhone Safari): ZXing, loaded only when needed
    await loadZXing();
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, Object.keys(byZXing).map((n) => Z.BarcodeFormat[n]));
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zx = new Z.MultiFormatReader();
    zx.setHints(hints);
    canvas = document.createElement("canvas");
    return async () => {
      if (!video.videoWidth) return null;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0);
      try {
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        const r = zx.decode(bmp);
        return { value: r.getText(), format: byZXing[Z.BarcodeFormat[r.getBarcodeFormat()]] || "CODE128" };
      } catch (e) { return null; }   // NotFoundException = nothing in this frame
    };
  }

  async function startScan() {
    releaseAwake();
    setView("scan", "Scan barcode", "Hold steady, about a hand-width away.");
    scanStatus.textContent = "Starting camera…";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera unavailable", "Camera needs HTTPS. You can type the number instead.");
      openEdit("", "CODE128", "", "Enter barcode");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      stopScan();
      toast("Couldn't open the camera", "Allow camera access, or type the number instead.");
      openEdit("", "CODE128", "", "Enter barcode");
      return;
    }

    let decode;
    try { decode = await makeDecoder(); }
    catch (e) {
      stopScan();
      toast("Scanner couldn't load", "Check your connection, or type the number instead.");
      openEdit("", "CODE128", "", "Enter barcode");
      return;
    }

    scanning = true;
    scanStatus.textContent = "Point the camera at the barcode.";
    const loop = async () => {
      if (!scanning) return;
      let hit = null;
      try { hit = await decode(); } catch (e) {}
      if (!scanning) return;
      if (hit && hit.value) {
        if (navigator.vibrate) navigator.vibrate(60);
        openEdit(hit.value, hit.format, savedBarcode ? savedBarcode.label : "", "Barcode found");
        return;
      }
      scanTimer = setTimeout(loop, 120);
    };
    loop();
  }

  function stopScan() {
    scanning = false;
    clearTimeout(scanTimer);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    try { video.pause(); } catch (e) {}
    video.srcObject = null;
  }

  $("bcManual").addEventListener("click", () => openEdit("", "CODE128", "", "Enter barcode"));
  $("bcScanCancel").addEventListener("click", () => { savedBarcode ? showSaved() : closeSheet(); });
  $("bcRescan").addEventListener("click", () => startScan());
  $("bcEdit").addEventListener("click", () => openEdit(savedBarcode.value, savedBarcode.format, savedBarcode.label, "Edit barcode"));
  $("bcDelete").addEventListener("click", () => {
    if (!confirm("Delete your saved barcode?")) return;
    savedBarcode = null;
    saveState();
    closeSheet();
  });

  /* ---------- open / close ---------- */
  function openSheet() {
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    showSaved();
  }
  function closeSheet() {
    stopScan();
    releaseAwake();
    sheet.hidden = true;
    document.body.style.overflow = "";
  }
  btn.addEventListener("click", openSheet);
  $("bcClose").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !sheet.hidden && !views.show.hidden) keepAwake();
  });
})();
