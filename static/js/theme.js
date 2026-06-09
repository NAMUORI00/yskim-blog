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

  const syncGiscusTheme = (theme) => {
    const giscusFrame = document.querySelector("iframe.giscus-frame");
    if (!giscusFrame || !giscusFrame.contentWindow) {
      return false;
    }

    giscusFrame.contentWindow.postMessage({
      giscus: {
        setConfig: {
          theme,
        },
      },
    }, "https://giscus.app");
    return true;
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

    syncGiscusTheme(nextTheme);

    window.dispatchEvent(new CustomEvent("yskim:theme-change", { detail: { theme: nextTheme } }));
  };

  setTheme(getPreferredTheme(), false);

  const observer = new MutationObserver(() => {
    const synced = syncGiscusTheme(document.documentElement.dataset.theme || getPreferredTheme());
    if (synced) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", () => {
    const synced = syncGiscusTheme(document.documentElement.dataset.theme || getPreferredTheme());
    if (synced) {
      observer.disconnect();
    }
  });

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
