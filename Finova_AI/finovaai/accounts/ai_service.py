"""
Finova chat assistant (no external AI API).

How it works
------------
1. A RandomForestClassifier (scikit-learn) is trained on the 5 features
      [balance, monthly_budget, spending, remaining_budget, requested_amount]
   and predicts 1 = Affordable / 0 = Not Affordable.
2. Every number shown to the user (balance, budget left, food spent, savings)
   comes from the logged-in user's own rows in the database via normal Django
   queries + Python arithmetic.  The ML model only returns a yes/no label,
   it never produces or changes any amount.
3. Every query is filtered with user=<request.auth_user>, so one user can never
   read another user's data.

Besides the yes/no affordability answer the assistant can now also
   * PREDICT this month's / next month's expenses (overall and per category),
   * show + PREDICT the remaining balance of EVERY budget the user has set,
   * give short RECOMMENDATIONS based on those numbers.
These predictions are plain, explainable maths on the user's own transaction history
(spending pace so far + average of the previous months), not guesses from a model.

Train the model once with:   python manage.py train_affordability_model
(If the saved model file is missing, it is trained automatically on first use.)
"""
import calendar
import re
from decimal import Decimal
from pathlib import Path

import joblib
import numpy as np
from django.db.models import Q, Sum
from django.utils import timezone
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

from .models import Account, Bill, Budget, SavingsGoal, Transaction, UserSettings, user_total_balance

OFF_TOPIC_REPLY = "I can only help with your Finova balance, budget, spending, and savings."

FEATURE_NAMES = ["balance", "monthly_budget", "spending", "remaining_budget", "requested_amount"]
SAFE_BUFFER = 200  # a purchase must leave at least this much in the balance

MODEL_PATH = Path(__file__).resolve().parent / "ml" / "affordability_rf.joblib"
_rf_model = None  # cached in memory after the first load


# ---------------------------------------------------------------------------
# 1. RANDOM FOREST: training, saving, loading
# ---------------------------------------------------------------------------

def affordability_rule(balance, remaining_budget, requested):
    """
    The affordability rule used to LABEL the training data and to double-check
    the model's answer with exact arithmetic.  Works with floats or Decimals.
    Affordable = within balance, within the remaining monthly budget, and
    leaves at least SAFE_BUFFER in the balance.
    """
    return (
        requested <= balance
        and requested <= remaining_budget
        and (balance - requested) >= SAFE_BUFFER
    )


def _build_training_data(n_samples=6000, seed=42):
    rng = np.random.RandomState(seed)

    balance = rng.uniform(-5000, 400000, n_samples)
    monthly_budget = rng.uniform(1000, 200000, n_samples)
    spending = monthly_budget * rng.uniform(0.0, 1.3, n_samples)  # 0-130% of budget spent
    remaining = np.maximum(0.0, monthly_budget - spending)

    # Half the requests are random, half sit close to the balance / remaining
    # budget so the forest learns the decision boundary properly.
    random_req = rng.uniform(50, 100000, n_samples)
    limit = np.maximum(1.0, np.minimum(np.maximum(balance, 1.0), np.maximum(remaining, 1.0)))
    near_limit_req = limit * rng.uniform(0.05, 1.6, n_samples)
    requested = np.where(rng.rand(n_samples) < 0.5, random_req, near_limit_req)

    labels = (
        (requested <= balance)
        & (requested <= remaining)
        & ((balance - requested) >= SAFE_BUFFER)
    ).astype(int)

    X = np.column_stack([balance, monthly_budget, spending, remaining, requested])
    return X, labels


def train_model(save=True, n_samples=6000):
    """Train the Random Forest, optionally save it, return (model, accuracy)."""
    global _rf_model
    X, y = _build_training_data(n_samples)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    accuracy = float(model.score(X_test, y_test))

    if save:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, MODEL_PATH)

    _rf_model = model
    return model, accuracy


def get_model():
    """Return the cached model, else load the saved file, else train a new one."""
    global _rf_model
    if _rf_model is not None:
        return _rf_model

    if MODEL_PATH.exists():
        try:
            _rf_model = joblib.load(MODEL_PATH)
            return _rf_model
        except Exception:
            pass  # unreadable / made by another scikit-learn version -> retrain

    try:
        model, _ = train_model(save=True)
    except OSError:
        model, _ = train_model(save=False)  # read-only disk: keep it in memory only
    return model


