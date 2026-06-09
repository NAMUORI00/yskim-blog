(() => {
  const storageKey = "yskim-theme";
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const body = document.body;
  const toggle = document.querySelector("[data-theme-toggle]");

  const readSavedTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const writeSavedTheme = (theme) => {
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // The visible theme can still change even when storage is unavailable.
    }
  };

  const getPreferredTheme = () => {
    const saved = readSavedTheme();
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return darkQuery.matches ? "dark" : "light";
  };

  const setTheme = (theme, persist) => {
    const nextTheme = theme === "dark" ? "dark" : "light";
    body.classList.toggle("theme-dark", nextTheme === "dark");
    body.classList.toggle("theme-light", nextTheme === "light");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add("theme-" + nextTheme);

    if (persist) {
      writeSavedTheme(nextTheme);
    }

    if (toggle) {
      const targetLabel = nextTheme === "dark" ? toggle.dataset.lightLabel : toggle.dataset.darkLabel;
      toggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
      toggle.setAttribute("title", targetLabel);
      toggle.setAttribute("aria-label", targetLabel);
    }

    const giscusFrame = document.querySelector("iframe.giscus-frame");
    if (giscusFrame) {
      giscusFrame.contentWindow.postMessage({
        giscus: {
          setConfig: {
            theme: nextTheme,
          },
        },
      }, "https://giscus.app");
    }

    window.dispatchEvent(new CustomEvent("yskim:theme-change", { detail: { theme: nextTheme } }));
  };

  setTheme(getPreferredTheme(), false);

  if (toggle) {
    toggle.addEventListener("click", () => {
      const nextTheme = body.classList.contains("theme-dark") ? "light" : "dark";
      setTheme(nextTheme, true);
    });
  }

  darkQuery.addEventListener("change", () => {
    if (!readSavedTheme()) {
      setTheme(getPreferredTheme(), false);
    }
  });
})();
