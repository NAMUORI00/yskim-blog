(() => {
  const containers = document.querySelectorAll("[data-anonymous-comments]");

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  const renderComments = (container, comments) => {
    const list = container.querySelector("[data-comment-list]");
    if (!list) {
      return;
    }

    if (!comments.length) {
      list.innerHTML = `<p class="anonymous-comment-empty">${container.dataset.emptyLabel}</p>`;
      return;
    }

    list.innerHTML = comments.map((comment) => `
      <article class="anonymous-comment">
        <header>
          <strong>${escapeHtml(comment.author)}</strong>
          <time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(comment.created_at.slice(0, 10))}</time>
        </header>
        <p>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</p>
      </article>
    `).join("");
  };

  const loadComments = async (container) => {
    const path = container.dataset.path;
    const list = container.querySelector("[data-comment-list]");
    if (list) {
      list.textContent = container.dataset.loadingLabel;
    }

    try {
      const response = await fetch(`/api/comments?path=${encodeURIComponent(path)}`, {
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) {
        throw new Error("Failed to load comments");
      }
      const payload = await response.json();
      renderComments(container, payload.comments || []);
    } catch {
      if (list) {
        list.innerHTML = `<p class="anonymous-comment-empty">${container.dataset.errorLabel}</p>`;
      }
    }
  };

  const bindForm = (container) => {
    const form = container.querySelector("[data-comment-form]");
    const status = container.querySelector("[data-comment-status]");
    if (!form) {
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      const formData = new FormData(form);
      const turnstileToken = formData.get("cf-turnstile-response");

      if (submit) {
        submit.disabled = true;
      }
      if (status) {
        status.textContent = "";
      }

      try {
        const response = await fetch("/api/comments", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: container.dataset.path,
            author: formData.get("author"),
            body: formData.get("body"),
            turnstileToken,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to save comment");
        }
        form.reset();
        if (window.turnstile) {
          window.turnstile.reset();
        }
        if (status) {
          status.textContent = container.dataset.savedLabel;
        }
        await loadComments(container);
      } catch {
        if (status) {
          status.textContent = container.dataset.errorLabel;
        }
      } finally {
        if (submit) {
          submit.disabled = false;
        }
      }
    });
  };

  containers.forEach((container) => {
    bindForm(container);
    loadComments(container);
  });
})();
