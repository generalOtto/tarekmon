// 160×144 logical screen, integer scaled
export const W = 160, H = 144;
export function createScreen(canvasEl) {
  canvasEl.width = W; canvasEl.height = H;
  const ctx = canvasEl.getContext('2d'); ctx.imageSmoothingEnabled = false;
  function fit() {
    const frame = canvasEl.parentElement;
    const scale = Math.max(1, Math.floor(Math.min(frame.clientWidth / W, frame.clientHeight / H)));
    canvasEl.style.width = `${W * scale}px`; canvasEl.style.height = `${H * scale}px`;
  }
  window.addEventListener('resize', fit); fit();
  return { ctx, W, H, fit, clear(color = '#000') { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); } };
}