def predict_affordable(balance, monthly_budget, spending, remaining_budget, requested):
    """Random Forest prediction -> True (Affordable) / False (Not Affordable)."""
    features = np.array([[balance, monthly_budget, spending, remaining_budget, requested]], dtype=float)
    return bool(get_model().predict(features)[0] == 1)


# ---------------------------------------------------------------------------
# 2. QUESTION PARSING (no ML, just regex)
# ---------------------------------------------------------------------------

_AMOUNT_RE = re.compile(
    r"(?P<cur>(?<![a-z])(?:₹|rs\.?|inr))?\s*(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>k|thousand|lakhs?|lacs?)?(?![a-z0-9])"
)
_UNIT_MULTIPLIER = {"k": 1000, "thousand": 1000, "lakh": 100000, "lakhs": 100000, "lac": 100000, "lacs": 100000}


def extract_amount(text):
    """
    Pull the requested amount out of a question.
    Understands: ₹3000, ₹3,000, Rs 3000, INR 3000, 3k, 2.5k, 1 lakh, "5000 hotel".
    A number written with a currency marker wins over a bare number.
    Returns a Decimal or None.
    """
    t = re.sub(r"(?<=\d),(?=\d)", "", (text or "").lower())
    matches = list(_AMOUNT_RE.finditer(t))
    if not matches:
        return None
    chosen = next((m for m in matches if m.group("cur")), matches[0])
    value = Decimal(chosen.group("num"))
    unit = chosen.group("unit")
    if unit:
        value *= _UNIT_MULTIPLIER[unit]
    return value if value > 0 else None


CATEGORY_KEYWORDS = {
    "food": ["food", "dining", "dinner", "lunch", "breakfast", "restaurant", "cafe", "coffee", "swiggy", "zomato", "snack", "burger", "pizza"],
    "groceries": ["grocery", "groceries", "supermarket", "vegetables", "fruits", "milk"],
    "shopping": ["shopping", "clothes", "shoes", "dress", "shirt", "amazon", "flipkart", "myntra", "watch"],
    "hotel": ["hotel", "resort", "stay", "trip", "travel", "flight", "vacation", "airbnb"],
    "housing": ["rent", "house", "maintenance", "flat"],
    "utilities": ["utility", "utilities", "electricity", "water", "wifi", "internet", "broadband", "phone bill"],
    "entertainment": ["movie", "movies", "cinema", "netflix", "spotify", "games", "concert"],
    "healthcare": ["doctor", "medicine", "hospital", "gym", "health", "fitness"],
    "transportation": ["fuel", "petrol", "diesel", "cab", "uber", "ola", "metro", "bus", "train"],
}

# words searched for in the user's Transaction.category / Budget.category_name
CATEGORY_DB_TERMS = {
    "food": ["Food"],
    "groceries": ["Groceries"],
    "shopping": ["Shopping"],
    "hotel": ["Travel", "Hotel", "Trip"],
    "housing": ["Housing", "Rent"],
    "utilities": ["Utilities", "Bills"],
    "entertainment": ["Entertainment"],
    "healthcare": ["Healthcare", "Health"],
    "transportation": ["Transportation", "Transport"],
}


def _has_word(text, word):
    return re.search(rf"\b{re.escape(word)}\b", text) is not None


def extract_category(text):
    t = (text or "").lower()
    for name, words in CATEGORY_KEYWORDS.items():
        if any(_has_word(t, w) for w in words):
            return name
    return None


_FINANCE_RE = re.compile(
    r"\b(spend\w*|spent|afford\w*|buy|bought|purchas\w*|balance|budget\w*|saving\w*|saved|save|"
    r"money|expens\w*|bills?|transactions?|accounts?|cash|income|limit|remaining|rupees?|rs|inr|"
    r"predict\w*|forecast\w*|projection|projected|overspend\w*|exceed\w*|month.?end|insights?)\b"
)
_GREETING_RE = re.compile(r"^\s*(hi+|hello+|hey+|hola|namaste|help|good (morning|afternoon|evening))\b[\s!.?]*$")
_AFFORD_VERB_RE = re.compile(r"\b(afford\w*|spend|buy|purchas\w*|splurge)\b|\bcan i\b|\bshould i\b")
_PAST_OR_TOTAL_RE = re.compile(r"\b(spent|how much did|how much have)\b")

