import { useEffect, useRef, useState } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { addMedication, addTask, deleteMedication, deleteTask, getMedications, getReminders, send_prompt } from "./api";
import "./styles.css";

export default function App() {
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
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

  // Medication states
  const [medicationName, setMedicationName] = useState("");
  const [medicationTimes, setMedicationTimes] = useState(["08:00"]);
  const [medicationFrequency, setMedicationFrequency] = useState("daily");
  const [medicationDays, setMedicationDays] = useState([]);
  const [medications, setMedications] = useState([]);
  const [medStatus, setMedStatus] = useState("");
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const messagesEndRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    if (notifRef.current) {
      notifRef.current.classList.remove("pulse");
      void notifRef.current.offsetWidth;
      notifRef.current.classList.add("pulse");
    }
  }, [notifCount]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!message.trim()) {
      setStatus("Please enter a task message.");
      return;
    }
    
    let fullText = message.trim();
    if (date || time) {
      let dateTimeStr = "";
      if (date && time) {
        dateTimeStr = ` at ${time} on ${date}`;
      } else if (date) {
        dateTimeStr = ` on ${date}`;
      } else if (time) {
        dateTimeStr = ` at ${time}`;
      }
      fullText += dateTimeStr;
    }
    
    setStatus("Saving...");
    try {
      const res = await addTask({
        text: message.trim(),
        date: date || null,
        time: time || null
      });
      setStatus(res.reply || "Saved");
      setMessage("");
      setDate("");
      setTime("");
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
      const assistantReply = response || "No reply received";
      
      setMessages((prev) => [...prev, { role: "assistant", content: assistantReply }]);
    } catch (err) {
      console.log(err);
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

  // Load medications on mount
  useEffect(() => {
    handleLoadMedications();
  }, []);

  async function handleLoadMedications() {
    try {
      const res = await getMedications();
      setMedications(res.medications || []);
    } catch (err) {
      console.log("Error loading medications:", err);
    }
  }

  async function handleAddMedication(e) {
    e.preventDefault();
    if (!medicationName.trim()) {
      setMedStatus("Please enter medication name.");
      return;
    }
    
    if (medicationTimes.length === 0 || medicationTimes.some(t => !t)) {
      setMedStatus("Please add at least one time.");
      return;
    }

    if (medicationFrequency === "custom" && medicationDays.length === 0) {
      setMedStatus("Please select at least one day.");
      return;
    }

    setMedStatus("Saving...");
    try {
      const res = await addMedication({
        name: medicationName.trim(),
        times: medicationTimes.filter(t => t),
        frequency: medicationFrequency,
        days: medicationFrequency === "custom" ? medicationDays : []
      });
      setMedStatus(res.reply || "Medication added.");
      setMedicationName("");
      setMedicationTimes(["08:00"]);
      setMedicationFrequency("daily");
      setMedicationDays([]);
      setTimeout(() => handleLoadMedications(), 400);
    } catch (err) {
      setMedStatus("Error saving medication");
    }
  }

  async function handleDeleteMedication(medId) {
    try {
      await deleteMedication(medId);
      setMedStatus("Medication deleted");
      handleLoadMedications();
    } catch (e) {
      setMedStatus("Delete failed");
    }
  }

  function handleAddTime() {
    setMedicationTimes([...medicationTimes, "09:00"]);
  }

  function handleRemoveTime(index) {
    setMedicationTimes(medicationTimes.filter((_, i) => i !== index));
  }

  function handleTimeChange(index, value) {
    const newTimes = [...medicationTimes];
    newTimes[index] = value;
    setMedicationTimes(newTimes);
  }

  function toggleDay(day) {
    if (medicationDays.includes(day)) {
      setMedicationDays(medicationDays.filter(d => d !== day));
    } else {
      setMedicationDays([...medicationDays, day]);
    }
  }

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

        {/* Task input */}
        <section className="card input-card">
          <form onSubmit={handleAdd}>
            <label className="label">Add a task</label>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                Task message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Doctor appointment"
                className="task-input"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px", fontSize: "1em", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                  Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px", fontSize: "1em", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                />
              </div>
            </div>

            <div className="row">
              <button className="btn primary" type="submit">Add Task</button>
              <button className="btn ghost" type="button" onClick={handleCheck}>
                Check Reminders
              </button>
              <div className="status">{status}</div>
            </div>
          </form>
        </section>

        {/* Reminders */}
        <section className="card reminders-card">
          <h3>Reminders</h3>
          <pre className="reminder-box">{reminders || "No reminders loaded yet."}</pre>

          {recentTasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Recent tasks</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentTasks.slice(0, 8).map((r) => (
                  <li key={r.id} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      {r.text}
                      {r.scheduled ? ` — ${new Date(r.scheduled).toLocaleString()}` : " — (unscheduled)"}
                    </span>
                    <button className="btn ghost" onClick={() => handleDeleteTask(r.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Medications */}
        <section className="card medications-card">
          <h3>💊 Medication Reminders</h3>
          
          <form onSubmit={handleAddMedication} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                Medication Name *
              </label>
              <input
                type="text"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                placeholder="e.g. Aspirin, Vitamin D"
                style={{ width: "100%", padding: "8px", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px", fontSize: "1em", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                Frequency
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setMedicationFrequency("daily")}
                  style={{
                    padding: "8px",
                    borderRadius: "8px",
                    border: medicationFrequency === "daily" ? "2px solid #4CAF50" : "1px solid rgba(255,255,255,0.1)",
                    background: medicationFrequency === "daily" ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.04)",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: "0.9em"
                  }}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setMedicationFrequency("custom")}
                  style={{
                    padding: "8px",
                    borderRadius: "8px",
                    border: medicationFrequency === "custom" ? "2px solid #4CAF50" : "1px solid rgba(255,255,255,0.1)",
                    background: medicationFrequency === "custom" ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.04)",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: "0.9em"
                  }}
                >
                  Select Days
                </button>
              </div>
            </div>

            {medicationFrequency === "custom" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                  Days of Week
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {daysOfWeek.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      style={{
                        padding: "6px",
                        borderRadius: "6px",
                        border: medicationDays.includes(day) ? "2px solid #2196F3" : "1px solid rgba(255,255,255,0.1)",
                        background: medicationDays.includes(day) ? "rgba(33,150,243,0.2)" : "rgba(255,255,255,0.04)",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.8em"
                      }}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.9em", marginBottom: 4, fontWeight: 500 }}>
                Times to Take *
              </label>
              <div style={{ marginBottom: 8 }}>
                {medicationTimes.map((t, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <input
                      type="time"
                      value={t}
                      onChange={(e) => handleTimeChange(idx, e.target.value)}
                      style={{ flex: 1, padding: "8px", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "8px", fontSize: "1em", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                    />
                    {medicationTimes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTime(idx)}
                        className="btn ghost"
                        style={{ padding: "6px 10px" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddTime}
                className="btn ghost"
                style={{ fontSize: "0.9em" }}
              >
                + Add Another Time
              </button>
            </div>

            <div className="row">
              <button className="btn primary" type="submit">Add Medication</button>
              <div className="status">{medStatus}</div>
            </div>
          </form>

          {medications.length > 0 && (
            <div>
              <h4>Your Medications</h4>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {medications.map((med) => (
                  <li key={med.id} style={{ marginBottom: 12, padding: 10, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>💊 {med.name}</div>
                        <div style={{ fontSize: "0.85em", color: "rgba(255,255,255,0.7)" }}>
                          Times: {med.times.join(", ")}
                        </div>
                        {med.frequency === "custom" && (
                          <div style={{ fontSize: "0.85em", color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                            Days: {med.days.length > 0 ? med.days.join(", ") : "None selected"}
                          </div>
                        )}
                        {med.frequency === "daily" && (
                          <div style={{ fontSize: "0.85em", color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                            Every day
                          </div>
                        )}
                      </div>
                      <button className="btn ghost" onClick={() => handleDeleteMedication(med.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Notifications */}
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

        {/* ── AI Assistant ── now at the bottom ──────── */}
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
                  <div className="chat-bubble">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}

            {isSending && (
              <div className="chat-message assistant">
                <div className="chat-bubble typing">
                  <span></span><span></span><span></span>
                </div>
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
              className="send-btn"
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