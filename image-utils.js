// ============================================================
// Yoonou — Réduction des photos avant envoi (économise le stockage et le transfert Supabase)
//
// yoonouCompressImage(file, { maxSide, quality })
//   - redimensionne une photo (côté le plus long = maxSide pixels) et la convertit en JPEG
//   - ne touche pas aux PDF, aux petites images (< 300 Ko) ni aux fichiers illisibles : renvoie alors le fichier d'origine
//   - ne renvoie jamais un fichier plus gros que l'original
// Une photo de téléphone de 3 à 5 Mo devient environ 250 à 500 Ko, toujours lisible.
// ============================================================
async function yoonouCompressImage(file, options){
  const o = Object.assign({ maxSide: 1600, quality: 0.75, minBytes: 300 * 1024 }, options || {});
  try {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '')) return file;   // PDF et autres : inchangés
    if (file.size < o.minBytes) return file;                                                   // déjà léger

    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('image illisible'));
        i.src = url;
      });
    } finally { URL.revokeObjectURL(url); }

    const k = Math.min(1, o.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);      // fond blanc pour les PNG transparents
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', o.quality));
    if (!blob || blob.size >= file.size) return file;

    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], base + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Photo envoyée telle quelle :', e && e.message);
    return file;
  }
}
if (typeof module !== 'undefined') module.exports = { yoonouCompressImage };
