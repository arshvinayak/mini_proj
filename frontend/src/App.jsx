import { useEffect, useRef, useState } from "react";
import { addTask, deleteTask, getNotifications, getReminders, send_prompt } from "./api";
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

  // Chat states
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef(null);
  const notifRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Notification polling
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

  async function handleSendMessage(e) {
    e?.preventDefault();
    const message = chatInput.trim();
    if (!message || isSending) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
    setIsSending(true);

    try {
      const response = await send_prompt(message);      
      const assistantReply = response?.reply || response?.text || response || "No reply received";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantReply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry — connection issue. Try again?" },
      ]);
    } finally {
      setIsSending(false);
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
            <button
              className="notif-btn"
              onClick={() => {
                setShowNotifPanel(!showNotifPanel);
                setNotifCount(0);
              }}
              aria-label="Notifications"
            >
              🔔
              <span ref={notifRef} className={`notif-badge ${notifCount ? "visible" : ""}`}>
                {notifCount || ""}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* 1. Task input */}
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
              <button className="btn ghost" type="button" onClick={handleCheck}>
                Check Reminders
              </button>
              <div className="status">{status}</div>
            </div>
          </form>
        </section>

        {/* 2. Reminders */}
        <section className="card reminders-card">
          <h3>Reminders</h3>
          <pre className="reminder-box">{reminders || "No reminders loaded yet."}</pre>

          {recentTasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Recent tasks</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentTasks.slice(0, 8).map((r) => (
                  <li key={r.id} className="task-item">
                    <span>
                      {r.text}
                      {r.scheduled ? ` — ${new Date(r.scheduled).toLocaleString()}` : " — (unscheduled)"}
                    </span>
                    <button className="btn ghost small" onClick={() => handleDeleteTask(r.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 3. Notifications */}
        <section className="card notifications-card">
          <h3>Recent Notifications</h3>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="empty">No notifications yet</div>
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

        {/* 4. AI Assistant — now at the bottom */}
        <section className="card chat-card">
          <h3>AI Assistant</h3>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                Ask anything about your day, tasks, schedule, or just chat...
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`chat-message ${msg.role === "user" ? "user" : "assistant"}`}
                >
                  <div className="chat-bubble">{msg.content}</div>
                </div>
              ))
            )}

            {isSending && (
              <div className="chat-message assistant">
                <div className="chat-bubble typing">...</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask me anything..."
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button
              type="submit"
              className="btn primary send-btn"
              disabled={isSending || !chatInput.trim()}
            >
              {isSending ? "…" : "→"}
            </button>
          </form>
        </section>
      </main>

      {/* Floating notification panel */}
      <div className={`notif-panel ${showNotifPanel ? "open" : ""}`}>
        <div className="panel-header">
          <strong>Notifications</strong>
          <button className="close" onClick={() => setShowNotifPanel(false)}>
            ✕
          </button>
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