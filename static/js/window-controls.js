(() => {
  const windows = [...document.querySelectorAll("[data-content-window]")];
  if (windows.length === 0) return;

  const maximizeClass = "is-maximized";
  const minimizeClass = "is-minimized";

  const setExpandedState = (card) => {
    const minimized = card.classList.contains(minimizeClass);
    const maximized = card.classList.contains(maximizeClass);
    card.setAttribute("aria-expanded", String(!minimized));
    card.querySelectorAll("[data-window-action]").forEach((button) => {
      const action = button.dataset.windowAction;
      if (action === "maximize") {
        button.setAttribute("aria-pressed", String(maximized));
      }
      if (action === "minimize" || action === "close") {
        button.setAttribute("aria-pressed", String(minimized));
      }
    });
  };

  const clearMaximized = (except) => {
    windows.forEach((card) => {
      if (card !== except) {
        card.classList.remove(maximizeClass);
        setExpandedState(card);
      }
    });
    document.body.classList.toggle(
      "has-maximized-content-window",
      windows.some((card) => card.classList.contains(maximizeClass)),
    );
  };

  const minimize = (card) => {
    card.classList.remove(maximizeClass);
    card.classList.add(minimizeClass);
    document.body.classList.remove("has-maximized-content-window");
    setExpandedState(card);
  };

  const restore = (card) => {
    card.classList.remove(maximizeClass, minimizeClass);
    document.body.classList.remove("has-maximized-content-window");
    setExpandedState(card);
  };

  const toggleMinimize = (card) => {
    if (card.classList.contains(minimizeClass)) {
      restore(card);
      return;
    }
    minimize(card);
  };

  const maximize = (card) => {
    const wasMaximized = card.classList.contains(maximizeClass);
    clearMaximized(card);
    card.classList.remove(minimizeClass);
    card.classList.toggle(maximizeClass, !wasMaximized);
    document.body.classList.toggle("has-maximized-content-window", !wasMaximized);
    setExpandedState(card);
  };

  const close = (card) => {
    if (card.classList.contains(maximizeClass)) {
      card.classList.remove(maximizeClass);
      document.body.classList.remove("has-maximized-content-window");
      setExpandedState(card);
      return;
    }
    minimize(card);
  };

  windows.forEach((card) => {
    setExpandedState(card);
    card.addEventListener("click", (event) => {
      const button = event.target.closest("[data-window-action]");
      if (!button || !card.contains(button)) return;
      const action = button.dataset.windowAction;
      if (action === "minimize") toggleMinimize(card);
      if (action === "maximize") maximize(card);
      if (action === "close") close(card);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const active = windows.find((card) => card.classList.contains(maximizeClass));
    if (active) close(active);
  });
})();