# "predict my expenses", "how much will I spend this month", "will I exceed my budget", "next month"
_PREDICT_RE = re.compile(
    r"\b(predict\w*|forecast\w*|projection|projected|estimate\w*)\b"
    r"|month.?end|end of (the |this )?month|next month"
    r"|\bwill i (run out|exceed|overspend|have|be|spend)\b|\bgoing to spend\b|\bhow much will\b"
)
_NOT_PREDICT_RE = re.compile(r"\b(can i|should i|afford\w*)\b")

# "any recommendations?", "give me suggestions", "what are your thoughts on my spending"
_ADVICE_RE = re.compile(
    r"\b(recommend\w*|suggest\w*|advice|advise|tips?|thoughts?|insights?|improve|reduce|analy[sz]e|review)\b"
    r"|how am i doing|cut (down|back)"
)
# a bare advice request with no finance word still counts as finance in this finance-only chat
_BARE_ADVICE_RE = re.compile(
    r"^\s*(please |can you |could you |what |any |give me |your |some |share )*"
    r"(recommend\w*|suggest\w*|advice|tips?|thoughts?|insights?)( please)?[\s?.!]*$"
)


# ---------------------------------------------------------------------------
# 3. USER DATA  (every query is filtered by the logged-in user)
# ---------------------------------------------------------------------------

def _month_expenses(user, now, **extra):
    return (
        Transaction.objects.filter(
            user=user, type__iexact="expense", status__iexact="Completed",
            date__year=now.year, date__month=now.month, **extra
        ).aggregate(s=Sum("amount"))["s"]
        or Decimal("0.00")
    )


def _terms_q(field, terms):
    q = Q()
    for term in terms:
        q |= Q(**{f"{field}__icontains": term})
    return q


# ---------------------------------------------------------------------------
# 3b. BUDGET BREAKDOWN, EXPENSE PREDICTION, RECOMMENDATIONS
#     (plain maths on this user's own transactions - nothing is invented)
# ---------------------------------------------------------------------------

def _expense_sum(user, year, month, *q, **extra):
    return (
        Transaction.objects.filter(
            *q, user=user, type__iexact="expense", status__iexact="Completed",
            date__year=year, date__month=month, **extra
        ).aggregate(s=Sum("amount"))["s"]
        or Decimal("0.00")
    )


def _shift_month(year, month, back):
    idx = year * 12 + (month - 1) - back
    return idx // 12, idx % 12 + 1


def _history_average(user, now, *q, months=3, **extra):
    """Average monthly spend over the previous `months` months (None if there is no history)."""
    vals = [_expense_sum(user, *_shift_month(now.year, now.month, b), *q, **extra) for b in range(1, months + 1)]
    while vals and vals[-1] == 0:  # drop the oldest empty months (before the user started tracking)
        vals.pop()
    return (sum(vals, Decimal("0.00")) / len(vals)) if vals else None


def project_month_end(spent, history_avg, day, days_in_month):
    """
    Expected spend by the end of the month.
    Early in the month the pace is noisy, so it leans on the previous months' average;
    as the month goes on it leans more and more on the actual pace so far.
    """
    spent = Decimal(spent)
    if day >= days_in_month:
        return spent
    run_rate = spent / day * days_in_month
    if history_avg is None:
        projected = run_rate
    else:
        w = Decimal(day) / Decimal(days_in_month)
        projected = w * run_rate + (1 - w) * history_avg
    return max(spent, projected).quantize(Decimal("1"))


def get_budget_breakdown(user, now=None):
    """One row per budget the user has set: spent, left now, predicted month-end spend and predicted left."""
    now = now or timezone.now()
    dim = calendar.monthrange(now.year, now.month)[1]
    days_left = dim - now.day
    rows = []
    for b in Budget.objects.filter(user=user):
        name = b.category_name
        limit = b.monthly_limit or Decimal("0.00")
        spent = _expense_sum(user, now.year, now.month, category__iexact=name)
        predicted = project_month_end(spent, _history_average(user, now, category__iexact=name), now.day, dim)
        left = limit - spent
        percent = int((spent / limit) * 100) if limit > 0 else 0
        if spent > limit:
            status = "over"
        elif predicted > limit:
            status = "will_exceed"
        elif percent >= 80:
            status = "watch"
        else:
            status = "on_track"
        rows.append({
            "name": name,
            "limit": limit,
            "spent": spent,
            "left": left,                              # can be negative = over budget
            "percent": percent,
            "predicted_spend": predicted,
            "predicted_left": limit - predicted,       # can be negative = predicted to exceed
            "daily_pace": (spent / now.day) if now.day else Decimal("0.00"),
            "daily_allowance": (left / days_left) if (days_left > 0 and left > 0) else Decimal("0.00"),
            "status": status,
        })
    rows.sort(key=lambda r: r["percent"], reverse=True)
    return rows


