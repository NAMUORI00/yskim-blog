(() => {
  const windows = [...document.querySelectorAll("[data-content-window]")];
  if (windows.length === 0) return;

  const dragReset = document.querySelector("[data-window-drag-reset]");
  const railToggles = [...document.querySelectorAll("[data-drag-rail-toggle]")];
  const maximizeClass = "is-maximized";
  const minimizeClass = "is-minimized";
  const draggingClass = "is-dragging";
  const draggedClass = "is-dragged";
  const dragModeClass = "has-window-drag-mode";
  const maximizedBodyClass = "has-maximized-content-window";
  const leftRailOpenClass = "is-rail-left-open";
  const rightRailOpenClass = "is-rail-right-open";
  const leftRailPeekClass = "is-rail-left-peeking";
  const rightRailPeekClass = "is-rail-right-peeking";
  const dragState = new WeakMap();
  const dragThreshold = 4;
  let pendingDrag = null;
  let activeDrag = null;

  const stateFor = (card) => {
    if (!dragState.has(card)) {
      dragState.set(card, { x: 0, y: 0 });
    }
    return dragState.get(card);
  };

  const hasMoved = (card) => {
    const state = stateFor(card);
    return Math.abs(state.x) > 0.5 || Math.abs(state.y) > 0.5;
  };

  const clearRailState = () => {
    document.body.classList.remove(leftRailOpenClass, rightRailOpenClass, leftRailPeekClass, rightRailPeekClass);
    railToggles.forEach((button) => button.setAttribute("aria-expanded", "false"));
  };

  const updateRailButtons = () => {
    railToggles.forEach((button) => {
      const side = button.dataset.dragRailToggle;
      const open = side === "left"
        ? document.body.classList.contains(leftRailOpenClass)
        : document.body.classList.contains(rightRailOpenClass);
      button.setAttribute("aria-expanded", String(open));
    });
  };

  const updateDragReset = () => {
    if (!dragReset) return;
    const active = windows.some(
      (card) => card.classList.contains(draggingClass) || hasMoved(card),
    );
    dragReset.hidden = !active;
  };

  const updateDragMode = () => {
    const active = windows.some(
      (card) => card.classList.contains(maximizeClass) || card.classList.contains(draggingClass) || hasMoved(card),
    );
    document.body.classList.toggle(dragModeClass, active);
    if (!active) {
      clearRailState();
    }
    updateDragReset();
    updateRailButtons();
  };

  const updateMaximizedBodyState = () => {
    document.body.classList.toggle(
      maximizedBodyClass,
      windows.some((card) => card.classList.contains(maximizeClass)),
    );
  };

  const resetWindowPosition = (card) => {
    const state = stateFor(card);
    state.x = 0;
    state.y = 0;
    card.style.setProperty("--window-drag-x", "0px");
    card.style.setProperty("--window-drag-y", "0px");
    card.classList.remove(draggedClass, draggingClass);
  };

  const resetDraggedWindows = () => {
    windows.forEach(resetWindowPosition);
    pendingDrag = null;
    activeDrag = null;
    clearRailState();
    updateDragMode();
  };

  const applyPosition = (card, x, y) => {
    const state = stateFor(card);
    state.x = Math.round(x);
    state.y = Math.round(y);
    card.style.setProperty("--window-drag-x", `${state.x}px`);
    card.style.setProperty("--window-drag-y", `${state.y}px`);
    card.classList.toggle(draggedClass, hasMoved(card));
    updateDragMode();
  };

  const clampPosition = (card, x, y) => {
    const state = stateFor(card);
    const rect = card.getBoundingClientRect();
    const baseLeft = rect.left - state.x;
    const baseRight = rect.right - state.x;
    const baseTop = rect.top - state.y;
    const baseBottom = rect.bottom - state.y;
    const visibleX = Math.min(140, Math.max(72, rect.width * 0.3));
    const visibleY = Math.min(96, Math.max(52, rect.height * 0.22));
    const minX = visibleX - baseRight;
    const maxX = window.innerWidth - visibleX - baseLeft;
    const minY = 52 - baseBottom;
    const maxY = window.innerHeight - visibleY - baseTop;

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  };

  const startDrag = (card, event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pendingDrag = {
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    };
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  const restoreMaximizedForDrag = (card, event) => {
    if (!card.classList.contains(maximizeClass)) return;

    const maximizedRect = card.getBoundingClientRect();
    const pointerRatioX = (event.clientX - maximizedRect.left) / Math.max(maximizedRect.width, 1);
    const pointerOffsetY = Math.min(42, Math.max(18, event.clientY - maximizedRect.top));
    card.classList.remove(maximizeClass);
    updateMaximizedBodyState();
    setExpandedState(card);

    const state = stateFor(card);
    const rect = card.getBoundingClientRect();
    const pointerOffsetX = Math.min(rect.width - 72, Math.max(72, rect.width * pointerRatioX));
    const next = clampPosition(
      card,
      state.x + event.clientX - pointerOffsetX - rect.left,
      state.y + event.clientY - pointerOffsetY - rect.top,
    );
    applyPosition(card, next.x, next.y);
  };

  const activatePendingDrag = (event) => {
    if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return;
    const distance = Math.hypot(event.clientX - pendingDrag.startX, event.clientY - pendingDrag.startY);
    if (distance < dragThreshold) return;

    restoreMaximizedForDrag(pendingDrag.card, event);
    const state = stateFor(pendingDrag.card);
    activeDrag = {
      card: pendingDrag.card,
      pointerId: pendingDrag.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
      target: pendingDrag.target,
    };
    pendingDrag.card.classList.add(draggingClass);
    pendingDrag = null;
    updateDragMode();
  };

  const moveActiveDrag = (event) => {
    activatePendingDrag(event);
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const next = clampPosition(
      activeDrag.card,
      activeDrag.originX + event.clientX - activeDrag.startX,
      activeDrag.originY + event.clientY - activeDrag.startY,
    );
    applyPosition(activeDrag.card, next.x, next.y);
  };

  const stopActiveDrag = (event) => {
    if (pendingDrag && event.pointerId === pendingDrag.pointerId) {
      if (pendingDrag.target?.releasePointerCapture) {
        pendingDrag.target.releasePointerCapture(event.pointerId);
      }
      pendingDrag = null;
    }
    if (activeDrag && event.pointerId === activeDrag.pointerId) {
      activeDrag.card.classList.remove(draggingClass);
      if (activeDrag.target?.releasePointerCapture) {
        activeDrag.target.releasePointerCapture(event.pointerId);
      }
      activeDrag = null;
      updateDragMode();
    }
  };

  const updateRailPeek = (event) => {
    if (!document.body.classList.contains(dragModeClass) || activeDrag || pendingDrag) return;
    const threshold = 48;
    document.body.classList.toggle(leftRailPeekClass, event.clientX <= threshold);
    document.body.classList.toggle(rightRailPeekClass, window.innerWidth - event.clientX <= threshold);
  };

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
    updateMaximizedBodyState();
    updateDragMode();
  };

  const minimize = (card) => {
    card.classList.remove(maximizeClass);
    card.classList.add(minimizeClass);
    updateMaximizedBodyState();
    setExpandedState(card);
    updateDragMode();
  };

  const restore = (card) => {
    card.classList.remove(maximizeClass, minimizeClass);
    updateMaximizedBodyState();
    setExpandedState(card);
    updateDragMode();
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
    updateMaximizedBodyState();
    setExpandedState(card);
    updateDragMode();
  };

  const close = (card) => {
    if (card.classList.contains(maximizeClass)) {
      card.classList.remove(maximizeClass);
      updateMaximizedBodyState();
      setExpandedState(card);
      updateDragMode();
      return;
    }
    minimize(card);
  };

  railToggles.forEach((button) => {
    button.addEventListener("click", () => {
      if (!document.body.classList.contains(dragModeClass)) return;
      const side = button.dataset.dragRailToggle;
      if (side === "left") {
        document.body.classList.toggle(leftRailOpenClass);
      }
      if (side === "right") {
        document.body.classList.toggle(rightRailOpenClass);
      }
      updateRailButtons();
    });
  });

  windows.forEach((card) => {
    setExpandedState(card);
    card.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-window-action]") : null;
      if (!button || !card.contains(button)) return;
      const action = button.dataset.windowAction;
      if (action === "minimize") toggleMinimize(card);
      if (action === "maximize") maximize(card);
      if (action === "close") close(card);
    });

    const filebar = card.querySelector(".filebar");
    filebar?.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-window-action]")) return;
      startDrag(card, event);
    });
  });

  if (dragReset) {
    dragReset.addEventListener("click", resetDraggedWindows);
  }
  window.addEventListener("pointermove", updateRailPeek);
  window.addEventListener("pointermove", moveActiveDrag);
  window.addEventListener("pointerup", stopActiveDrag);
  window.addEventListener("pointercancel", stopActiveDrag);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.body.classList.contains(dragModeClass) && !document.body.classList.contains(maximizedBodyClass)) {
      resetDraggedWindows();
      return;
    }
    const active = windows.find((card) => card.classList.contains(maximizeClass));
    if (active) close(active);
  });

  updateDragMode();
})();
