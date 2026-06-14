<script>
  import { onMount } from "svelte";

  let visible = $state(false);

  function onScroll() {
    visible = window.scrollY > 600;
  }

  function toTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  onMount(() => {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });
</script>

<button
  class={`back-to-top ${visible ? "is-visible" : ""}`}
  onclick={toTop}
  aria-label="맨 위로"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 15l-6-6-6 6" />
  </svg>
</button>
