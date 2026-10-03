from django.urls import path
from . import views

urlpatterns = [
    # Auth routes
    path("register/", views.api_register, name="api_register"),
    path("login/", views.api_login, name="api_login"),
    path("logout/", views.api_logout, name="api_logout"),
    path("me/", views.api_me, name="api_me"),

    # Main Dashboard
    path("dashboard/", views.api_dashboard, name="api_dashboard"),

    # Accounts CRUD & Balance Management
    path("accounts/", views.api_accounts, name="api_accounts"),
    path("accounts/<int:account_id>/", views.api_accounts, name="api_account_detail"),

    # Transactions CRUD & Calculations
    path("transactions/", views.api_transactions, name="api_transactions"),
    path("transactions/<int:transaction_id>/", views.api_transactions, name="api_transaction_detail"),

    # Budgets CRUD
    path("budgets/", views.api_budgets, name="api_budgets"),
    path("budgets/<int:budget_id>/", views.api_budgets, name="api_budget_detail"),

    # Bills & Subscriptions
    path("bills/", views.api_bills, name="api_bills"),
    path("bills/<int:bill_id>/", views.api_bills, name="api_bill_detail"),
    path("bills/<int:bill_id>/pay/", views.api_bill_pay, name="api_bill_pay"),

    # Savings Goals
    path("savings-goals/", views.api_savings_goals, name="api_savings_goals"),
    path("savings-goals/<int:goal_id>/", views.api_savings_goals, name="api_savings_goal_detail"),
    path("savings-goals/<int:goal_id>/contribute/", views.api_savings_goal_contribute, name="api_savings_goal_contribute"),

    # Categories
    path("categories/", views.api_categories, name="api_categories"),
    path("categories/<int:category_id>/", views.api_categories, name="api_category_detail"),


    # Reports & Analytics
    path("reports/", views.api_reports, name="api_reports"),

    # AI Chat Assistant (Scikit-Learn ML Powered)
    path("ai-chat/", views.api_ai_chat, name="api_ai_chat"),

    # Push notifications
    path("push/public-key/", views.api_push_public_key, name="api_push_public_key"),
    path("push/subscribe/", views.api_push_subscribe, name="api_push_subscribe"),
    path("push/test/", views.api_push_test, name="api_push_test"),

    # Settings
    path("settings/", views.api_user_settings, name="api_user_settings"),
]
