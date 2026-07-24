const toggleButton = document.getElementById("toggle-btn")
const sidebar  = document.getElementById("sidebar")

if (localStorage.getItem("sidebarClosed") === "true") {
  // Apply the closed state instantly, with no transition, so it doesn't
  // visibly animate open-then-closed on every page load. requestAnimationFrame
  // isn't a reliable enough checkpoint here — browsers batch style recalculation
  // lazily, so removing "no-transition" there can land in the same recalc as
  // adding "close", re-enabling the transition before the closed state is ever
  // actually committed as its own frame. Reading a layout property forces an
  // immediate, synchronous reflow, guaranteeing the closed+no-transition state
  // is committed before we remove "no-transition" right after.
  sidebar.classList.add("no-transition")
  sidebar.classList.add("close")
  toggleButton.classList.add("rotate")
  sidebar.offsetHeight
  sidebar.classList.remove("no-transition")
}

function toggleSidebar() {
  sidebar.classList.toggle("close")
  toggleButton.classList.toggle("rotate")
  localStorage.setItem("sidebarClosed", sidebar.classList.contains("close"))

  closeAllSubMenus()
}

function toggleSubMenu(button) {
  if(!button.nextElementSibling.classList.contains("show"))
      closeAllSubMenus()

  button.nextElementSibling.classList.toggle('show')
  button.classList.toggle('rotate')

  if(sidebar.classList.contains("close")) {
    sidebar.classList.toggle("close")
    toggleButton.classList.toggle("rotate")
  }
}

function closeAllSubMenus() {
  Array.from(sidebar.getElementsByClassName("show")).forEach(ul => {
    ul.classList.remove("show")
    ul.previousElementSibling.classList.remove("rotate")
  })
}
