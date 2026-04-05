function loadNavbar() {
  fetch("includes/navbar.html")
    .then(res => res.text())
    .then(data => {
      document.getElementById("navbar").innerHTML = data;

      setActiveMenu();
      setUser();
    })
    .catch(err => console.error("โหลด navbar ไม่ได้", err));
}

// 🔥 active menu (สมบูรณ์)
function setActiveMenu() {
  const links = document.querySelectorAll(".menu-link");
  const current = window.location.pathname.split("/").pop() || "index.html";
  const currentUrl = window.location.href;

  links.forEach(link => {
    const linkPage = link.getAttribute("href");

    // 🔹 reset ทุกอันก่อน
    link.classList.remove("text-blue-600", "font-bold");
    link.classList.add("text-gray-700");

    const icon = link.querySelector("svg");
    if (icon) {
      icon.classList.remove("text-blue-600");
    }

    // 🔹 ถ้าเป็นหน้าปัจจุบัน
    if (linkPage === current || currentUrl.includes(linkPage)) {
      link.classList.remove("text-gray-700");
      link.classList.add("text-blue-600", "font-bold");

      if (icon) {
        icon.classList.add("text-blue-600");
      }
    }
  });
}

// 👤 user
function setUser() {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("login"));
  } catch (error) {}

  const name = (user && user.name) || localStorage.getItem("userName");
  if (name) {
    document.getElementById("username").innerText = "👋 " + name;
  }
}

// 🚪 logout
function logout() {
  localStorage.removeItem("login");
  window.location.href = "login.html";
}

// ✨ hover (แก้ให้ไม่ซ้อน)
document.addEventListener("mouseover", function(e) {
  const link = e.target.closest(".menu-link");
  if (link) {
    link.classList.add("scale-105");
  }
});

document.addEventListener("mouseout", function(e) {
  const link = e.target.closest(".menu-link");
  if (link) {
    link.classList.remove("scale-105");
  }
});

// โหลด navbar
document.addEventListener("DOMContentLoaded", loadNavbar);