import secrets
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


class AuthToken(models.Model):
    """
    A simple database-backed auth token, one per user.
    Issued on register/login, sent by the frontend as:
        Authorization: Token <key>
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_token",
    )
    key = models.CharField(max_length=64, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = secrets.token_hex(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Token for {self.user.get_username()}"


class Account(models.Model):
    """
    Financial accounts: Bank Account, Cash Wallet, Credit Card, Investment, etc.
    Stores and dynamically updates balance records for the user.
    """
    ACCOUNT_TYPES = [
        ('bank', 'Bank Account'),
        ('cash', 'Cash Wallet'),
        ('credit_card', 'Credit Card'),
        ('savings', 'Savings Account'),
        ('investment', 'Investment Account'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="accounts")
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES, default='bank')
    initial_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    current_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    account_number = models.CharField(max_length=50, blank=True, null=True)
    color = models.CharField(max_length=20, default="#10B981")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.user.username})"

    def update_balance(self):
        """Recalculate balance based on initial balance and all completed transactions."""
        credits = self.transactions.filter(type__iexact='income', status__iexact='Completed').aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')
        debits = self.transactions.filter(type__iexact='expense', status__iexact='Completed').aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')
        self.current_balance = self.initial_balance + credits - debits
        self.save(update_fields=['current_balance', 'updated_at'])
        return self.current_balance


class Category(models.Model):
    """
    Expense and Income categories.
    """
    CATEGORY_TYPES = [
        ('expense', 'Expense'),
        ('income', 'Income'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories", null=True, blank=True)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=CATEGORY_TYPES, default='expense')
    icon = models.CharField(max_length=50, default='Tag')
    color = models.CharField(max_length=20, default='#64748B')
    budget_limit = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f"{self.name} ({self.type})"


class Transaction(models.Model):
    """
    Core transaction ledger: every record updates user total and account balances.
    """
    TYPE_CHOICES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
        ('transfer', 'Transfer'),
    ]
    STATUS_CHOICES = [
        ('Completed', 'Completed'),
        ('Pending', 'Pending'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="transactions")
    account = models.ForeignKey(Account, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions")
    category = models.CharField(max_length=100, default='General')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='expense')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Completed')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.type.upper()}: {self.description} - {self.amount}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.account:
            self.account.update_balance()

    def delete(self, *args, **kwargs):
        account = self.account
        super().delete(*args, **kwargs)
        if account:
            account.update_balance()


class Budget(models.Model):
    """
    Monthly budgets per category.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets")
    category_name = models.CharField(max_length=100)
    monthly_limit = models.DecimalField(max_digits=12, decimal_places=2)
    month = models.IntegerField(default=timezone.now().month)
    year = models.IntegerField(default=timezone.now().year)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'category_name']

    def __str__(self):
        return f"Budget: {self.category_name} - {self.monthly_limit}"


class Bill(models.Model):
    """
    Upcoming and recurring utility/subscription bills.
    """
    STATUS_CHOICES = [
        ('Unpaid', 'Unpaid'),
        ('Paid', 'Paid'),
        ('Overdue', 'Overdue'),
    ]
    FREQUENCY_CHOICES = [
        ('one_time', 'One Time'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('yearly', 'Yearly'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bills")
    name = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()
    category = models.CharField(max_length=100, default='Utilities')
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='monthly')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Unpaid')
    auto_pay = models.BooleanField(default=False)
    account = models.ForeignKey(Account, on_delete=models.SET_NULL, null=True, blank=True, related_name="bills")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return f"Bill: {self.name} - {self.amount} (Due: {self.due_date})"


class SavingsGoal(models.Model):
    """
    Savings goals with target amount and real-time saved progress.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="savings_goals")
    name = models.CharField(max_length=150)
    target_amount = models.DecimalField(max_digits=12, decimal_places=2)
    saved_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    target_date = models.DateField(null=True, blank=True)
    category = models.CharField(max_length=100, default='General')
    color = models.CharField(max_length=20, default="#10B981")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['target_date', '-created_at']

    def __str__(self):
        return f"Goal: {self.name} - {self.saved_amount}/{self.target_amount}"


class UserSettings(models.Model):
    """
    User preferences: currency, notification preferences, etc.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settings")
    currency_symbol = models.CharField(max_length=10, default="₹")
    currency_code = models.CharField(max_length=10, default="INR")
    monthly_budget_target = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    notifications_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.user.username}"


class PushSubscription(models.Model):
    """A browser/phone that agreed to receive push notifications for a user."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Push: {self.user_id} ({self.endpoint[:40]}...)"


class BillReminderLog(models.Model):
    """Remembers which reminder was already pushed so nobody gets it twice."""
    KIND_CHOICES = [("tomorrow", "Due tomorrow"), ("today", "Due today")]
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="reminder_logs")
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    sent_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("bill", "kind", "sent_on")


def user_total_balance(user):
    """
    Single source of truth for the user's overall balance.
    = sum of every account balance
    + completed income/expense that is not attached to any account
      (e.g. entered before the first account was created)
    """
    for acc in Account.objects.filter(user=user):
        acc.update_balance()
    total = sum((a.current_balance for a in Account.objects.filter(user=user)), Decimal("0.00"))
    loose = Transaction.objects.filter(user=user, account__isnull=True, status__iexact="Completed")
    income = loose.filter(type__iexact="income").aggregate(s=models.Sum("amount"))["s"] or Decimal("0.00")
    expense = loose.filter(type__iexact="expense").aggregate(s=models.Sum("amount"))["s"] or Decimal("0.00")
    return total + income - expense
