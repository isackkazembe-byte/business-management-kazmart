export async function loadComponent(selector, path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (status: ${res.status})`);
    document.querySelector(selector).innerHTML = await res.text();
  } catch (err) {
    console.error('Component load error:', err);
  }
}