from django.core.management.base import BaseCommand

from accounts.ai_service import MODEL_PATH, train_model


class Command(BaseCommand):
    help = "Train the Random Forest affordability model used by the Finova chat assistant."

    def add_arguments(self, parser):
        parser.add_argument("--samples", type=int, default=6000, help="Number of training rows (default 6000)")

    def handle(self, *args, **options):
        self.stdout.write("Training RandomForestClassifier ...")
        _, accuracy = train_model(save=True, n_samples=options["samples"])
        self.stdout.write(self.style.SUCCESS(f"Done. Hold-out accuracy: {accuracy:.2%}"))
        self.stdout.write(f"Model saved to: {MODEL_PATH}")
