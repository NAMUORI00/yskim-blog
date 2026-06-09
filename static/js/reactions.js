(() => {
  const reactionKeys = ["like", "useful", "reread"];
  const containers = document.querySelectorAll("[data-post-reactions]");

  const readStoredReaction = (key) => {
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

  const emptyCounts = () =>
    Object.fromEntries(reactionKeys.map((key) => [key, 0]));

  const applyLocalSelection = (counts, selected) => {
    const nextCounts = { ...emptyCounts(), ...counts };
    if (selected) {
      nextCounts[selected] = Math.max(0, (Number(nextCounts[selected]) || 0) + 1);
    }
    return nextCounts;
  };

  const render = (container, counts, selected) => {
    container.querySelectorAll("[data-reaction-button]").forEach((button) => {
      const reaction = button.dataset.reaction;
      const active = reaction === selected;
      const count = container.querySelector(`[data-reaction-count="${reaction}"]`);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      if (count) {
        count.textContent = String(Math.max(0, Number(counts[reaction]) || 0));
      }
    });
  };

  const loadCounts = async (container, selected) => {
    const response = await fetch(`/api/reactions?path=${encodeURIComponent(container.dataset.path)}`, {
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      throw new Error("Failed to load reactions");
    }
    const payload = await response.json();
    return applyLocalSelection(payload.reactions || emptyCounts(), payload.mode === "local" ? selected : "");
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
    const storageKey = container.dataset.storageKey;
    let selected = readStoredReaction(storageKey);
    let counts = applyLocalSelection(emptyCounts(), selected);
    render(container, counts, selected);

    try {
      counts = await loadCounts(container, selected);
      render(container, counts, selected);
    } catch {
      render(container, counts, selected);
    }

    container.querySelectorAll("[data-reaction-button]").forEach((button) => {
      button.addEventListener("click", async () => {
        const previousReaction = selected;
        const nextReaction = previousReaction === button.dataset.reaction ? "" : button.dataset.reaction;
        selected = nextReaction;
        writeStoredReaction(storageKey, selected);
        counts = applyLocalSelection(emptyCounts(), selected);
        render(container, counts, selected);

        try {
          const payload = await saveReaction(container, previousReaction, nextReaction);
          counts = payload.mode === "local"
            ? applyLocalSelection(emptyCounts(), selected)
            : payload.reactions || counts;
          render(container, counts, selected);
        } catch {
          render(container, counts, selected);
        }
      });
    });
  };

  containers.forEach(init);
})();
