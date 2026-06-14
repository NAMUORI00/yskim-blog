<script>
  import { onMount } from "svelte";

  let width = $state(0);

  function update() {
    const el = document.documentElement;
    const total = el.scrollHeight - el.clientHeight;
    width = total > 0 ? Math.min(100, (el.scrollTop / total) * 100) : 0;
  }

  onMount(() => {
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  });
</script>

<div class="reading-progress" style={`width:${width}%`} aria-hidden="true"></div>
