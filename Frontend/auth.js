const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    if (!(await confirmLogout())) return;

    logoutButton.disabled = true;
    try {
      const response = await fetch("/logout", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to log out.");
      window.location.replace("/login.html");
    } catch (error) {
      logoutButton.disabled = false;
      const message = document.getElementById("message");
      if (message) {
        message.textContent = error.message;
        message.className = "error";
      } else {
        console.error(error);
      }
    }
  });
}

const confirmLogout = () => new Promise((resolve) => {
  const dialog = document.createElement("dialog");
  const title = document.createElement("h2");
  title.id = "logout-dialog-title";
  title.textContent = "Log out?";
  const description = document.createElement("p");
  description.id = "logout-dialog-description";
  description.textContent = "Are you sure you want to end your session?";
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.setAttribute("aria-describedby", description.id);

  const actions = document.createElement("form");
  actions.method = "dialog";
  const cancelButton = document.createElement("button");
  cancelButton.type = "submit";
  cancelButton.value = "cancel";
  cancelButton.textContent = "Cancel";
  cancelButton.autofocus = true;
  cancelButton.className = "secondary";
  const logoutConfirmButton = document.createElement("button");
  logoutConfirmButton.type = "submit";
  logoutConfirmButton.value = "confirm";
  logoutConfirmButton.textContent = "Log out";
  actions.append(cancelButton, logoutConfirmButton);
  dialog.append(title, description, actions);
  document.body.appendChild(dialog);

  dialog.addEventListener("close", () => {
    resolve(dialog.returnValue === "confirm");
    dialog.remove();
  }, { once: true });
  dialog.showModal();
});