def get_expense_forecast(user, balance, now=None):
    """Predicted spending (this month end, next month) + predicted month-end balance + top categories."""
    now = now or timezone.now()
    dim = calendar.monthrange(now.year, now.month)[1]

    spent = _expense_sum(user, now.year, now.month)
    hist = _history_average(user, now)
    predicted = project_month_end(spent, hist, now.day, dim)

    # unpaid / overdue bills still due this month are a hard floor for the prediction
    bills_due = (
        Bill.objects.filter(user=user, status__in=["Unpaid", "Overdue"])
        .filter(Q(due_date__year=now.year, due_date__month=now.month) | Q(status="Overdue"))
        .aggregate(s=Sum("amount"))["s"]
        or Decimal("0.00")
    )
    predicted = max(predicted, spent + bills_due)

    next_month = ((predicted + hist) / 2).quantize(Decimal("1")) if hist is not None else predicted

    top = []
    cats = (
        Transaction.objects.filter(
            user=user, type__iexact="expense", status__iexact="Completed",
            date__year=now.year, date__month=now.month,
        ).values("category").annotate(s=Sum("amount")).order_by("-s")[:5]
    )
    for c in cats:
        c_spent = c["s"]
        c_pred = project_month_end(c_spent, _history_average(user, now, category__iexact=c["category"]), now.day, dim)
        top.append({"name": c["category"], "spent": c_spent, "predicted_spend": c_pred})

    return {
        "day": now.day,
        "days_in_month": dim,
        "days_left": dim - now.day,
        "spent": spent,
        "bills_due": bills_due,
        "history_avg": hist,
        "predicted_spend": predicted,
        "predicted_balance": balance - (predicted - spent),   # assumes no new income
        "next_month_spend": next_month,
        "top_categories": top,
    }


def _norm(text):
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())


def find_budget(rows, text):
    """Which of the user's own budgets is the question about? (by name, or by a category word like 'food')"""
    t = _norm(text)
    # 1) the budget's full name is in the question
    for r in rows:
        if _norm(r["name"]).strip() and _has_word(t, _norm(r["name"]).strip()):
            return r
    # 2) a category keyword (food, shopping...) that matches the budget's name
    category = extract_category(text)
    if category:
        for r in rows:
            n = r["name"].lower()
            if category in n or any(term.lower() in n for term in CATEGORY_DB_TERMS.get(category, [])):
                return r
    # 3) any meaningful word of the budget name is in the question ("Food & Dining" -> "dining")
    for r in rows:
        words = [w for w in _norm(r["name"]).split() if len(w) >= 4 and w not in ("and", "other", "misc", "budget", "budgets", "monthly", "expense", "expenses")]
        if any(_has_word(t, w) for w in words):
            return r
    return None


