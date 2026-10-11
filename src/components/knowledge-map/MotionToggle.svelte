<script>
  // Motion on/off for the map (breathing, pointer tilt, signals). With the
  // device's reduced-motion setting it stays off and says why; view changes
  // still happen, just without travel.
  import { nextId } from "./shared.mjs";

  let { motion, onChange = () => {} } = $props();

  const helpId = nextId("kg3-motion-help");
  const on = $derived(motion.enabled);
  const help = $derived(
    motion.reduced
      ? "기기에서 움직임 줄이기를 켜 두어 움직임이 꺼져 있습니다. 보기 전환은 움직임 없이 바로 바뀝니다."
      : "지도의 은은한 움직임과 포인터 반응을 켜거나 끕니다.",
  );
</script>

<button
  type="button"
  class="kg3-motion"
  aria-pressed={on}
  aria-describedby={helpId}
  disabled={motion.reduced}
  title={help}
  onclick={() => onChange(on ? "off" : "on")}
>
  <span class="kg3-motion-dot" aria-hidden="true"></span>
  움직임
  <span class="kg3-motion-state" aria-hidden="true">{motion.reduced ? "끔 (기기 설정)" : on ? "켬" : "끔"}</span>
</button>
<span id={helpId} class="km-sr">{help}</span>
