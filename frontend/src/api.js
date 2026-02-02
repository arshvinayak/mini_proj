const BASE = "http://localhost:8000/api";

export async function addTask(text) {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function getReminders(windowMinutes = 60) {
  const res = await fetch(`${BASE}/reminders?window=${windowMinutes}`);
  return res.json();
}

export async function getNotifications() {
  const res = await fetch(`${BASE}/notifications`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function deleteTask(taskId) {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Delete failed: " + (txt || res.status));
  }
  return res.json();
}
