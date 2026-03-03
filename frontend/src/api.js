const BASE = "http://localhost:8000/api";

export async function addTask(taskData) {
  // Support both string (legacy) and object formats
  let payload;
  if (typeof taskData === 'string') {
    payload = { text: taskData };
  } else {
    payload = taskData;
  }
  
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getReminders(windowMinutes = 60) {
  const res = await fetch(`${BASE}/reminders?window=${windowMinutes}`);
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

export async function send_prompt(prompt) {
  const res = await fetch(`${BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt }),
  });
  
  return res.json();
}
