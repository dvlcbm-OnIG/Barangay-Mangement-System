const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
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

