/* Give the person a file. A browser tab downloads it; an iPhone home-screen app cannot, so it opens the share sheet instead
   (Save to Files, AirDrop, Mail…). */
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export async function saveFile(name, blob) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (isIOS() && standalone() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
