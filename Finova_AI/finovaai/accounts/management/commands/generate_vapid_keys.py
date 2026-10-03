from django.core.management.base import BaseCommand

from accounts.push import _generate_keys


class Command(BaseCommand):
    help = "Print a new VAPID key pair to put in your .env (optional - keys are auto-generated otherwise)."

    def handle(self, *args, **options):
        keys = _generate_keys()
        self.stdout.write(f"VAPID_PUBLIC_KEY={keys['public']}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={keys['private']}")
