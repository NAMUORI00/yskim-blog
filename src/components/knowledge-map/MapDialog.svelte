<script>
  // The wide view: the same map and state as the rail, in a modal dialog with
  // room for names, zoom, and a list view. Esc unpins, then returns to the whole
  // view, then closes; focus goes back to the button that opened it.
  import { onMount, tick } from "svelte";
  import MapSurface from "./MapSurface.svelte";
  import MotionToggle from "./MotionToggle.svelte";
  import { EXPLORER_HINT, nextId } from "./shared.mjs";

  let { data, explore, onExplore, motion, onMotion = () => {}, announcement = "", returnFocus = null, onClose = () => {} } = $props();

  const ROTATE_STEP = 0.42;
  const titleId = nextId("km-dialog-title");
  const descId = nextId("km-dialog-desc");
  let dialog = $state(null);
  let content = $state(null);
  let closeButton = $state(null);
  let surface = $state(null);
  let view = $state("space");
  let downOnBackdrop = false;
  const overview = $derived(explore.mode === "overview");

  onMount(() => {
    document.documentElement.classList.add("has-km-dialog");
    dialog.showModal();
    tick().then(() => (surface?.initialFocusTarget() ?? closeButton)?.focus({ preventScroll: true }));
    return () => document.documentElement.classList.remove("has-km-dialog");
  });

  function close() {
    if (dialog?.open) dialog.close();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    // Handled here (not on `cancel`) so each Esc step is ours and the browser never skips one.
    event.preventDefault();
    if (!surface?.escape()) close();
  }

  function onDialogClose() {
    document.documentElement.classList.remove("has-km-dialog");
    onClose();
    tick().then(() => returnFocus?.focus({ preventScroll: true }));
  }
</script>

<!-- The dialog closes on its own backdrop only; inner clicks never reach here as the target. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="km-root km-dialog kg3-dialog"
  aria-labelledby={titleId}
  aria-describedby={descId}
  onkeydown={onKeyDown}
  onclose={onDialogClose}
  onpointerdown={(event) => (downOnBackdrop = event.target === dialog)}
  onclick={(event) => {
    if (downOnBackdrop && event.target === dialog) close();
  }}
>
  <div bind:this={content} class="kg3-dialog-inner" data-mode={explore.mode}>
    <header class="kg3-dialog-head">
      <div>
        <p class="km-kicker">Knowledge Map</p>
        <h2 id={titleId} class="kg3-dialog-title">지식 지도</h2>
        <p id={descId} class="kg3-dialog-desc">카테고리를 고르면 그 안의 주제와 글이 층으로 펼쳐집니다.</p>
      </div>
      <button bind:this={closeButton} type="button" class="km-dialog-close" aria-label="닫기" title="닫기" onclick={close}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </header>
    <div class="km-dialog-toolbar kg3-toolbar">
      <div class="km-segment" role="group" aria-label="보기 방식">
        <button type="button" aria-pressed={view === "space"} onclick={() => (view = "space")}>공간</button>
        <button type="button" aria-pressed={view === "list"} onclick={() => (view = "list")}>목록</button>
      </div>
      <MotionToggle {motion} onChange={onMotion} />
      {#if view === "space" && overview}
        <div class="km-tools">
          <button type="button" class="km-tool" aria-label="왼쪽으로 돌리기" title="왼쪽으로 돌리기" onclick={() => surface?.rotate(-ROTATE_STEP)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5" /></svg>
          </button>
          <button type="button" class="km-tool" aria-label="오른쪽으로 돌리기" title="오른쪽으로 돌리기" onclick={() => surface?.rotate(ROTATE_STEP)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" /></svg>
          </button>
          <button type="button" class="km-tool" aria-label="축소" title="축소" onclick={() => surface?.zoomBy(1 / 1.25)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 8h9" /></svg>
          </button>
          <button type="button" class="km-tool" aria-label="확대" title="확대" onclick={() => surface?.zoomBy(1.25)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
          </button>
          <button type="button" class="km-tool km-tool-text" onclick={() => surface?.resetView()}>처음 시점</button>
        </div>
        <p class="km-hint km-dialog-hint">{EXPLORER_HINT}</p>
      {/if}
    </div>
    <MapSurface bind:this={surface} {data} variant="explorer" {explore} {onExplore} {motion} {onMotion} {view} region={content} {announcement} />
  </div>
</dialog>
