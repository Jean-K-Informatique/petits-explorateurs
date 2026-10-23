(() => {
  // Pictures added by the parent for the puzzles ("Mes images"). They are kept in this browser's
  // own database (IndexedDB), never uploaded anywhere, and shrunk so they stay light.
  const DB = 'petits-explorateurs'; const STORE = 'images'; const MAX_SIDE = 1600;
  let opening = null;
  function db() {
    opening ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return opening;
  }
  async function run(mode, action) {
    const store = (await db()).transaction(STORE, mode).objectStore(STORE);
    return new Promise((resolve, reject) => { const request = action(store); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  const urls = new Map();
  function url(record) { if (!urls.has(record.id)) urls.set(record.id, URL.createObjectURL(record.blob)); return urls.get(record.id); }
  async function list() {
    const records = (await run('readonly', (store) => store.getAll())).sort((a, b) => a.added - b.added);
    return records.map((record) => ({ id: record.id, name: record.name, photo: url(record) }));
  }
  async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
  }
  async function add(file) {
    const blob = await shrink(file);
    const record = { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.[^.]+$/, ''), blob, added: Date.now() };
    await run('readwrite', (store) => store.put(record));
  }
  async function remove(id) {
    await run('readwrite', (store) => store.delete(id));
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }
  window.MyImages = { list, add, remove };
})();