def build_recommendations(metrics, limit=5):
    """Short, specific tips built from the budget rows and forecast."""
    sym = metrics["currency_symbol"]
    rows, fc = metrics["budgets"], metrics["forecast"]
    tips = []

    for r in rows:
        if r["status"] == "over":
            tips.append(
                f"🔴 {r['name']}: you are already {_money(sym, -r['left'])} over your {_money(sym, r['limit'])} budget. "
                f"Pause extra {r['name'].lower()} spending for the rest of the month, or raise the budget if this is a real need."
            )
    for r in rows:
        if r["status"] == "will_exceed":
            over = -r["predicted_left"]
            allow = f" Keep it to about {_money(sym, r['daily_allowance'])}/day (you are at {_money(sym, r['daily_pace'])}/day) to stay inside the budget." if r["daily_allowance"] > 0 else ""
            tips.append(f"⚠️ {r['name']}: at this pace you will finish about {_money(sym, over)} over budget.{allow}")
    for r in rows:
        if r["status"] == "watch":
            tips.append(f"⚠️ {r['name']}: {r['percent']}% of the budget is used, only {_money(sym, r['left'])} left - go slowly.")

    if fc["predicted_balance"] < SAFE_BUFFER:
        tips.append(
            f"🔴 Your balance is predicted to be {_money(sym, fc['predicted_balance'])} by month end, "
            f"below the {_money(sym, SAFE_BUFFER)} safety buffer. Postpone non-essential purchases."
        )

    budget_names = {r["name"].lower() for r in rows}
    for c in fc["top_categories"]:
        if c["name"].lower() not in budget_names and c["spent"] > 0:
            tips.append(f"💡 You spent {_money(sym, c['spent'])} on {c['name']} but have no budget for it. Setting one will let me track it for you.")
            break

    safe_rows = [r for r in rows if r["status"] == "on_track" and r["predicted_left"] > 0]
    unused = sum((r["predicted_left"] for r in safe_rows), Decimal("0.00"))
    if safe_rows and unused > 0:
        best = max(safe_rows, key=lambda r: r["predicted_left"])
        goal = f" towards your '{metrics['open_goal']}' goal" if metrics.get("open_goal") else " to savings"
        tips.append(
            f"✅ {best['name']} is on track and should end with about {_money(sym, best['predicted_left'])} unused. "
            f"Across your on-track budgets about {_money(sym, unused)} may be left - consider moving some{goal}."
        )

    if not rows:
        tips.append("💡 You have no category budgets yet. Add a budget for each category you spend on (food, shopping, travel...) and I can predict each one.")
    if not tips:
        tips.append("✅ Everything looks on track this month. Keep going!")
    return tips[:limit]


def get_user_financial_metrics(user):
    """Exact balance / budget / spending / savings for THIS user only."""
    now = timezone.now()
    settings, _ = UserSettings.objects.get_or_create(user=user)

    # Balance (same logic as the dashboard)
    balance = user_total_balance(user)

    # Monthly budget: category budgets, else the budget target saved in Settings
    budget_is_set = True
    monthly_budget = sum((b.monthly_limit for b in Budget.objects.filter(user=user)), Decimal("0.00"))
    if monthly_budget <= 0:
        monthly_budget = settings.monthly_budget_target or Decimal("0.00")

    budgets = get_budget_breakdown(user, now)
    if Budget.objects.filter(user=user).exists() and budgets:
        # Category budgets are set: compare only spending in those categories
        # (same numbers the Budgets page / dashboard show).
        spending = sum((r["spent"] for r in budgets), Decimal("0.00"))
    else:
        spending = _month_expenses(user, now)

    if monthly_budget > 0:
        remaining_budget = max(Decimal("0.00"), monthly_budget - spending)
    else:
        # No budget set anywhere: do not invent one, only the balance limits the user.
        budget_is_set = False
        monthly_budget = max(Decimal("0.00"), balance)
        remaining_budget = max(Decimal("0.00"), balance)

    # Food budget (only if the user really has one)
    food_spent = _month_expenses(user, now, category__icontains="Food")
    food_budget_obj = Budget.objects.filter(user=user, category_name__icontains="Food").first()
    food_budget = food_budget_obj.monthly_limit if food_budget_obj else None
    food_remaining = max(Decimal("0.00"), food_budget - food_spent) if food_budget is not None else None

    goals = SavingsGoal.objects.filter(user=user)
    total_saved = goals.aggregate(s=Sum("saved_amount"))["s"] or Decimal("0.00")
    total_target = goals.aggregate(s=Sum("target_amount"))["s"] or Decimal("0.00")
    open_goal = next((g.name for g in goals if g.saved_amount < g.target_amount), None)

    forecast = get_expense_forecast(user, balance, now)

    return {
        "user_name": (user.first_name or user.username.split("@")[0]).capitalize(),
        "currency_symbol": settings.currency_symbol or "₹",
        "balance": balance,
        "monthly_budget": monthly_budget,
        "budget_is_set": budget_is_set,
        "spending": spending,
        "remaining_budget": remaining_budget,
        "food_spent": food_spent,
        "food_budget": food_budget,
        "food_remaining": food_remaining,
        "total_saved": total_saved,
        "total_target": total_target,
        "open_goal": open_goal,
        "budgets": budgets,
        "forecast": forecast,
    }


def _money(sym, value):
    return f"{sym}{value:,.0f}"


def _signed(sym, value):
    return f"-{sym}{abs(value):,.0f}" if value < 0 else f"{sym}{value:,.0f}"


