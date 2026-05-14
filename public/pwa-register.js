(async function () {
  if (!('serviceWorker' in navigator)) return;

  // Hủy toàn bộ SW cũ (kể cả sw.js cũ)
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    if (!reg.active?.scriptURL?.includes('sw2.js')) {
      await reg.unregister();
    }
  }

  // Xóa toàn bộ cache cũ
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => !k.includes('app-cache-v2')).map(k => caches.delete(k)));

  // Đăng ký SW mới
  const reg = await navigator.serviceWorker.register('/sw2.js');
  reg.update();

  // Khi có SW mới → activate ngay
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        w.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });

  // Sau khi SW mới activate → reload lấy file mới
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
  });
})();
