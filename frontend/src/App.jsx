import { useEffect, useRef, useState } from "react";
import { addTask, deleteTask, getNotifications, getReminders } from "./api";
import "./styles.css";

export default function App() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [reminders, setReminders] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [email, setEmail] = useState(localStorage.getItem("reminderEmail") || "");
  const [emailStatus, setEmailStatus] = useState("");
  const notifRef = useRef(null);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    const id = setInterval(async () => {
      try {
        const r = await getNotifications();
        if (r?.notifications?.length) {
          setNotifications((prev) => [...r.notifications.reverse(), ...prev]);
          setNotifCount((c) => c + r.notifications.length);
          r.notifications.forEach((n) => {
            if (Notification.permission === "granted") {
              new Notification(n.type === "overdue" ? "Overdue reminder" : "Upcoming reminder", {
                body: `${n.text} • ${new Date(n.at).toLocaleString()}`,
              });
            }
          });
        }
      } catch (e) {}
    }, 1000 * 25);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (notifRef.current) {
      notifRef.current.classList.remove("pulse");
      void notifRef.current.offsetWidth;
      notifRef.current.classList.add("pulse");
    }
  }, [notifCount]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) {
      setStatus("Please enter a task.");
      return;
    }
    setStatus("Saving...");
    try {
      const res = await addTask(text);
      setStatus(res.reply || "Saved");
      setText("");
      setTimeout(() => handleCheck(), 400);
    } catch (err) {
      setStatus("Error saving");
    }
  }

  async function handleCheck() {
    setReminders("Checking...");
    try {
      const res = await getReminders(60);
      const parts = [];
      if (res.overdue?.length) {
        parts.push("Overdue:");
        res.overdue.forEach((o) => parts.push(`• ${o.text} — was at ${new Date(o.at).toLocaleString()}`));
      }
      if (res.upcoming?.length) {
        parts.push("Upcoming:");
        res.upcoming.forEach((o) => parts.push(`• ${o.text} — at ${new Date(o.at).toLocaleString()}`));
      }
      if (res.all?.length) {
        setRecentTasks(res.all);
        parts.push("\nRecent tasks:");
        res.all.slice(0, 8).forEach((a) => {
          const sched = a.scheduled ? ` — ${new Date(a.scheduled).toLocaleString()}` : " — (unscheduled)";
          parts.push(`• ${a.text}${sched}`);
        });
      }
      setReminders(parts.join("\n") || "No reminders yet.");
    } catch {
      setReminders("Error loading reminders.");
    }
  }

  async function handleDeleteTask(id) {
    try {
      await deleteTask(id);
      setStatus("Deleted");
      handleCheck();
    } catch (e) {
      setStatus("Delete failed");
    }
  }

  const saveEmail = () => {
    if (!email.trim() || !email.includes("@")) {
      setEmailStatus("Please enter a valid email");
      return;
    }
    localStorage.setItem("reminderEmail", email.trim());
    setEmailStatus("Email saved ✓");
    setTimeout(() => setEmailStatus(""), 2500);
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-inner">
          <div className="brand">
            <span className="logo-emoji">🧠</span>
            <div>
              <h1>Dementia Assistant</h1>
              <p className="tag">gentle reminders & task memory</p>
            </div>
          </div>
          <div className="notif-area">
            <button className="notif-btn" onClick={() => { setShowNotifPanel(!showNotifPanel); setNotifCount(0); }} aria-label="Notifications">
              🔔
              <span ref={notifRef} className={`notif-badge ${notifCount ? "visible" : ""}`}>{notifCount || ""}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="card input-card">
          <form onSubmit={handleAdd}>
            <label className="label">Add a task</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Doctor appointment at 5pm tomorrow"
              className="task-input"
            />
            <div className="row">
              <button className="btn primary" type="submit">Add Task</button>
              <button className="btn ghost" type="button" onClick={handleCheck}>Check Reminders</button>
              <div className="status">{status}</div>
            </div>
          </form>
        </section>

        {/* New Email Section */}
        <section className="card input-card" style={{ marginTop: "1rem" }}>
          <label className="label">Your Email for Reminders</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="task-input"
            style={{ height: "auto", minHeight: "44px" }}
          />
          <div className="row" style={{ marginTop: "10px" }}>
            <button className="btn primary" type="button" onClick={saveEmail}>
              Save Email
            </button>
            <div className="status">{emailStatus}</div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: 8 }}>
            Reminders will be sent here when tasks are due.
          </p>
          {email && (
            <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: 8 }}>
              Currently sending to: <strong>{email}</strong>
            </p>
          )}
        </section>

        <section className="card reminders-card">
          <h3>Reminders</h3>
          <pre className="reminder-box">{reminders || "No reminders loaded yet."}</pre>
          {recentTasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Recent tasks</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentTasks.slice(0, 8).map((r) => (
                  <li key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{r.text}{r.scheduled ? ` — ${new Date(r.scheduled).toLocaleString()}` : " — (unscheduled)"}</span>
                    <button className="btn ghost" onClick={() => handleDeleteTask(r.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card notifications-card">
          <h3>Recent Notifications</h3>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="empty">No notifications yet — they'll appear here.</div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} className={`notif-item ${n.type}`}>
                  <div className="dot" />
                  <div className="notif-content">
                    <div className="notif-text">{n.text}</div>
                    <div className="notif-meta">{new Date(n.at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* floating notification panel */}
      <div className={`notif-panel ${showNotifPanel ? "open" : ""}`}>
        <div className="panel-header">
          <strong>Notifications</strong>
          <button className="close" onClick={() => setShowNotifPanel(false)}>✕</button>
        </div>
        <div className="panel-body">
          {notifications.length === 0 ? (
            <div className="empty">No notifications</div>
          ) : (
            notifications.map((n, i) => (
              <div key={i} className={`panel-item ${n.type}`}>
                <div className="panel-dot" />
                <div>
                  <div className="panel-title">{n.type === "overdue" ? "Overdue" : "Upcoming"}</div>
                  <div className="panel-text">{n.text}</div>
                  <div className="panel-time">{new Date(n.at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}