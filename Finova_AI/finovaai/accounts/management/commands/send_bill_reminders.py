import os
import time
from datetime import datetime

from django.core.management.base import BaseCommand

from accounts.models import Bill
from accounts.push import local_today, reminder_timezone, send_bill_reminders_for


def run_once(stdout=None):
    today = local_today()
    bills = Bill.objects.select_related("user").exclude(status="Paid").filter(
        due_date__in=[today, today.fromordinal(today.toordinal() + 1)]
    )
    sent = send_bill_reminders_for(bills, today=today)
    if stdout:
        stdout.write(f"{today}: checked {bills.count()} bill(s), pushed {sent} notification(s).")
    return sent


class Command(BaseCommand):
    help = (
        "Send phone/browser push reminders for unpaid bills due tomorrow and today. "
        "Run once (e.g. from cron / Task Scheduler) or keep running with --loop."
    )

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true", help="Keep running and check periodically.")
        parser.add_argument("--interval", type=int, default=15, help="Minutes between checks with --loop.")

    def handle(self, *args, **options):
        if not options["loop"]:
            run_once(self.stdout)
            return
        hour = int(os.environ.get("REMINDER_HOUR", "9"))
        self.stdout.write(f"Reminder loop started (sends after {hour:02d}:00 {reminder_timezone().key}).")
        while True:
            if datetime.now(reminder_timezone()).hour >= hour:
                run_once(self.stdout)
            time.sleep(options["interval"] * 60)