_STATUS_ICON = {"over": "🔴", "will_exceed": "⚠️", "watch": "⚠️", "on_track": "✅"}
_STATUS_LABEL = {"over": "Over budget", "will_exceed": "May exceed", "watch": "Almost used", "on_track": "On track"}


def metrics_summary(metrics):
    """The values shown in the side panel of the chat page, already formatted."""
    sym = metrics["currency_symbol"]
    fc = metrics["forecast"]
    return {
        "balance": _money(sym, metrics["balance"]),
        "monthly_budget_left": _money(sym, metrics["remaining_budget"]),
        "food_budget_left": _money(sym, metrics["food_remaining"]) if metrics["food_remaining"] is not None else "Not set",
        "savings_goal": _money(sym, metrics["total_saved"]),
        "predicted_month_spend": _money(sym, fc["predicted_spend"]),
        "predicted_balance": _signed(sym, fc["predicted_balance"]),
        "budgets": [
            {
                "name": r["name"],
                "limit": _money(sym, r["limit"]),
                "spent": _money(sym, r["spent"]),
                "left": _signed(sym, r["left"]),
                "percent": r["percent"],
                "predicted_spend": _money(sym, r["predicted_spend"]),
                "predicted_left": _signed(sym, r["predicted_left"]),
                "status": r["status"],
                "status_label": _STATUS_LABEL[r["status"]],
            }
            for r in metrics["budgets"]
        ],
    }


# ---------------------------------------------------------------------------
# 4. THE CHAT
# ---------------------------------------------------------------------------

def _answer(reply, metrics, prediction=None):
    return {"reply": reply, "prediction": prediction, "metrics": metrics_summary(metrics)}


def _left_text(sym, value):
    return f"{_money(sym, value)} left" if value >= 0 else f"{_money(sym, -value)} over"


def _budget_line(sym, r):
    return (
        f"{_STATUS_ICON[r['status']]} {r['name']}: {_money(sym, r['spent'])} of {_money(sym, r['limit'])} used "
        f"({_left_text(sym, r['left'])}) → predicted {_money(sym, r['predicted_spend'])} by month end "
        f"({_left_text(sym, r['predicted_left'])})"
    )


def _budget_tip(sym, r):
    if r["status"] == "over":
        return f"You are already over this budget. Pause extra {r['name'].lower()} spending, or raise the limit if it is a real need."
    if r["status"] == "will_exceed":
        allow = f" Try to keep it near {_money(sym, r['daily_allowance'])}/day (you are at {_money(sym, r['daily_pace'])}/day)." if r["daily_allowance"] > 0 else ""
        return f"At this pace you will go {_money(sym, -r['predicted_left'])} over.{allow}"
    if r["status"] == "watch":
        return f"Most of this budget is used - only {_money(sym, r['left'])} left, so go slowly."
    return f"You are on track and should end with about {_money(sym, r['predicted_left'])} unused."


def _forecast_text(metrics):
    sym, fc = metrics["currency_symbol"], metrics["forecast"]
    lines = [
        f"Here is your expense prediction (day {fc['day']} of {fc['days_in_month']}):",
        f"• Spent so far this month: {_money(sym, fc['spent'])}",
        f"• Predicted spending by month end: {_money(sym, fc['predicted_spend'])}",
        f"• Predicted balance at month end: {_signed(sym, fc['predicted_balance'])} (now {_money(sym, metrics['balance'])})",
        f"• Estimate for next month: {_money(sym, fc['next_month_spend'])}",
    ]
    if fc["bills_due"] > 0:
        lines.append(f"• Unpaid bills due: {_money(sym, fc['bills_due'])} (included in the prediction)")
    lines.append("This is based on your spending pace and previous months, and assumes no new income.")
    return "\n".join(lines)


