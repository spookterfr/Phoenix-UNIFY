const currentPage = window.location.pathname.split("/").pop() || "index.html";

const navInner = document.querySelector(".nav-inner");
const bottomNav = document.querySelector(".bottom-nav");
const homeButton = document.querySelector(".home-button");
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const allNavLinks = homeButton ? [homeButton, ...navItems] : navItems;

allNavLinks.forEach((item) => {
  if (item.getAttribute("href") === currentPage) {
    item.classList.add("active");
  }
});

// Keep the Home button a true circle at every viewport size. aspect-ratio
// combined with flex "stretch" sizing renders as an oval in some mobile
// WebKit versions, so instead we measure the pill's real rendered height
// and set the button's width/height to match it directly.
if (bottomNav && homeButton) {
  const syncHomeButtonSize = () => {
    const h = bottomNav.getBoundingClientRect().height;
    if (h > 0) {
      homeButton.style.width = `${h}px`;
      homeButton.style.height = `${h}px`;
    }
  };

  syncHomeButtonSize();
  // run again after the first paint in case fonts/layout settle late
  requestAnimationFrame(syncHomeButtonSize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncHomeButtonSize);
  }
  window.addEventListener("resize", syncHomeButtonSize);
  window.addEventListener("orientationchange", syncHomeButtonSize);
}

