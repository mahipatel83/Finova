import os
import sys
import threading
import time
from datetime import datetime

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        """When you run `manage.py runserver`, also run the daily bill-reminder check in the
        background so phone reminders work with no extra terminal. Disable with
        REMINDER_SCHEDULER=0. In production use cron / Task Scheduler with
        `python manage.py send_bill_reminders` instead."""
        if os.environ.get("REMINDER_SCHEDULER", "1") == "0":
            return
        if "runserver" not in sys.argv:
            return
        # With auto-reload Django runs two processes; only start in the serving one.
        if "--noreload" not in sys.argv and os.environ.get("RUN_MAIN") != "true":
            return
        threading.Thread(target=self._loop, daemon=True, name="bill-reminder-loop").start()

    @staticmethod
    def _loop():
        from django.db import close_old_connections

        time.sleep(10)  # let the server finish starting
        hour = int(os.environ.get("REMINDER_HOUR", "9"))
        while True:
            try:
                from accounts.management.commands.send_bill_reminders import run_once
                from accounts.push import reminder_timezone

                close_old_connections()
                if datetime.now(reminder_timezone()).hour >= hour:
                    run_once()
            except Exception as exc:  # never kill the server because of reminders
                print(f"[bill reminders] {exc}")
            time.sleep(15 * 60)
