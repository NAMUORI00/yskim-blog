(() => {
  const defaultReactionKeys = ["like", "useful", "reread"];
  const containers = document.querySelectorAll("[data-post-reactions]");

  const getReactionKeys = (container) => {
    const keys = [...container.querySelectorAll("[data-reaction-button]")]
      .map((button) => button.dataset.reaction)
      .filter(Boolean);
    return keys.length > 0 ? [...new Set(keys)] : defaultReactionKeys;
  };

  const readStoredReaction = (key, reactionKeys) => {
    try {
      const value = localStorage.getItem(key);
      return reactionKeys.includes(value) ? value : "";
    } catch {
      return "";
    }
  };

  const writeStoredReaction = (key, reaction) => {
    try {
      if (reaction) {
        localStorage.setItem(key, reaction);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Reaction clicks still update the visible state when storage is unavailable.
    }
  };

  const emptyCountsFor = (reactionKeys) =>
    Object.fromEntries(reactionKeys.map((key) => [key, 0]));

  const normalizeCounts = (counts, reactionKeys) => ({
    ...emptyCountsFor(reactionKeys),
    ...Object.fromEntries(
      Object.entries(counts || {})
        .filter(([key]) => reactionKeys.includes(key))
        .map(([key, value]) => [key, Math.max(0, Number(value) || 0)]),
    ),
  });

  const applyLocalSelection = (counts, selected, reactionKeys) => {
    const nextCounts = normalizeCounts(counts, reactionKeys);
    if (selected) {
      nextCounts[selected] = Math.max(0, (Number(nextCounts[selected]) || 0) + 1);
    }
    return nextCounts;
  };

  const applyReactionDelta = (counts, previousReaction, nextReaction, reactionKeys) => {
    const nextCounts = normalizeCounts(counts, reactionKeys);
    if (previousReaction && previousReaction !== nextReaction) {
      nextCounts[previousReaction] = Math.max(0, (Number(nextCounts[previousReaction]) || 0) - 1);
    }
    if (nextReaction && previousReaction !== nextReaction) {
      nextCounts[nextReaction] = Math.max(0, (Number(nextCounts[nextReaction]) || 0) + 1);
    }
    return nextCounts;
  };

  const setStatus = (container, label) => {
    const status = container.querySelector("[data-reaction-status]");
    if (status) {
      status.textContent = label || "";
    }
  };

  const setBusy = (container, isBusy) => {
    container.classList.toggle("is-saving", isBusy);
    container.setAttribute("aria-busy", String(isBusy));
  };

  const render = (container, counts, selected, reactionKeys) => {
    const nextCounts = normalizeCounts(counts, reactionKeys);
    container.querySelectorAll("[data-reaction-button]").forEach((button) => {
      const reaction = button.dataset.reaction;
      const active = reaction === selected;
      const count = container.querySelector(`[data-reaction-count="${reaction}"]`);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      if (count) {
        count.textContent = String(nextCounts[reaction] || 0);
      }
    });
    const total = container.querySelector("[data-reaction-total]");
    if (total) {
      total.textContent = String(reactionKeys.reduce((sum, key) => sum + (nextCounts[key] || 0), 0));
    }
  };

  const loadCounts = async (container, selected, reactionKeys) => {
    setStatus(container, container.dataset.loadingLabel);
    const response = await fetch(`/api/reactions?path=${encodeURIComponent(container.dataset.path)}`, {
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      throw new Error("Failed to load reactions");
    }
    const payload = await response.json();
    if (payload.mode === "local") {
      setStatus(container, container.dataset.localLabel);
      return {
        counts: applyLocalSelection(emptyCountsFor(reactionKeys), selected, reactionKeys),
        mode: "local",
      };
    }
    setStatus(container, container.dataset.sharedLabel);
    return {
      counts: normalizeCounts(payload.reactions, reactionKeys),
      mode: "shared",
    };
  };

  const saveReaction = async (container, previousReaction, reaction) => {
    const response = await fetch("/api/reactions", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: container.dataset.path,
        previousReaction,
        reaction,
      }),
    });
    if (!response.ok && response.status !== 202) {
      throw new Error("Failed to save reaction");
    }
    return response.json();
  };

  const init = async (container) => {
    const reactionKeys = getReactionKeys(container);
    const storageKey = container.dataset.storageKey;
    let selected = readStoredReaction(storageKey, reactionKeys);
    let counts = applyLocalSelection(emptyCountsFor(reactionKeys), selected, reactionKeys);
    let mode = "local";
    render(container, counts, selected, reactionKeys);

    try {
      const payload = await loadCounts(container, selected, reactionKeys);
      counts = payload.counts;
      mode = payload.mode;
      render(container, counts, selected, reactionKeys);
    } catch {
      setStatus(container, container.dataset.offlineLabel);
      render(container, counts, selected, reactionKeys);
    }

    container.querySelectorAll("[data-reaction-button]").forEach((button) => {
      button.addEventListener("click", async () => {
        const previousReaction = selected;
        const nextReaction = previousReaction === button.dataset.reaction ? "" : button.dataset.reaction;
        selected = nextReaction;
        writeStoredReaction(storageKey, selected);
        counts = applyReactionDelta(counts, previousReaction, nextReaction, reactionKeys);
        render(container, counts, selected, reactionKeys);
        setStatus(container, container.dataset.savingLabel);
        setBusy(container, true);

        try {
          const payload = await saveReaction(container, previousReaction, nextReaction);
          mode = payload.mode || mode;
          counts = mode === "local"
            ? applyLocalSelection(emptyCountsFor(reactionKeys), selected, reactionKeys)
            : normalizeCounts(payload.reactions, reactionKeys);
          render(container, counts, selected, reactionKeys);
          setStatus(container, mode === "local" ? container.dataset.localLabel : container.dataset.savedLabel);
        } catch {
          render(container, counts, selected, reactionKeys);
          setStatus(container, container.dataset.offlineLabel);
        } finally {
          setBusy(container, false);
        }
      });
    });
  };

  containers.forEach(init);
})();