if (navInner && navItems.length) {
  // An invisible SVG filter that genuinely displaces (refracts) whatever is
  // rendered behind the lens, rather than just blurring it. Only Chromium-
  // based browsers currently apply SVG filters through backdrop-filter;
  // everywhere else the plain blur() fallback in the CSS still applies.
  if (!document.getElementById("liquid-glass-distortion")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<svg aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden;">
        <filter id="liquid-glass-distortion" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="2" seed="4" result="noise"/>
          <feGaussianBlur in="noise" stdDeviation="3" result="softNoise"/>
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="34" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </svg>`
    );
  }

  const indicator = document.createElement("div");
  indicator.className = "glass-indicator";
  navInner.appendChild(indicator);

  const DRAG_THRESHOLD = 6;  // px before a tap becomes a slide
  const EASE = 0.22;         // how quickly the lens catches up
  const MAGNETISM = 0.15;    // gentle pull toward the nearest item's center
  const SQUISH_K = 0.012;    // velocity -> liquid stretch
  const SQUISH_MAX = 0.22;

  let pointerId = null;
  let dragging = false;
  let lensMode = false; // true once the gesture has become a slide, not just a press
  let moved = false;
  let startX = 0;
  let startY = 0;
  let pointerX = 0;
  let lastCenter = null;
  let targetItem = null;
  let lensW = 0;
  let lensH = 0;
  let rowCenterY = 0;
  let current = { x: 0, y: 0, w: 0, h: 0 };
  let rafId = null;

  const navRect = () => navInner.getBoundingClientRect();

  const rectFor = (item) => {
    const ir = item.getBoundingClientRect();
    const pr = navRect();
    return { x: ir.left - pr.left, y: ir.top - pr.top, w: ir.width, h: ir.height };
  };

  const itemAtX = (x) => {
    const pr = navRect();
    let best = navItems[0];
    let bestDist = Infinity;
    navItems.forEach((item) => {
      const ir = item.getBoundingClientRect();
      const left = ir.left - pr.left;
      const center = left + ir.width / 2;
      const dist = Math.abs(x - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    });
    return best;
  };

  const placeIndicator = (rect) => {
    indicator.style.left = `${rect.x}px`;
    indicator.style.top = `${rect.y}px`;
    indicator.style.width = `${rect.w}px`;
    indicator.style.height = `${rect.h}px`;
    indicator.style.bottom = "auto";
  };

  const tick = () => {
    if (!dragging) return;

    if (lensMode) {
      // The lens slides freely along the pointer's path. It does not resize
      // or reposition itself to fit whichever item happens to be underneath;
      // it just glides, with a slight magnetic pull toward the nearest item's
      // center so it still feels like it's "seeking" a landing spot.
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
      const stretchX = 1 + squish;
      const stretchY = 1 - squish * 0.7;
      const highlightX = ((pointerX - current.x) / current.w) * 100;

      indicator.style.left = `${current.x}px`;
      indicator.style.top = `${current.y}px`;
      indicator.style.width = `${current.w}px`;
      indicator.style.height = `${current.h}px`;
      indicator.style.transform = `scale(${stretchX}, ${stretchY})`;
      indicator.style.setProperty("--hl-x", `${highlightX}%`);
    }

    rafId = requestAnimationFrame(tick);
  };

  const beginDrag = (item) => {
    const r = rectFor(item);
    current = { x: r.x, y: r.y, w: r.w, h: r.h };
    targetItem = item;
    lensMode = false;
    lastCenter = null;

    const rowH = navRect().height;
    rowCenterY = rowH / 2;
    // wider than tall, so it reads as a rounded rectangle rather than a circle
    lensH = Math.max(rowH * 1.45, r.h * 1.3);
    lensW = lensH * 1.35;

    indicator.classList.remove("snapping", "lens");
    indicator.style.opacity = "";
    indicator.style.borderRadius = "17px";
    indicator.style.transform = "scale(1, 1)";
    placeIndicator(current);
    indicator.classList.add("dragging");

    if (bottomNav) bottomNav.classList.add("holding");
    rafId = requestAnimationFrame(tick);
  };

  const cancelDrag = () => {
    dragging = false;
    lensMode = false;
    if (rafId) cancelAnimationFrame(rafId);
    indicator.classList.remove("dragging", "snapping", "lens");
    indicator.style.opacity = "0";
    if (bottomNav) bottomNav.classList.remove("holding");
    targetItem = null;
  };

  const finishDrag = () => {
    dragging = false;
    lensMode = false;
    if (rafId) cancelAnimationFrame(rafId);
    indicator.classList.remove("dragging", "lens");
    if (bottomNav) bottomNav.classList.remove("holding");

    if (!targetItem) return;

    // this is the one moment the lens actually "grabs" a shape: it morphs
    // from the free-floating blob into the exact bounds of the item it
    // landed on
    const r = rectFor(targetItem);
    const href = targetItem.getAttribute("href");
    const isSamePage = href === currentPage;

    indicator.classList.add("snapping");
    indicator.style.transform = "scale(1, 1)";
    indicator.style.borderRadius = "17px";
    indicator.style.left = `${r.x}px`;
    indicator.style.top = `${r.y}px`;
    indicator.style.width = `${r.w}px`;
    indicator.style.height = `${r.h}px`;

    window.setTimeout(
      () => {
        indicator.classList.remove("snapping");
        indicator.style.opacity = "0";
        if (!isSamePage && href) {
          window.location.href = href;
        }
      },
      isSamePage ? 220 : 280
    );

    targetItem = null;
  };

  navInner.addEventListener("pointerdown", (e) => {
    const item = e.target.closest(".nav-item");
    if (!item) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    pointerX = e.clientX - navRect().left;
    moved = false;
    dragging = true;
    beginDrag(item);
  });

  navInner.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved = true;
      lensMode = true;
      indicator.classList.add("lens");
      indicator.style.borderRadius = ""; // let the .lens class take over
      if (navInner.setPointerCapture) {
        navInner.setPointerCapture(pointerId);
      }
    }

    if (moved) {
      e.preventDefault();
    }

    pointerX = e.clientX - navRect().left;
  });

  const onPointerUp = (e) => {
    if (e.pointerId !== pointerId || !dragging) return;

    if (navInner.hasPointerCapture && navInner.hasPointerCapture(pointerId)) {
      navInner.releasePointerCapture(pointerId);
    }

    if (moved) {
      finishDrag();
    } else {
      // a plain tap: let the native click handle navigation
      cancelDrag();
    }
  };

  navInner.addEventListener("pointerup", onPointerUp);
  navInner.addEventListener("pointercancel", cancelDrag);

  navInner.addEventListener("click", (e) => {
    if (moved) {
      // we already navigate manually after the snap animation
      e.preventDefault();
    }
  });
}