def process_chat_message(user, message_text):
    text = (message_text or "").strip().lower()[:500]
    metrics = get_user_financial_metrics(user)
    sym = metrics["currency_symbol"]
    bal, rem = metrics["balance"], metrics["remaining_budget"]
    budgets, fc = metrics["budgets"], metrics["forecast"]
    no_budget_note = "" if metrics["budget_is_set"] else "\n(You haven't set a monthly budget yet, so I only compared with your balance.)"

    # Greeting
    if _GREETING_RE.match(text):
        return _answer(
            f"Hi {metrics['user_name']}! 👋\nI can help you with your balance, budgets, spending and savings - "
            f"and I can predict your expenses and budget balances and give recommendations. What would you like to know?",
            metrics,
        )

    amount = extract_amount(text)
    category = extract_category(text)
    is_finance = (
        bool(_FINANCE_RE.search(text))
        or (amount is not None and category is not None)
        or bool(_BARE_ADVICE_RE.match(text))
    )
    if not is_finance:
        return _answer(OFF_TOPIC_REPLY, metrics)

    is_past_or_total = bool(_PAST_OR_TOTAL_RE.search(text))
    wants_afford = bool(_AFFORD_VERB_RE.search(text)) and not is_past_or_total
    is_predict = bool(_PREDICT_RE.search(text)) and not _NOT_PREDICT_RE.search(text)
    wants_advice = bool(_ADVICE_RE.search(text)) and not (wants_afford and amount is not None)
    matched = find_budget(budgets, text)

    # P) "Predict my expenses" / "Will I exceed my food budget?" / "balance of my shopping budget by month end"
    if is_predict:
        if matched:
            reply = (
                f"{matched['name']} budget: you have used {_money(sym, matched['spent'])} of {_money(sym, matched['limit'])} so far "
                f"({_left_text(sym, matched['left'])}).\n"
                f"At your pace you will spend about {_money(sym, matched['predicted_spend'])} by month end, "
                f"so the predicted balance of this budget is {_left_text(sym, matched['predicted_left'])}.\n"
                f"{_budget_tip(sym, matched)}"
            )
            return _answer(reply, metrics)

        if category:
            now = timezone.now()
            terms = CATEGORY_DB_TERMS.get(category, [category.capitalize()])
            q = _terms_q("category", terms)
            c_spent = _expense_sum(user, now.year, now.month, q)
            c_pred = project_month_end(c_spent, _history_average(user, now, q), fc["day"], fc["days_in_month"])
            reply = (
                f"You have spent {_money(sym, c_spent)} on {category} this month. "
                f"At your pace you will spend about {_money(sym, c_pred)} by month end.\n"
                f"You don't have a {category} budget, so I can't predict a remaining balance for it - add one and I will track it."
            )
            return _answer(reply, metrics)

        parts = [_forecast_text(metrics)]
        if budgets:
            parts.append("Your budgets (spent / limit → predicted balance):\n" + "\n".join(_budget_line(sym, r) for r in budgets))
        elif fc["top_categories"]:
            parts.append(
                "Where your money is going (spent → predicted):\n"
                + "\n".join(f"• {c['name']}: {_money(sym, c['spent'])} → {_money(sym, c['predicted_spend'])}" for c in fc["top_categories"])
            )
        tips = build_recommendations(metrics, limit=2)
        parts.append("My thoughts:\n" + "\n".join(tips))
        return _answer("\n\n".join(parts), metrics)

    # A) "Can I spend ₹3000 on a hotel?"  -> Random Forest + exact Python maths
    if wants_afford and amount is not None:
        ml_says_yes = predict_affordable(
            float(bal), float(metrics["monthly_budget"]), float(metrics["spending"]), float(rem), float(amount)
        )
        rule_says_yes = affordability_rule(bal, rem, amount)
        affordable = ml_says_yes and rule_says_yes

        if affordable:
            reply = (
                f"Yes, you can spend {_money(sym, amount)}. "
                f"Your current balance is {_money(sym, bal)} and your remaining budget is {_money(sym, rem)}.\n"
                f"After this you would have {_money(sym, bal - amount)} balance and {_money(sym, rem - amount)} budget left."
                f"{no_budget_note}"
            )
        else:
            if amount > bal:
                why = f"{_money(sym, amount)} is more than your current balance of {_money(sym, bal)}."
            elif amount > rem:
                why = (
                    f"It is {_money(sym, amount - rem)} over your remaining budget of {_money(sym, rem)}. "
                    f"Your current balance is {_money(sym, bal)}."
                )
            else:
                why = f"It would leave your balance below the {_money(sym, SAFE_BUFFER)} safety buffer."
            reply = f"No, I don't recommend spending {_money(sym, amount)} right now. {why}{no_budget_note}"

        # the same check against the specific budget the purchase belongs to
        if matched:
            after = matched["left"] - amount
            if after >= 0:
                reply += f"\nYour {matched['name']} budget would have {_money(sym, after)} left after this."
            else:
                reply += f"\nNote: this would put your {matched['name']} budget {_money(sym, -after)} over its {_money(sym, matched['limit'])} limit."
        return _answer(reply, metrics, "Affordable" if affordable else "Not Affordable")

    # R) "Any recommendations?" / "give me suggestions" / "advice on my food budget"
    if wants_advice:
        if matched:
            reply = f"{_budget_line(sym, matched)}\n\nMy thoughts: {_budget_tip(sym, matched)}"
            return _answer(reply, metrics)
        tips = build_recommendations(metrics)
        reply = (
            f"Here are my thoughts on your spending (balance {_money(sym, bal)}, "
            f"predicted month-end spend {_money(sym, fc['predicted_spend'])}):\n" + "\n".join(tips)
        )
        return _answer(reply, metrics)

    # B) "How much can I spend?"
    if wants_afford and re.search(r"\bhow much\b", text):
        safe = max(Decimal("0.00"), min(bal - SAFE_BUFFER, rem))
        return _answer(
            f"You can safely spend up to {_money(sym, safe)}. "
            f"Your current balance is {_money(sym, bal)} and your remaining budget is {_money(sym, rem)}.{no_budget_note}",
            metrics,
        )

    # C) "How much did I spend on food this month?"  /  "How much is left in my shopping budget?"
    if matched and re.search(r"\b(spend|spent|spending|much|left|remaining|balance|budget)\b", text):
        reply = (
            f"You spent {_money(sym, matched['spent'])} on {matched['name']} this month.\n"
            f"Your {matched['name']} budget is {_money(sym, matched['limit'])}, so you have {_left_text(sym, matched['left'])}.\n"
            f"Predicted by month end: {_money(sym, matched['predicted_spend'])} ({_left_text(sym, matched['predicted_left'])})."
        )
        return _answer(reply, metrics)

    if category and re.search(r"\b(spend|spent|spending|much)\b", text):
        now = timezone.now()
        terms = CATEGORY_DB_TERMS.get(category, [category.capitalize()])
        cat_spent = (
            Transaction.objects.filter(
                _terms_q("category", terms),
                user=user, type__iexact="expense", status__iexact="Completed",
                date__year=now.year, date__month=now.month,
            ).aggregate(s=Sum("amount"))["s"]
            or Decimal("0.00")
        )
        budget_row = Budget.objects.filter(_terms_q("category_name", terms), user=user).first()
        reply = f"You spent {_money(sym, cat_spent)} on {category} this month."
        if budget_row:
            left = max(Decimal("0.00"), budget_row.monthly_limit - cat_spent)
            reply += f"\nYour {category} budget is {_money(sym, budget_row.monthly_limit)}, so you have {_money(sym, left)} remaining."
        return _answer(reply, metrics)

    # D) Savings
    if re.search(r"\b(saved|saving\w*|save)\b", text):
        saved, target = metrics["total_saved"], metrics["total_target"]
        if target > 0:
            pct = int((saved / target) * 100)
            reply = f"You have saved {_money(sym, saved)} towards your total goal of {_money(sym, target)} ({pct}% completed)."
        else:
            reply = f"You have saved {_money(sym, saved)}. You haven't set a savings goal target yet."
        return _answer(reply, metrics)

    # E) Budget  -> total + EVERY budget with its predicted balance
    if re.search(r"\bbudget\w*\b", text):
        reply = (
            f"You have {_money(sym, rem)} remaining in your monthly budget.\n"
            f"Total budget: {_money(sym, metrics['monthly_budget'])} | Spent this month: {_money(sym, metrics['spending'])}."
        )
        if budgets:
            reply += "\n\nEach budget (spent / limit → predicted balance):\n" + "\n".join(_budget_line(sym, r) for r in budgets)
        return _answer(reply + no_budget_note, metrics)

    # F) Balance / "how much money do I have"
    if re.search(r"\b(balance|money|cash)\b", text):
        return _answer(f"Your current balance is {_money(sym, bal)} and your remaining budget is {_money(sym, rem)}.{no_budget_note}", metrics)

    # G) On-topic but not specific: short summary
    return _answer(
        f"Your current balance is {_money(sym, bal)}, your remaining monthly budget is {_money(sym, rem)}, "
        f"and you have saved {_money(sym, metrics['total_saved'])}.",
        metrics,
    )
