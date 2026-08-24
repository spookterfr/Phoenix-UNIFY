const currentPage = window.location.pathname.split("/").pop() || "index.html";

document.querySelectorAll(".nav-item").forEach((item) => {
  const link = item.getAttribute("href");

  if (link === currentPage) {
    item.classList.add("active");
  }
});
