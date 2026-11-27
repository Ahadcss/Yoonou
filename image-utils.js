// ============================================================
// Yoonou — Photos légères (économise le stockage et le transfert Supabase)
//
// yoonouCompressImage(file, { maxSide, quality })  réduit une photo (JPEG, côté max 1280 px par défaut)
// yoonouMakeThumb(file)                            fabrique une miniature (~320 px, quelques Ko)
// yoonouUploadThumb(sb, bucket, path, file)        envoie la miniature à côté de la photo : <nom>_thumb.jpg
// yoonouThumbUrl(url)                              adresse de la miniature d'une photo (ou null)
//
// Les PDF, les images déjà légères et les fichiers illisibles ne sont pas modifiés.
// ============================================================
async function _yoonouResize(file, maxSide, quality, minBytes){
  try {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '')) return file;   // PDF et autres : inchangés
    if (file.size < minBytes) return file;                                                     // déjà léger

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

    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);      // fond blanc pour les PNG transparents
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || (minBytes > 0 && blob.size >= file.size)) return file;

    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], base + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Photo envoyée telle quelle :', e && e.message);
    return file;
  }
}

async function yoonouCompressImage(file, options){
  const o = Object.assign({ maxSide: 1280, quality: 0.7, minBytes: 200 * 1024 }, options || {});
  return _yoonouResize(file, o.maxSide, o.quality, o.minBytes);
}

async function yoonouMakeThumb(file){
  const t = await _yoonouResize(file, 320, 0.6, 0);
  if (t === file) return null;
  const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([t], base + '_thumb.jpg', { type: 'image/jpeg' });
}

// Adresse de la miniature d'une photo : « …/photo.jpg » -> « …/photo_thumb.jpg »
function yoonouThumbUrl(url){
  const u = String(url || '');
  return /\.jpg(\?.*)?$/i.test(u) && !/_thumb\.jpg/i.test(u) ? u.replace(/\.jpg(\?.*)?$/i, '_thumb.jpg$1') : null;
}

async function yoonouUploadThumb(sb, bucket, path, file){
  try {
    if (!file || file.type !== 'image/jpeg' || !/\.jpg$/i.test(path)) return;
    const thumb = await yoonouMakeThumb(file);
    if (!thumb) return;
    await sb.storage.from(bucket).upload(path.replace(/\.jpg$/i, '_thumb.jpg'), thumb);
  } catch (e) { /* la miniature est facultative */ }
}

if (typeof module !== 'undefined') module.exports = { yoonouCompressImage, yoonouMakeThumb, yoonouThumbUrl, yoonouUploadThumb };
