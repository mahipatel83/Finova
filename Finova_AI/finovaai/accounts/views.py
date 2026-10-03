import json
from decimal import Decimal
from datetime import datetime, timedelta
from functools import wraps

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models
from django.db.models import Sum, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import (
    AuthToken,
    Account,
    Category,
    Transaction,
    Budget,
    Bill,
    SavingsGoal,
    UserSettings,
    PushSubscription,
    user_total_balance,
)
from .push import get_vapid_keys, push_to_user, send_bill_reminders_for


def _user_payload(user):
    """Shape a Django User the way the React frontend expects."""
    full_name = (user.first_name or "").strip() or user.username.split("@")[0].capitalize()
    settings, _ = UserSettings.objects.get_or_create(user=user)
    return {
        "id": user.id,
        "email": user.email,
        "name": full_name,
        "currency_symbol": settings.currency_symbol,
        "currency_code": settings.currency_code,
    }


def _json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None


def token_required(view_func):
    """Reject the request unless a valid `Authorization: Token <key>` header
    matches a row in the AuthToken table."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Token "):
            return JsonResponse({"error": "Authentication credentials were not provided."}, status=401)

        key = auth_header.split("Token ", 1)[1].strip()
        try:
            token = AuthToken.objects.select_related("user").get(key=key)
        except AuthToken.DoesNotExist:
            return JsonResponse({"error": "Invalid or expired token."}, status=401)

        request.auth_user = token.user
        return view_func(request, *args, **kwargs)

    return wrapper


def ensure_default_categories(user):
    """Ensure basic categories exist for a user."""
    default_cats = [
        ("Salary", "income", "#10B981", "Wallet"),
        ("Freelance", "income", "#06B6D4", "Laptop"),
        ("Investments", "income", "#8B5CF6", "TrendingUp"),
        ("Other Income", "income", "#64748B", "PlusCircle"),
        ("Food & Dining", "expense", "#EF4444", "Utensils"),
        ("Shopping", "expense", "#F59E0B", "ShoppingBag"),
        ("Housing & Rent", "expense", "#3B82F6", "Home"),
        ("Transportation", "expense", "#8B5CF6", "Car"),
        ("Utilities & Bills", "expense", "#EC4899", "Zap"),
        ("Entertainment", "expense", "#14B8A6", "Film"),
        ("Healthcare", "expense", "#10B981", "HeartPulse"),
        ("Education", "expense", "#6366F1", "GraduationCap"),
        ("Groceries", "expense", "#F97316", "ShoppingCart"),
        ("Other Expense", "expense", "#64748B", "MoreHorizontal"),
    ]
    if not Category.objects.filter(user=user).exists():
        for name, ctype, color, icon in default_cats:
            Category.objects.create(
                user=user,
                name=name,
                type=ctype,
                color=color,
                icon=icon,
            )


# ==========================================
# AUTH VIEWS
# ==========================================

@csrf_exempt
@require_http_methods(["POST"])
def api_register(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return JsonResponse({"error": "Email and password are required"}, status=400)

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({"error": "Enter a valid email address"}, status=400)

    if len(password) < 6:
        return JsonResponse({"error": "Password must be at least 6 characters"}, status=400)

    if User.objects.filter(username=email).exists():
        return JsonResponse({"error": "An account with this email already exists. Please sign in."}, status=409)

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=name or email.split("@")[0].capitalize(),
    )

    UserSettings.objects.create(user=user, currency_symbol="₹", currency_code="INR")
    token, _ = AuthToken.objects.get_or_create(user=user)
    ensure_default_categories(user)

    # Create default Main Bank and Cash accounts for seamless experience
    Account.objects.create(user=user, name="Primary Bank Account", account_type="bank", initial_balance=Decimal("0.00"), current_balance=Decimal("0.00"), color="#3B82F6")
    Account.objects.create(user=user, name="Cash Wallet", account_type="cash", initial_balance=Decimal("0.00"), current_balance=Decimal("0.00"), color="#10B981")

    return JsonResponse({
        "message": "Registration successful. Please log in with your credentials.",
        "user": _user_payload(user),
    }, status=201)


@csrf_exempt
@require_http_methods(["POST"])
def api_login(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return JsonResponse({"error": "Email and password are required"}, status=400)

    if not User.objects.filter(username=email).exists():
        return JsonResponse({"error": "No account found with this email. Please sign up first."}, status=404)

    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({"error": "Incorrect password."}, status=401)

    if not user.is_active:
        return JsonResponse({"error": "This account has been deactivated."}, status=403)

    token, _ = AuthToken.objects.get_or_create(user=user)
    ensure_default_categories(user)

    return JsonResponse({"token": token.key, "user": _user_payload(user)})


@csrf_exempt
@require_http_methods(["POST"])
@token_required
def api_logout(request):
    AuthToken.objects.filter(user=request.auth_user).delete()
    return JsonResponse({"success": True})


@require_http_methods(["GET"])
@token_required
def api_me(request):
    return JsonResponse({"user": _user_payload(request.auth_user)})


# ==========================================
# DASHBOARD OVERVIEW & CALCULATIONS
# ==========================================

@require_http_methods(["GET"])
@token_required
def api_dashboard(request):
    user = request.auth_user
    ensure_default_categories(user)

    # Sync all account balances and compute the overall balance
    total_balance = user_total_balance(user)
    accounts = Account.objects.filter(user=user)

    # 2. Total Income & Total Expenses
    total_income = Transaction.objects.filter(user=user, type__iexact='income', status__iexact='Completed').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
    total_expenses = Transaction.objects.filter(user=user, type__iexact='expense', status__iexact='Completed').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

    # 3. Total Savings
    total_savings = SavingsGoal.objects.filter(user=user).aggregate(s=Sum('saved_amount'))['s'] or Decimal('0.00')

    # 4. Recent Transactions (latest 10)
    txns = Transaction.objects.filter(user=user).select_related('account')[:10]
    recent_transactions = []
    for t in txns:
        recent_transactions.append({
            "id": t.id,
            "description": t.description,
            "date": t.date.strftime("%Y-%m-%d"),
            "category": t.category,
            "amount": str(t.amount),
            "type": t.type,
            "status": t.status,
            "account_name": t.account.name if t.account else "General",
            "account_id": t.account.id if t.account else None,
            "notes": t.notes,
        })

    # 5. Budgets for current month with live spent calculation
    now = timezone.now()
    budgets_qs = Budget.objects.filter(user=user)
    budgets_data = []
    total_budget_limit = Decimal('0.00')
    total_budget_spent = Decimal('0.00')

    for b in budgets_qs:
        # Sum expenses in this budget's category for the current month
        spent = Transaction.objects.filter(
            user=user,
            type__iexact='expense',
            status__iexact='Completed',
            category__iexact=b.category_name,
            date__year=now.year,
            date__month=now.month,
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

        limit = b.monthly_limit or Decimal('1.00')
        percent = min(100, int((spent / limit) * 100)) if limit > 0 else 0
        remaining = max(Decimal('0.00'), limit - spent)

        total_budget_limit += limit
        total_budget_spent += spent

        budgets_data.append({
            "id": b.id,
            "category": b.category_name,
            "label": b.category_name,
            "limit": str(b.monthly_limit),
            "spent": str(spent),
            "remaining": str(remaining),
            "percent": percent,
            "is_over": spent > limit,
        })

    overall_budget_progress = min(100, int((total_budget_spent / total_budget_limit) * 100)) if total_budget_limit > 0 else 0

    # 6. Savings Goals
    savings_qs = SavingsGoal.objects.filter(user=user)
    savings_data = []
    for g in savings_qs:
        tgt = g.target_amount or Decimal('1.00')
        pct = min(100, int((g.saved_amount / tgt) * 100)) if tgt > 0 else 0
        savings_data.append({
            "id": g.id,
            "name": g.name,
            "target": str(g.target_amount),
            "saved": str(g.saved_amount),
            "percent": pct,
            "target_date": g.target_date.strftime("%Y-%m-%d") if g.target_date else None,
            "category": g.category,
            "color": g.color,
        })

    # 7. Upcoming Bills
    bills_qs = Bill.objects.filter(user=user).order_by('due_date')
    bills_data = []
    pending_bills_amount = Decimal('0.00')
    for bill in bills_qs:
        is_overdue = bill.due_date < now.date() and bill.status != 'Paid'
        status = 'Overdue' if is_overdue else bill.status
        if status != 'Paid':
            pending_bills_amount += bill.amount

        bills_data.append({
            "id": bill.id,
            "name": bill.name,
            "amount": str(bill.amount),
            "due_date": bill.due_date.strftime("%Y-%m-%d"),
            "category": bill.category,
            "status": status,
            "frequency": bill.frequency,
            "auto_pay": bill.auto_pay,
        })

    # 8. Monthly Trend Chart Data (Last 6 months)
    chart_data = []
    for i in range(5, -1, -1):
        # Step back exactly i calendar months (current month is always the last bar)
        month_index = now.year * 12 + (now.month - 1) - i
        m_year, m_month = month_index // 12, month_index % 12 + 1
        month_name = datetime(m_year, m_month, 1).strftime("%b")

        m_income = Transaction.objects.filter(
            user=user,
            type='income',
            status='Completed',
            date__year=m_year,
            date__month=m_month,
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

        m_expense = Transaction.objects.filter(
            user=user,
            type='expense',
            status='Completed',
            date__year=m_year,
            date__month=m_month,
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

        chart_data.append({
            "month": month_name,
            "year": m_year,
            "income": float(m_income),
            "expense": float(m_expense),
            "net": float(m_income - m_expense),
        })

    # 9. Expenses by Category (for Donut / Breakdown)
    expenses_by_category = []
    all_expenses = Transaction.objects.filter(user=user, type='expense', status='Completed')
    cat_expenses = all_expenses.values('category').annotate(total=Sum('amount')).order_by('-total')

    category_colors = {
        "Food & Dining": "#EF4444",
        "Shopping": "#F59E0B",
        "Housing & Rent": "#3B82F6",
        "Transportation": "#8B5CF6",
        "Utilities & Bills": "#EC4899",
        "Entertainment": "#14B8A6",
        "Healthcare": "#10B981",
        "Education": "#6366F1",
        "Groceries": "#F97316",
    }

    cat_palette = ["#FF5A5F", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#06B6D4", "#F97316", "#64748B"]
    for idx, c in enumerate(cat_expenses):
        cname = c['category']
        amt = c['total']
        pct = round((amt / total_expenses * 100), 1) if total_expenses > 0 else 0
        color = category_colors.get(cname, cat_palette[idx % len(cat_palette)])
        expenses_by_category.append({
            "category": cname,
            "amount": str(amt),
            "percent": float(pct),
            "color": color,
        })

    # 10. Accounts summary list
    accounts_data = []
    for acc in accounts:
        accounts_data.append({
            "id": acc.id,
            "name": acc.name,
            "account_type": acc.account_type,
            "initial_balance": str(acc.initial_balance),
            "current_balance": str(acc.current_balance),
            "account_number": acc.account_number or "",
            "color": acc.color,
            "transactions_count": acc.transactions.count(),
        })

    settings, _ = UserSettings.objects.get_or_create(user=user)

    data = {
        "user": _user_payload(user),
        "summary": {
            "total_balance": f"{total_balance:.2f}",
            "income": f"{total_income:.2f}",
            "expenses": f"{total_expenses:.2f}",
            "savings": f"{total_savings:.2f}",
            "budget_progress": overall_budget_progress,
            "accounts_count": accounts.count(),
            "transactions_count": Transaction.objects.filter(user=user).count(),
            "pending_bills_count": bills_qs.exclude(status='Paid').count(),
            "pending_bills_amount": f"{pending_bills_amount:.2f}",
            "currency_symbol": settings.currency_symbol,
        },
        "accounts": accounts_data,
        "chart_data": chart_data,
        "recent_transactions": recent_transactions,
        "expenses_by_category": expenses_by_category,
        "budgets": budgets_data,
        "savings_goals": savings_data,
        "upcoming_bills": bills_data,
    }
    return JsonResponse(data)


# ==========================================
# ACCOUNTS CRUD & BALANCE STORE
# ==========================================

@csrf_exempt
@token_required
def api_accounts(request, account_id=None):
    user = request.auth_user

    if request.method == "GET":
        if account_id:
            try:
                acc = Account.objects.get(id=account_id, user=user)
                acc.update_balance()
                return JsonResponse({
                    "id": acc.id,
                    "name": acc.name,
                    "account_type": acc.account_type,
                    "initial_balance": str(acc.initial_balance),
                    "current_balance": str(acc.current_balance),
                    "account_number": acc.account_number or "",
                    "color": acc.color,
                    "created_at": acc.created_at.strftime("%Y-%m-%d"),
                })
            except Account.DoesNotExist:
                return JsonResponse({"error": "Account not found"}, status=404)

        accounts = Account.objects.filter(user=user)
        for a in accounts:
            a.update_balance()
        accounts_list = [{
            "id": a.id,
            "name": a.name,
            "account_type": a.account_type,
            "initial_balance": str(a.initial_balance),
            "current_balance": str(a.current_balance),
            "account_number": a.account_number or "",
            "color": a.color,
            "transactions_count": a.transactions.count(),
            "created_at": a.created_at.strftime("%Y-%m-%d"),
        } for a in accounts]
        return JsonResponse({"accounts": accounts_list})

    elif request.method == "POST":
        data = _json_body(request)
        if not data:
            return JsonResponse({"error": "Invalid data"}, status=400)

        name = data.get("name", "").strip()
        if not name:
            return JsonResponse({"error": "Account name is required"}, status=400)

        account_type = data.get("account_type", "bank")
        try:
            initial_balance = Decimal(str(data.get("initial_balance", "0.00")))
        except Exception:
            initial_balance = Decimal("0.00")

        color = data.get("color", "#3B82F6")
        account_number = data.get("account_number", "").strip()

        acc = Account.objects.create(
            user=user,
            name=name,
            account_type=account_type,
            initial_balance=initial_balance,
            current_balance=initial_balance,
            color=color,
            account_number=account_number,
        )
        return JsonResponse({
            "message": "Account created successfully",
            "account": {
                "id": acc.id,
                "name": acc.name,
                "account_type": acc.account_type,
                "initial_balance": str(acc.initial_balance),
                "current_balance": str(acc.current_balance),
                "color": acc.color,
                "account_number": acc.account_number,
            }
        }, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not account_id:
            return JsonResponse({"error": "Account ID required"}, status=400)
        try:
            acc = Account.objects.get(id=account_id, user=user)
        except Account.DoesNotExist:
            return JsonResponse({"error": "Account not found"}, status=404)

        data = _json_body(request)
        if "name" in data:
            acc.name = data["name"].strip()
        if "account_type" in data:
            acc.account_type = data["account_type"]
        if "initial_balance" in data:
            try:
                acc.initial_balance = Decimal(str(data["initial_balance"]))
            except Exception:
                pass
        if "color" in data:
            acc.color = data["color"]
        if "account_number" in data:
            acc.account_number = data["account_number"].strip()

        acc.save()
        acc.update_balance()

        return JsonResponse({
            "message": "Account updated successfully",
            "account": {
                "id": acc.id,
                "name": acc.name,
                "account_type": acc.account_type,
                "initial_balance": str(acc.initial_balance),
                "current_balance": str(acc.current_balance),
                "color": acc.color,
            }
        })

    elif request.method == "DELETE":
        if not account_id:
            return JsonResponse({"error": "Account ID required"}, status=400)
        try:
            acc = Account.objects.get(id=account_id, user=user)
            acc.delete()
            return JsonResponse({"message": "Account deleted successfully"})
        except Account.DoesNotExist:
            return JsonResponse({"error": "Account not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


# ==========================================
# TRANSACTIONS CRUD & LIVE CALCULATION
# ==========================================

@csrf_exempt
@token_required
def api_transactions(request, transaction_id=None):
    user = request.auth_user

    if request.method == "GET":
        if transaction_id:
            try:
                t = Transaction.objects.get(id=transaction_id, user=user)
                return JsonResponse({
                    "id": t.id,
                    "description": t.description,
                    "amount": str(t.amount),
                    "type": t.type,
                    "category": t.category,
                    "date": t.date.strftime("%Y-%m-%d"),
                    "status": t.status,
                    "account_id": t.account_id,
                    "account_name": t.account.name if t.account else "General",
                    "notes": t.notes,
                })
            except Transaction.DoesNotExist:
                return JsonResponse({"error": "Transaction not found"}, status=404)

        # Filters: type, category, account_id, search, start_date, end_date
        qs = Transaction.objects.filter(user=user).select_related('account')
        
        t_type = request.GET.get('type')
        if t_type and t_type in ['income', 'expense', 'transfer']:
            qs = qs.filter(type=t_type)

        category = request.GET.get('category')
        if category:
            qs = qs.filter(category__iexact=category)

        account_id_param = request.GET.get('account_id')
        if account_id_param:
            qs = qs.filter(account_id=account_id_param)

        search = request.GET.get('search')
        if search:
            qs = qs.filter(Q(description__icontains=search) | Q(category__icontains=search) | Q(notes__icontains=search))

        start_date = request.GET.get('start_date')
        if start_date:
            qs = qs.filter(date__gte=start_date)

        end_date = request.GET.get('end_date')
        if end_date:
            qs = qs.filter(date__lte=end_date)

        # Totals for the filtered selection
        total_income = qs.filter(type__iexact='income', status__iexact='Completed').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
        total_expense = qs.filter(type__iexact='expense', status__iexact='Completed').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
        net_balance = total_income - total_expense

        txns_list = [{
            "id": t.id,
            "description": t.description,
            "amount": str(t.amount),
            "type": t.type.lower(),
            "category": t.category,
            "date": t.date.strftime("%Y-%m-%d"),
            "status": t.status,
            "account_id": t.account_id,
            "account_name": t.account.name if t.account else "General",
            "account_color": t.account.color if t.account else "#64748B",
            "notes": t.notes,
        } for t in qs]

        return JsonResponse({
            "transactions": txns_list,
            "count": len(txns_list),
            "total_income": str(total_income),
            "total_expense": str(total_expense),
            "net_balance": str(net_balance),
        })

    elif request.method == "POST":
        data = _json_body(request)
        if not data:
            return JsonResponse({"error": "Invalid data"}, status=400)

        description = (data.get("description") or "").strip()
        if not description:
            return JsonResponse({"error": "Description is required"}, status=400)

        try:
            amount = Decimal(str(data.get("amount", "0")))
            if amount <= 0:
                return JsonResponse({"error": "Amount must be greater than zero"}, status=400)
        except Exception:
            return JsonResponse({"error": "Invalid amount format"}, status=400)

        ttype = (data.get("type") or "expense").strip().lower()
        if ttype not in ["income", "expense", "transfer"]:
            ttype = "expense"

        category = (data.get("category") or "General").strip() or "General"
        date_str = data.get("date")
        if date_str:
            try:
                date_val = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                date_val = timezone.now().date()
        else:
            date_val = timezone.now().date()

        status = (data.get("status") or "Completed").strip().capitalize()
        notes = (data.get("notes") or "").strip()

        account = None
        account_id_val = data.get("account_id")
        if account_id_val:
            try:
                account = Account.objects.get(id=account_id_val, user=user)
            except Account.DoesNotExist:
                pass

        # If user has accounts and none was specified, attach to first account
        if not account:
            account = Account.objects.filter(user=user).first()

        txn = Transaction.objects.create(
            user=user,
            account=account,
            description=description,
            amount=amount,
            type=ttype,
            category=category,
            date=date_val,
            status=status,
            notes=notes,
        )

        return JsonResponse({
            "message": "Transaction created successfully",
            "transaction": {
                "id": txn.id,
                "description": txn.description,
                "amount": str(txn.amount),
                "type": txn.type,
                "category": txn.category,
                "date": txn.date.strftime("%Y-%m-%d"),
                "status": txn.status,
                "account_name": txn.account.name if txn.account else "General",
            }
        }, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not transaction_id:
            return JsonResponse({"error": "Transaction ID required"}, status=400)
        try:
            txn = Transaction.objects.get(id=transaction_id, user=user)
        except Transaction.DoesNotExist:
            return JsonResponse({"error": "Transaction not found"}, status=404)

        data = _json_body(request)
        old_account = txn.account

        if "description" in data:
            txn.description = data["description"].strip()
        if "amount" in data:
            try:
                amt = Decimal(str(data["amount"]))
                if amt > 0:
                    txn.amount = amt
            except Exception:
                pass
        if "type" in data and data["type"] in ["income", "expense", "transfer"]:
            txn.type = data["type"]
        if "category" in data:
            txn.category = data["category"].strip()
        if "date" in data:
            try:
                txn.date = datetime.strptime(data["date"], "%Y-%m-%d").date()
            except ValueError:
                pass
        if "status" in data:
            txn.status = data["status"]
        if "notes" in data:
            txn.notes = data["notes"].strip()
        if "account_id" in data:
            if data["account_id"]:
                try:
                    txn.account = Account.objects.get(id=data["account_id"], user=user)
                except Account.DoesNotExist:
                    pass
            else:
                txn.account = None

        txn.save()

        # Update both accounts if account was changed
        if old_account and old_account != txn.account:
            old_account.update_balance()
        if txn.account:
            txn.account.update_balance()

        return JsonResponse({
            "message": "Transaction updated successfully",
            "transaction": {
                "id": txn.id,
                "description": txn.description,
                "amount": str(txn.amount),
                "type": txn.type,
                "category": txn.category,
                "date": txn.date.strftime("%Y-%m-%d"),
                "status": txn.status,
            }
        })

    elif request.method == "DELETE":
        if not transaction_id:
            return JsonResponse({"error": "Transaction ID required"}, status=400)
        try:
            txn = Transaction.objects.get(id=transaction_id, user=user)
            txn.delete()
            return JsonResponse({"message": "Transaction deleted successfully"})
        except Transaction.DoesNotExist:
            return JsonResponse({"error": "Transaction not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


# ==========================================
# BUDGETS CRUD & PROGRESS
# ==========================================

@csrf_exempt
@token_required
def api_budgets(request, budget_id=None):
    user = request.auth_user
    now = timezone.now()

    if request.method == "GET":
        budgets = Budget.objects.filter(user=user)
        budgets_list = []
        for b in budgets:
            spent = Transaction.objects.filter(
                user=user,
                type__iexact='expense',
                status__iexact='Completed',
                category__iexact=b.category_name,
                date__year=now.year,
                date__month=now.month,
            ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

            limit = b.monthly_limit or Decimal('1.00')
            percent = min(100, int((spent / limit) * 100)) if limit > 0 else 0
            remaining = max(Decimal('0.00'), limit - spent)

            budgets_list.append({
                "id": b.id,
                "category_name": b.category_name,
                "monthly_limit": str(b.monthly_limit),
                "spent": str(spent),
                "remaining": str(remaining),
                "percent": percent,
                "is_exceeded": spent > limit,
                "month": b.month,
                "year": b.year,
            })
        return JsonResponse({"budgets": budgets_list})

    elif request.method == "POST":
        data = _json_body(request)
        category_name = (data.get("category_name") or "").strip()
        if not category_name:
            return JsonResponse({"error": "Category name is required"}, status=400)

        try:
            monthly_limit = Decimal(str(data.get("monthly_limit", "0")))
            if monthly_limit <= 0:
                return JsonResponse({"error": "Limit must be greater than zero"}, status=400)
        except Exception:
            return JsonResponse({"error": "Invalid limit amount"}, status=400)

        budget, created = Budget.objects.update_or_create(
            user=user,
            category_name=category_name,
            defaults={
                "monthly_limit": monthly_limit,
                "month": now.month,
                "year": now.year,
            }
        )
        return JsonResponse({"message": "Budget saved successfully", "id": budget.id}, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not budget_id:
            return JsonResponse({"error": "Budget ID required"}, status=400)
        try:
            budget = Budget.objects.get(id=budget_id, user=user)
        except Budget.DoesNotExist:
            return JsonResponse({"error": "Budget not found"}, status=404)

        data = _json_body(request)
        if "category_name" in data:
            budget.category_name = data["category_name"].strip()
        if "monthly_limit" in data:
            try:
                budget.monthly_limit = Decimal(str(data["monthly_limit"]))
            except Exception:
                pass
        budget.save()
        return JsonResponse({"message": "Budget updated successfully"})

    elif request.method == "DELETE":
        if not budget_id:
            return JsonResponse({"error": "Budget ID required"}, status=400)
        try:
            budget = Budget.objects.get(id=budget_id, user=user)
            budget.delete()
            return JsonResponse({"message": "Budget deleted successfully"})
        except Budget.DoesNotExist:
            return JsonResponse({"error": "Budget not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


# ==========================================
# BILLS & SUBSCRIPTIONS
# ==========================================

@csrf_exempt
@token_required
def api_bills(request, bill_id=None):
    user = request.auth_user
    now = timezone.now()

    if request.method == "GET":
        bills = Bill.objects.filter(user=user).order_by('due_date')
        bills_list = []
        for bill in bills:
            is_overdue = bill.due_date < now.date() and bill.status != 'Paid'
            status = 'Overdue' if is_overdue else bill.status
            days_left = (bill.due_date - now.date()).days
            bills_list.append({
                "id": bill.id,
                "name": bill.name,
                "amount": str(bill.amount),
                "due_date": bill.due_date.strftime("%Y-%m-%d"),
                "category": bill.category,
                "frequency": bill.frequency,
                "status": status,
                "auto_pay": bill.auto_pay,
                "days_left": days_left,
            })
        return JsonResponse({"bills": bills_list})

    elif request.method == "POST":
        data = _json_body(request)
        name = (data.get("name") or "").strip()
        if not name:
            return JsonResponse({"error": "Bill name is required"}, status=400)

        try:
            amount = Decimal(str(data.get("amount", "0")))
            if amount <= 0:
                return JsonResponse({"error": "Amount must be greater than zero"}, status=400)
        except Exception:
            return JsonResponse({"error": "Invalid amount"}, status=400)

        due_date_str = data.get("due_date")
        try:
            due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date() if due_date_str else now.date() + timedelta(days=7)
        except ValueError:
            due_date = now.date() + timedelta(days=7)

        category = data.get("category", "Utilities")
        frequency = data.get("frequency", "monthly")
        status = data.get("status", "Unpaid")
        auto_pay = bool(data.get("auto_pay", False))

        bill = Bill.objects.create(
            user=user,
            name=name,
            amount=amount,
            due_date=due_date,
            category=category,
            frequency=frequency,
            status=status,
            auto_pay=auto_pay,
        )
        # If the bill is already due today/tomorrow, push the reminder right away
        try:
            send_bill_reminders_for([bill])
        except Exception:
            pass
        return JsonResponse({"message": "Bill added successfully", "id": bill.id}, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not bill_id:
            return JsonResponse({"error": "Bill ID required"}, status=400)
        try:
            bill = Bill.objects.get(id=bill_id, user=user)
        except Bill.DoesNotExist:
            return JsonResponse({"error": "Bill not found"}, status=404)

        data = _json_body(request)
        if "name" in data:
            bill.name = data["name"].strip()
        if "amount" in data:
            try:
                bill.amount = Decimal(str(data["amount"]))
            except Exception:
                pass
        if "due_date" in data:
            try:
                bill.due_date = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
            except ValueError:
                pass
        if "category" in data:
            bill.category = data["category"]
        if "frequency" in data:
            bill.frequency = data["frequency"]
        if "status" in data:
            bill.status = data["status"]
        if "auto_pay" in data:
            bill.auto_pay = bool(data["auto_pay"])

        bill.save()
        return JsonResponse({"message": "Bill updated successfully"})

    elif request.method == "DELETE":
        if not bill_id:
            return JsonResponse({"error": "Bill ID required"}, status=400)
        try:
            bill = Bill.objects.get(id=bill_id, user=user)
            bill.delete()
            return JsonResponse({"message": "Bill deleted successfully"})
        except Bill.DoesNotExist:
            return JsonResponse({"error": "Bill not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@require_http_methods(["POST"])
@token_required
def api_bill_pay(request, bill_id):
    """Mark a bill as paid and optionally record an expense transaction."""
    user = request.auth_user
    try:
        bill = Bill.objects.get(id=bill_id, user=user)
    except Bill.DoesNotExist:
        return JsonResponse({"error": "Bill not found"}, status=404)

    if bill.status == 'Paid':
        return JsonResponse({"error": f"Bill '{bill.name}' is already paid."}, status=400)

    bill.status = 'Paid'
    bill.save()

    # Automatically create an expense transaction
    account = Account.objects.filter(user=user).first()
    Transaction.objects.create(
        user=user,
        account=account,
        description=f"Paid Bill: {bill.name}",
        amount=bill.amount,
        type='expense',
        category=bill.category,
        date=timezone.now().date(),
        status='Completed',
        notes=f"Auto-generated payment record for bill #{bill.id}",
    )

    return JsonResponse({"message": f"Bill '{bill.name}' marked as Paid and transaction recorded!"})


# ==========================================
# SAVINGS GOALS CRUD & CONTRIBUTIONS
# ==========================================

@csrf_exempt
@token_required
def api_savings_goals(request, goal_id=None):
    user = request.auth_user

    if request.method == "GET":
        goals = SavingsGoal.objects.filter(user=user)
        goals_list = []
        for g in goals:
            tgt = g.target_amount or Decimal('1.00')
            pct = min(100, int((g.saved_amount / tgt) * 100)) if tgt > 0 else 0
            remaining = max(Decimal('0.00'), tgt - g.saved_amount)
            goals_list.append({
                "id": g.id,
                "name": g.name,
                "target_amount": str(g.target_amount),
                "saved_amount": str(g.saved_amount),
                "remaining": str(remaining),
                "percent": pct,
                "target_date": g.target_date.strftime("%Y-%m-%d") if g.target_date else None,
                "category": g.category,
                "color": g.color,
                "created_at": g.created_at.strftime("%Y-%m-%d"),
            })
        return JsonResponse({"savings_goals": goals_list})

    elif request.method == "POST":
        data = _json_body(request)
        name = (data.get("name") or "").strip()
        if not name:
            return JsonResponse({"error": "Goal name is required"}, status=400)

        try:
            target_amount = Decimal(str(data.get("target_amount", "0")))
            if target_amount <= 0:
                return JsonResponse({"error": "Target amount must be greater than zero"}, status=400)
        except Exception:
            return JsonResponse({"error": "Invalid target amount"}, status=400)

        try:
            saved_amount = Decimal(str(data.get("saved_amount", "0.00")))
        except Exception:
            saved_amount = Decimal("0.00")

        target_date_str = data.get("target_date")
        target_date = None
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass

        color = data.get("color", "#10B981")
        category = data.get("category", "General")

        goal = SavingsGoal.objects.create(
            user=user,
            name=name,
            target_amount=target_amount,
            saved_amount=saved_amount,
            target_date=target_date,
            color=color,
            category=category,
        )
        return JsonResponse({"message": "Savings goal created successfully", "id": goal.id}, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not goal_id:
            return JsonResponse({"error": "Goal ID required"}, status=400)
        try:
            goal = SavingsGoal.objects.get(id=goal_id, user=user)
        except SavingsGoal.DoesNotExist:
            return JsonResponse({"error": "Goal not found"}, status=404)

        data = _json_body(request)
        if "name" in data:
            goal.name = data["name"].strip()
        if "target_amount" in data:
            try:
                goal.target_amount = Decimal(str(data["target_amount"]))
            except Exception:
                pass
        if "saved_amount" in data:
            try:
                goal.saved_amount = Decimal(str(data["saved_amount"]))
            except Exception:
                pass
        if "target_date" in data:
            try:
                goal.target_date = datetime.strptime(data["target_date"], "%Y-%m-%d").date() if data["target_date"] else None
            except ValueError:
                pass
        if "color" in data:
            goal.color = data["color"]
        if "category" in data:
            goal.category = data["category"]

        goal.save()
        return JsonResponse({"message": "Savings goal updated successfully"})

    elif request.method == "DELETE":
        if not goal_id:
            return JsonResponse({"error": "Goal ID required"}, status=400)
        try:
            goal = SavingsGoal.objects.get(id=goal_id, user=user)
            goal.delete()
            return JsonResponse({"message": "Savings goal deleted successfully"})
        except SavingsGoal.DoesNotExist:
            return JsonResponse({"error": "Goal not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@require_http_methods(["POST"])
@token_required
def api_savings_goal_contribute(request, goal_id):
    """Add a deposit/contribution to a savings goal."""
    user = request.auth_user
    try:
        goal = SavingsGoal.objects.get(id=goal_id, user=user)
    except SavingsGoal.DoesNotExist:
        return JsonResponse({"error": "Savings goal not found"}, status=404)

    data = _json_body(request)
    try:
        amount = Decimal(str(data.get("amount", "0")))
        if amount <= 0:
            return JsonResponse({"error": "Amount must be greater than zero"}, status=400)
    except Exception:
        return JsonResponse({"error": "Invalid deposit amount"}, status=400)

    goal.saved_amount += amount
    goal.save()

    # Create record
    account = Account.objects.filter(user=user).first()
    Transaction.objects.create(
        user=user,
        account=account,
        description=f"Savings Contribution: {goal.name}",
        amount=amount,
        type='expense',
        category='Savings',
        date=timezone.now().date(),
        status='Completed',
        notes=f"Added funds towards '{goal.name}' goal",
    )

    return JsonResponse({
        "message": f"Successfully added ₹{amount} to {goal.name}!",
        "saved_amount": str(goal.saved_amount),
        "target_amount": str(goal.target_amount),
    })


# ==========================================
# CATEGORIES MANAGEMENT
# ==========================================

@csrf_exempt
@token_required
def api_categories(request, category_id=None):
    user = request.auth_user

    if request.method == "GET":
        ensure_default_categories(user)
        cats = Category.objects.filter(user=user)
        cats_list = [{
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "color": c.color,
            "icon": c.icon,
            "budget_limit": str(c.budget_limit),
        } for c in cats]
        return JsonResponse({"categories": cats_list})

    elif request.method == "POST":
        data = _json_body(request)
        name = (data.get("name") or "").strip()
        if not name:
            return JsonResponse({"error": "Category name is required"}, status=400)

        ctype = data.get("type", "expense")
        color = data.get("color", "#64748B")
        icon = data.get("icon", "Tag")
        try:
            budget_limit = Decimal(str(data.get("budget_limit", "0.00")))
        except Exception:
            budget_limit = Decimal("0.00")

        cat = Category.objects.create(
            user=user,
            name=name,
            type=ctype,
            color=color,
            icon=icon,
            budget_limit=budget_limit,
        )
        return JsonResponse({"message": "Category created", "id": cat.id}, status=201)

    elif request.method in ["PUT", "PATCH"]:
        if not category_id:
            return JsonResponse({"error": "Category ID required"}, status=400)
        try:
            cat = Category.objects.get(id=category_id, user=user)
        except Category.DoesNotExist:
            return JsonResponse({"error": "Category not found"}, status=404)

        data = _json_body(request)
        if "name" in data:
            cat.name = data["name"].strip()
        if "type" in data:
            cat.type = data["type"]
        if "color" in data:
            cat.color = data["color"]
        if "icon" in data:
            cat.icon = data["icon"]
        if "budget_limit" in data:
            try:
                cat.budget_limit = Decimal(str(data["budget_limit"]))
            except Exception:
                pass

        cat.save()
        return JsonResponse({"message": "Category updated successfully"})

    elif request.method == "DELETE":
        if not category_id:
            return JsonResponse({"error": "Category ID required"}, status=400)
        try:
            cat = Category.objects.get(id=category_id, user=user)
            cat.delete()
            return JsonResponse({"message": "Category deleted successfully"})
        except Category.DoesNotExist:
            return JsonResponse({"error": "Category not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


# ==========================================
# REPORTS & ANALYTICS
# ==========================================

@require_http_methods(["GET"])
@token_required
def api_reports(request):
    user = request.auth_user
    now = timezone.now()

    # Timeframe selection: 1m, 3m, 6m, 1y, all
    timeframe = request.GET.get('timeframe', '6m')
    if timeframe == '1m':
        days = 30
    elif timeframe == '3m':
        days = 90
    elif timeframe == '1y':
        days = 365
    elif timeframe == 'all':
        days = 3650
    else:
        days = 180

    start_date = now.date() - timedelta(days=days)
    txns = Transaction.objects.filter(user=user, date__gte=start_date, status='Completed')

    income_total = txns.filter(type='income').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
    expense_total = txns.filter(type='expense').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
    net_savings = income_total - expense_total
    savings_rate = round(float((net_savings / income_total) * 100), 1) if income_total > 0 else 0.0

    # Group by category
    cat_breakdown = []
    cat_expenses = txns.filter(type='expense').values('category').annotate(total=Sum('amount')).order_by('-total')
    for c in cat_expenses:
        amt = c['total']
        pct = round((amt / expense_total * 100), 1) if expense_total > 0 else 0
        cat_breakdown.append({
            "category": c['category'],
            "amount": str(amt),
            "percent": float(pct),
        })

    # Account balances summary table
    accounts = Account.objects.filter(user=user)
    for a in accounts:
        a.update_balance()

    accounts_ledger = [{
        "name": a.name,
        "type": a.account_type,
        "initial": str(a.initial_balance),
        "current": str(a.current_balance),
        "color": a.color,
    } for a in accounts]

    return JsonResponse({
        "summary": {
            "income": f"{income_total:.2f}",
            "expenses": f"{expense_total:.2f}",
            "net_savings": f"{net_savings:.2f}",
            "savings_rate": savings_rate,
            "total_transactions": txns.count(),
        },
        "category_breakdown": cat_breakdown,
        "accounts_ledger": accounts_ledger,
    })


# ==========================================
# SETTINGS & USER PROFILE
# ==========================================

@csrf_exempt
@token_required
def api_user_settings(request):
    user = request.auth_user
    settings, _ = UserSettings.objects.get_or_create(user=user)

    if request.method == "GET":
        return JsonResponse({
            "user": _user_payload(user),
            "currency_symbol": settings.currency_symbol,
            "currency_code": settings.currency_code,
            "monthly_budget_target": str(settings.monthly_budget_target),
            "notifications_enabled": settings.notifications_enabled,
        })

    elif request.method == "POST":
        data = _json_body(request)
        if not data:
            return JsonResponse({"error": "Invalid data"}, status=400)

        if "name" in data:
            user.first_name = data["name"].strip()
            user.save(update_fields=["first_name"])

        if "currency_symbol" in data:
            settings.currency_symbol = data["currency_symbol"]
        if "currency_code" in data:
            settings.currency_code = data["currency_code"]
        if "monthly_budget_target" in data:
            try:
                settings.monthly_budget_target = Decimal(str(data["monthly_budget_target"]))
            except Exception:
                pass
        if "notifications_enabled" in data:
            settings.notifications_enabled = bool(data["notifications_enabled"])

        settings.save()
        return JsonResponse({
            "message": "Settings updated successfully",
            "user": _user_payload(user),
        })

    return JsonResponse({"error": "Method not allowed"}, status=405)


# ==========================================
# ML AI CHAT ASSISTANT
# ==========================================

@csrf_exempt
@require_http_methods(["POST", "GET"])
@token_required
def api_ai_chat(request):
    """
    ML Chat Assistant Endpoint:
    POST /api/ai-chat/
    Body: {"message": "Can I spend ₹3000 on a hotel?"}

    Uses Scikit-Learn RandomForestClassifier trained on [balance, monthly_budget, spending, remaining_budget, requested_amount].
    Strictly uses ONLY request.auth_user's database values.
    """
    from .ai_service import process_chat_message, get_user_financial_metrics, metrics_summary

    user = request.auth_user  # the logged-in user, resolved from the token

    if request.method == "GET":
        metrics = get_user_financial_metrics(user)
        return JsonResponse({
            "metrics": metrics_summary(metrics),
            "user_name": metrics["user_name"],
            "currency_symbol": metrics["currency_symbol"],
        })

    data = _json_body(request)
    if not isinstance(data, dict):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    message = str(data.get("message") or "").strip()[:500]
    if not message:
        return JsonResponse({"error": "Message cannot be empty."}, status=400)

    result = process_chat_message(user, message)
    return JsonResponse(result)




# ==========================================
# PUSH NOTIFICATIONS (phone reminders)
# ==========================================

@require_http_methods(["GET"])
def api_push_public_key(request):
    return JsonResponse({"public_key": get_vapid_keys()["public"]})


@csrf_exempt
@token_required
def api_push_subscribe(request):
    user = request.auth_user
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if request.method == "POST":
        endpoint = data.get("endpoint")
        keys = data.get("keys") or {}
        if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
            return JsonResponse({"error": "Invalid subscription"}, status=400)
        # A device belongs to whoever logged in last
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": user,
                "p256dh": keys["p256dh"],
                "auth": keys["auth"],
                "user_agent": request.headers.get("User-Agent", "")[:255],
            },
        )
        return JsonResponse({"message": "Phone notifications enabled"}, status=201)

    if request.method == "DELETE":
        PushSubscription.objects.filter(user=user, endpoint=data.get("endpoint")).delete()
        return JsonResponse({"message": "Phone notifications disabled"})

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@token_required
@require_http_methods(["POST"])
def api_push_test(request):
    sent = push_to_user(
        request.auth_user,
        "🔔 Finova test reminder",
        "Phone notifications are working. You'll get bill reminders a day before and on the due date.",
        tag="finova-test",
    )
    if sent == 0:
        return JsonResponse({"error": "No device could be reached. Enable phone notifications first."}, status=404)
    return JsonResponse({"message": f"Test sent to {sent} device(s)"})
