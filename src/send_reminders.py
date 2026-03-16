"""
Standalone background reminder sender.
Checks memories.json every 5 minutes and sends email when task time is reached.
Run this in a separate terminal / process / as a service.
python send_reminders.py "2026-03-03 08:23:00"
"""

import json
import time
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import load_dotenv

# ------------------------------------------------------
import datetime
import sys

class OffsetDateTime(datetime.datetime):
    _offset = datetime.timedelta(0)
    @classmethod
    def now(cls, tz=None):
        return super().now(tz) + cls._offset

datetime.datetime = OffsetDateTime

if len(sys.argv) > 1:
    fake = datetime.datetime.fromisoformat(sys.argv[1].replace(" ", "T"))
    OffsetDateTime._offset = fake - datetime.datetime.now()
# ------------------------------------------------------

load_dotenv()

# ──────────────────────────────────────────────
#           CONFIGURATION (from .env)
# ──────────────────────────────────────────────
SENDER_EMAIL    = os.getenv("REMINDER_SENDER_EMAIL")          # e.g. yourname@gmail.com
APP_PASSWORD    = os.getenv("REMINDER_SENDER_APP_PASSWORD")   # Gmail app password (16 chars)
RECIPIENT_EMAIL = os.getenv("REMINDER_RECIPIENT_EMAIL")       # who receives reminders

SMTP_SERVER     = "smtp.gmail.com"
SMTP_PORT       = 465

# Where your tasks are stored
NAMESPACE   = "('2', 'memories')"   # must match your agent.py  
MEMORY_FILE = Path("/workspaces/mini_proj/data/memories.json")  # adjust if needed

CHECK_INTERVAL_SECONDS = 60   # 1 minutes
GRACE_PERIOD_MINUTES   = 15    # consider task "due" up to 15 min in future too

# ──────────────────────────────────────────────

def load_tasks():
    """Read tasks from memories.json"""
    if not MEMORY_FILE.is_file():
        print(f"Memory file not found: {MEMORY_FILE}")
        return []

    try:
        with open(MEMORY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data.get(NAMESPACE, [])
    except Exception as e:
        print(f"Error reading {MEMORY_FILE}: {e}")
        return []


def save_tasks(tasks):
    """Write updated tasks back (with sent flag)"""
    try:
        with open(MEMORY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        
        data[NAMESPACE] = tasks
        
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
            
        print("Updated sent flags in memories.json")
    except Exception as e:
        print(f"Error saving tasks: {e}")


def send_email(subject: str, body: str):
    """Send plain text email via SMTP"""
    if not all([SENDER_EMAIL, APP_PASSWORD, RECIPIENT_EMAIL]):
        print("Missing email credentials → cannot send")
        return False

    msg = MIMEMultipart()
    msg["From"]    = SENDER_EMAIL
    msg["To"]      = RECIPIENT_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SENDER_EMAIL, APP_PASSWORD)
            server.send_message(msg)
        print(f"Email sent → {RECIPIENT_EMAIL} | {subject}")
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


def process_reminders():
    """Main check logic — called periodically"""
    now = datetime.datetime.now()
    tasks = load_tasks()
    if not tasks:
        print(f"{now:%Y-%m-%d %H:%M:%S}  No tasks found.")
        return

    updated = False
    sent_count = 0

    for task in tasks:
        sched_str = task.get("scheduled")
        if not sched_str:
            continue

        try:
            due = datetime.datetime.fromisoformat(sched_str)
        except:
            continue

        time_diff_seconds = (due - now).total_seconds()
        grace_seconds = GRACE_PERIOD_MINUTES * 60

        # Pre-reminder: before due time (within grace period, 0-15 min before)
        if 0 < time_diff_seconds <= grace_seconds and not task.get("pre_reminder_sent", False):
            subject = "⏰ Reminder"
            body = (
                f"Hello,\n\n"
                f"→ {task.get('text', '(no description)')}\n"
                f"   due at {due:%-I:%M %p}\n\n"
                f"Dementia Assistant\n"
            )
            if send_email(subject, body):
                task["pre_reminder_sent"] = True
                task["pre_reminder_sent_at"] = datetime.datetime.now().isoformat()
                updated = True
                sent_count += 1

        # At-reminder: at/around due time (within 1 minute before/after)
        elif -60 <= time_diff_seconds <= 0 and not task.get("at_reminder_sent", False):
            subject = "⏰ Task Time"
            body = (
                f"Hello,\n\n"
                f"→ {task.get('text', '(no description)')}\n"
                f"   due now at {due:%-I:%M %p}\n\n"
                f"Dementia Assistant\n"
            )
            if send_email(subject, body):
                task["at_reminder_sent"] = True
                task["at_reminder_sent_at"] = datetime.datetime.now().isoformat()
                updated = True
                sent_count += 1

        # Post-reminder: after due time (1-15 min after)
        elif -grace_seconds <= time_diff_seconds < -60 and not task.get("post_reminder_sent", False):
            subject = "🔔 Overdue Reminder"
            body = (
                f"Hello,\n\n"
                f"→ {task.get('text', '(no description)')}\n"
                f"   was due {due:%-I:%M %p}\n\n"
                f"Dementia Assistant\n"
            )
            if send_email(subject, body):
                task["post_reminder_sent"] = True
                task["post_reminder_sent_at"] = datetime.datetime.now().isoformat()
                updated = True
                sent_count += 1

    if updated:
        save_tasks(tasks)

    print(
        f"{now:%Y-%m-%d %H:%M:%S}  "
        f"Checked {len(tasks)} tasks → sent {sent_count} reminder(s)"
    )


def main():
    print("Reminder background service started")
    print(datetime.datetime.now().strftime("Started at %Y-%m-%d %H:%M:%S"))
    print(f"  • Memory file:   {MEMORY_FILE}")
    print(f"  • Recipient:     {RECIPIENT_EMAIL or '(not set)'}")
    print(f"  • Check every:   {CHECK_INTERVAL_SECONDS // 60} minutes")
    print("-" * 60)

    while True:
        try:
            process_reminders()
        except KeyboardInterrupt:
            print("\nStopped by user.")
            break
        except Exception as e:
            print(f"Unexpected error in main loop: {e}")
        
        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()