from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from langgraph.store.memory import InMemoryStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langmem import create_manage_memory_tool, create_search_memory_tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent
import uuid
import os
import asyncio
import sys
from datetime import datetime, timedelta

# new helper module (use absolute import so agent.py can be run directly)
from memory_store import add_task, get_tasks, parse_time_from_text, delete_task

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

if "GEMINI_API_KEY" not in os.environ:
    os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY")

# model/store setup (kept, minimal edits)
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
store = InMemoryStore(index={
    "dims": 1536, "embed": embeddings})

user_id = "2"
namespace = (user_id, "memories")

tools = [
    create_manage_memory_tool(namespace), 
    create_search_memory_tool(namespace)
]

model = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=1.0)
agent = create_agent(model, 
                    tools=tools, 
                    store=store, 
                    system_prompt="You are a helpful dementia patient assistant. help me with reminding of the daily tasks.")

print()
print(store.search(namespace))
print()

# FastAPI app
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# small helper for agent.invoke running off the event loop
async def safe_agent_invoke(prompt: str):
    try:
        if getattr(sys, "is_finalizing", lambda: False)():
            return "Task saved."
        def invoke():
            try:
                rs = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
                return rs
            except Exception:
                return None
        result_state = await asyncio.to_thread(invoke)
        if not result_state:
            return "Task saved."
        # try to extract content
        try:
            return result_state["messages"][-1].content
        except Exception:
            return "Task saved."
    except RuntimeError:
        return "Task saved."
    except Exception:
        return "Task saved."

# API models
class TaskIn(BaseModel):
    """
    TaskIn model for incoming task requests.

    This Pydantic BaseModel represents the input data structure for a task.
    It is used to validate and serialize incoming task data, ensuring that
    the required 'text' field is present and correctly typed as a string.

    Attributes:
        text (str): The task description or input text content.
        date (str | None): Optional date in YYYY-MM-DD format.
        time (str | None): Optional time in HH:MM format.
    """
    text: str
    date: str | None = None
    time: str | None = None

class PromptIn(BaseModel):
    text: str

@app.post("/api/tasks")
async def api_add_task(payload: TaskIn):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    
    # Construct full text with date and time if provided
    full_text = payload.text.strip()
    if payload.date or payload.time:
        datetime_str = ""
        if payload.date and payload.time:
            datetime_str = f" at {payload.time} on {payload.date}"
        elif payload.date:
            datetime_str = f" on {payload.date}"
        elif payload.time:
            datetime_str = f" at {payload.time}"
        full_text += datetime_str
    
    now = datetime.now()
    scheduled = parse_time_from_text(full_text, now=now)

    memory_id = str(uuid.uuid4())
    memory = {"task": full_text}
    store.put(namespace, memory_id, memory)

    print("adding")
    print(store.search(namespace))
    print()
    
    entry = add_task(memory_id, namespace, full_text, scheduled_dt=scheduled)

    # reply = await safe_agent_invoke(f"Store this memory: {full_text}")
    return {"entry": entry, "reply": "Task added."}

@app.post("/api/prompt")
async def api_prompt(payload: PromptIn):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    
    print("hello")
    result = agent.invoke(
        {"messages": [{"role": "user", "content": payload.text}]}
    )
    
    msg = result["messages"][-1].content
    return msg

@app.get("/api/reminders")
async def api_check_reminders(window: int = Query(60, gt=0)):
    now = datetime.now()
    tasks = get_tasks(namespace)
    upcoming = []
    overdue = []
    future_all = []
    unscheduled = []
    all_tasks = []
    for t in tasks:
        # prepare an entry for the "all" list (keep created_at if available)
        # ensure every task we send back has a stable id (fallback via uuid5 if missing)
        safe_id = t.get("id")
        if not safe_id:
            # deterministic fallback id using task text + created_at so UI gets a key even for legacy entries
            safe_id = str(uuid.uuid5(uuid.NAMESPACE_URL, (t.get("text") or "") + "|" + (t.get("created_at") or "")))
        all_tasks.append({
            "id": safe_id,
            "text": t.get("text"),
            "scheduled": t.get("scheduled"),
            "created_at": t.get("created_at")
        })
        sched = t.get("scheduled")
        if not sched:
            unscheduled.append(t.get("text"))
            continue
        try:
            dt = datetime.fromisoformat(sched)
        except Exception:
            unscheduled.append(t.get("text"))
            continue
        if dt <= now:
            overdue.append({"text": t["text"], "at": dt.isoformat()})
        else:
            future_all.append({"text": t["text"], "at": dt.isoformat(), "dt": dt})
            if dt <= now + timedelta(minutes=window):
                upcoming.append({"text": t["text"], "at": dt.isoformat()})
    # sort all_tasks by created_at descending if available
    try:
        all_tasks_sorted = sorted(
            all_tasks,
            key=lambda x: x.get("created_at") or "",
            reverse=True
        )
    except Exception:
        all_tasks_sorted = all_tasks
    if overdue or upcoming:
        return {"overdue": overdue, "upcoming": upcoming, "all": all_tasks_sorted}
    # fallback
    if future_all:
        next_item = min(future_all, key=lambda x: x["dt"])
        return {"message": f"No reminders in window. Next: {next_item['text']} at {next_item['at']}", "all": all_tasks_sorted}
    if unscheduled:
        return {"message": "No scheduled reminders. Unscheduled tasks: " + "; ".join(unscheduled), "all": all_tasks_sorted}
    return {"message": "No reminders scheduled.", "all": all_tasks_sorted}

# new endpoint to delete a task by id
@app.delete("/api/tasks/{task_id}")
async def api_delete_task(task_id: str):
    print("before deleting")
    print(store.search(namespace))
    print()

    store.delete(namespace, task_id)

    print("after deleting")
    print(store.search(namespace))
    print()

    ok = delete_task(namespace, task_id)
    
    if not ok:
        raise HTTPException(status_code=404, detail="task not found")
    return {"deleted": True}


if __name__ == "__main__":
    import socket
    import errno

    HOST = os.getenv("HOST", "0.0.0.0")
    START_PORT = int(os.getenv("PORT", "8000"))
    MAX_PORT = START_PORT + 1000

    def _is_port_free(host, port):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            s.close()
            return True
        except OSError:
            try:
                s.close()
            except Exception:
                pass
            return False

    chosen_port = None
    if _is_port_free(HOST, START_PORT):
        chosen_port = START_PORT
    else:
        for p in range(START_PORT + 1, MAX_PORT + 1):
            if _is_port_free(HOST, p):
                chosen_port = p
                break

    if chosen_port is None:
        raise RuntimeError(f"No free port found in range {START_PORT}-{MAX_PORT}")

    print(f"Starting server on http://{HOST}:{chosen_port} (requested PORT={START_PORT})")
    uvicorn.run("agent:app", host=HOST, port=chosen_port, reload=False)

