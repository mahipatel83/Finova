import React, { useState, useEffect } from 'react';
import {
  Home,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  FileText,
  ClipboardList,
  Target,
  BarChart2,
  Grid,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  Bell,
  Search,
  Calendar,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Trash2,
  Edit2,
  CheckCircle,
  Download,
  DollarSign,
  CreditCard,
  Building,
  RefreshCw,
  Clock,
  ShieldCheck,
  Percent,
  Bot,
} from 'lucide-react';
import ChatAssistant from './ChatAssistant';
import BillReminders from './BillReminders';

const NAV_ITEMS = [
  { key: 'Dashboard', icon: Home },
  { key: 'Accounts', icon: Wallet },
  { key: 'Transactions', icon: FileText },
  { key: 'Budgets', icon: ClipboardList },
  { key: 'Bills', icon: FileText },
  { key: 'Savings Goals', icon: Target },
  { key: 'Reports', icon: BarChart2 },
  { key: 'Categories', icon: Grid },
  { key: 'AI Assistant', icon: Bot },
  { key: 'Settings', icon: Settings },
];

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Good Night';
}

function firstNameOf(fullName) {
  if (!fullName) return 'there';
  return fullName.trim().split(' ')[0];
}

export default function Dashboard({ user, setView, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Remember the current page so a browser refresh keeps you on the same tab
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('finova_active_tab');
    return saved && NAV_ITEMS.some((n) => n.key === saved) ? saved : 'Dashboard';
  });
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [currencySymbol, setCurrencySymbol] = useState('₹');

  // Toasts
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Modals state
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [txnForm, setTxnForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    category: 'Food & Dining',
    account_id: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Completed',
    notes: '',
  });

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    account_type: 'bank',
    initial_balance: '',
    color: '#3B82F6',
    account_number: '',
  });

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetForm, setBudgetForm] = useState({
    category_name: 'Food & Dining',
    monthly_limit: '',
  });

  const [showBillModal, setShowBillModal] = useState(false);
  const [billForm, setBillForm] = useState({
    name: '',
    amount: '',
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    category: 'Utilities & Bills',
    frequency: 'monthly',
  });

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({
    name: '',
    target_amount: '',
    saved_amount: '0',
    target_date: '',
    color: '#10B981',
  });

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'expense',
    color: '#64748B',
  });

  // Filters for Transactions Tab
  const [txnFilterType, setTxnFilterType] = useState('all');
  const [txnSearch, setTxnSearch] = useState('');
  const [txnCategoryFilter, setTxnCategoryFilter] = useState('all');

  // Reports state
  const [reportsData, setReportsData] = useState(null);
  const [reportsTimeframe, setReportsTimeframe] = useState('6m');

  // Categories list
  const [categoriesList, setCategoriesList] = useState([]);

  const apiBase = window.location.origin.includes('5173') ? 'http://127.0.0.1:8000' : '';

  const authHeaders = () => {
    const token = localStorage.getItem('finova_token');
    return token ? { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  useEffect(() => {
    fetchDashboardData();
    fetchCategories();
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('finova_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'Reports') {
      fetchReports(reportsTimeframe);
    }
  }, [activeTab, reportsTimeframe]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/api/dashboard/`, {
        headers: { ...authHeaders() },
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await response.json();
      setDashboardData(data);
      if (data.summary?.currency_symbol) {
        setCurrencySymbol(data.summary.currency_symbol);
      }
      if (data.user) {
        localStorage.setItem('finova_user', JSON.stringify(data.user));
        setUser(data.user);
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${apiBase}/api/categories/`, { headers: { ...authHeaders() } });
      if (res.ok) {
        const data = await res.json();
        setCategoriesList(data.categories || []);
      }
    } catch (_) {}
  };

  const fetchReports = async (tf = '6m') => {
    try {
      const res = await fetch(`${apiBase}/api/reports/?timeframe=${tf}`, { headers: { ...authHeaders() } });
      if (res.ok) {
        const data = await res.json();
        setReportsData(data);
      }
    } catch (_) {}
  };

  const handleLogout = async () => {
    try {
      await fetch(`${apiBase}/api/logout/`, { method: 'POST', headers: { ...authHeaders() } });
    } catch (_) {}
    localStorage.removeItem('finova_token');
    localStorage.removeItem('finova_user');
    localStorage.removeItem('finova_active_tab');
    sessionStorage.removeItem('finova_session_active');
    sessionStorage.removeItem('finova_chat_history');
    setUser(null);
    setView('landing');
  };

  // --- CRUD: TRANSACTIONS ---
  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    try {
      const url = editingTxn ? `${apiBase}/api/transactions/${editingTxn.id}/` : `${apiBase}/api/transactions/`;
      const method = editingTxn ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders() },
        body: JSON.stringify(txnForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save transaction');
      }

      showToast(editingTxn ? 'Transaction updated successfully' : 'Transaction added and balance updated!');
      setShowTxnModal(false);
      setEditingTxn(null);
      setTxnForm({
        description: '',
        amount: '',
        type: 'expense',
        category: 'Food & Dining',
        account_id: '',
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        notes: '',
      });
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`${apiBase}/api/transactions/${id}/`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        showToast('Transaction deleted and balances recalculated');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to delete transaction', 'error');
    }
  };

  // --- CRUD: ACCOUNTS ---
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    try {
      const url = editingAccount ? `${apiBase}/api/accounts/${editingAccount.id}/` : `${apiBase}/api/accounts/`;
      const method = editingAccount ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders() },
        body: JSON.stringify(accountForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save account');
      }

      showToast(editingAccount ? 'Account updated' : 'Account created successfully!');
      setShowAccountModal(false);
      setEditingAccount(null);
      setAccountForm({ name: '', account_type: 'bank', initial_balance: '', color: '#3B82F6', account_number: '' });
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Delete this account? Associated transactions will remain unassigned.')) return;
    try {
      const res = await fetch(`${apiBase}/api/accounts/${id}/`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        showToast('Account deleted');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to delete account', 'error');
    }
  };

  // --- CRUD: BUDGETS ---
  const handleSaveBudget = async (e) => {
    e.preventDefault();
    try {
      const url = editingBudget ? `${apiBase}/api/budgets/${editingBudget.id}/` : `${apiBase}/api/budgets/`;
      const method = editingBudget ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders() },
        body: JSON.stringify(budgetForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save budget');
      }

      showToast('Budget saved successfully');
      setShowBudgetModal(false);
      setEditingBudget(null);
      setBudgetForm({ category_name: 'Food & Dining', monthly_limit: '' });
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteBudget = async (id) => {
    if (!window.confirm('Delete this budget?')) return;
    try {
      const res = await fetch(`${apiBase}/api/budgets/${id}/`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (res.ok) {
        showToast('Budget deleted');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to delete budget', 'error');
    }
  };

  // --- CRUD: BILLS ---
  const handleSaveBill = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/bills/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(billForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save bill');
      }
      showToast('Bill scheduled successfully');
      setShowBillModal(false);
      setBillForm({
        name: '',
        amount: '',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        category: 'Utilities & Bills',
        frequency: 'monthly',
      });
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePayBill = async (id) => {
    try {
      const res = await fetch(`${apiBase}/api/bills/${id}/pay/`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Bill paid and transaction recorded!');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to mark bill as paid', 'error');
    }
  };

  const handleDeleteBill = async (id) => {
    if (!window.confirm('Delete this bill?')) return;
    try {
      const res = await fetch(`${apiBase}/api/bills/${id}/`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (res.ok) {
        showToast('Bill removed');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to delete bill', 'error');
    }
  };

  // --- CRUD: SAVINGS GOALS ---
  const handleSaveGoal = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/savings-goals/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(goalForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save savings goal');
      }
      showToast('Savings goal created!');
      setShowGoalModal(false);
      setGoalForm({ name: '', target_amount: '', saved_amount: '0', target_date: '', color: '#10B981' });
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDepositGoal = async (e) => {
    e.preventDefault();
    if (!selectedGoal || !depositAmount) return;
    try {
      const res = await fetch(`${apiBase}/api/savings-goals/${selectedGoal.id}/contribute/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ amount: depositAmount }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add deposit');
      }
      const data = await res.json();
      showToast(data.message || 'Funds contributed to goal!');
      setShowDepositModal(false);
      setSelectedGoal(null);
      setDepositAmount('');
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Delete this savings goal?')) return;
    try {
      const res = await fetch(`${apiBase}/api/savings-goals/${id}/`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (res.ok) {
        showToast('Savings goal deleted');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to delete goal', 'error');
    }
  };

  // --- CRUD: CATEGORIES ---
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/categories/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(categoryForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save category');
      }
      showToast('Category created!');
      setShowCategoryModal(false);
      setCategoryForm({ name: '', type: 'expense', color: '#64748B' });
      fetchCategories();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      const res = await fetch(`${apiBase}/api/categories/${id}/`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (res.ok) {
        showToast('Category removed');
        fetchCategories();
      }
    } catch (err) {
      showToast('Failed to delete category', 'error');
    }
  };

  // --- SETTINGS UPDATE ---
  const handleSaveSettings = async (symbol, name) => {
    try {
      const res = await fetch(`${apiBase}/api/settings/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ currency_symbol: symbol, name }),
      });
      if (res.ok) {
        setCurrencySymbol(symbol);
        showToast('Preferences saved successfully!');
        fetchDashboardData();
      }
    } catch (err) {
      showToast('Failed to save settings', 'error');
    }
  };

  // Export CSV
  const exportTransactionsCSV = () => {
    if (!dashboardData?.recent_transactions?.length) {
      showToast('No transactions to export', 'error');
      return;
    }
    const headers = ['ID', 'Description', 'Amount', 'Type', 'Category', 'Date', 'Status', 'Account'];
    const rows = dashboardData.recent_transactions.map(t => [
      t.id,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount,
      t.type,
      `"${t.category}"`,
      t.date,
      t.status,
      `"${t.account_name}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FinMind_Transactions_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV ledger exported successfully!');
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            border: '4px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ fontWeight: '600', color: 'var(--text-muted)' }}>Loading your financial dashboard...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '20px', padding: '24px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--primary)" />
        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Unable to load Financial Data</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>{error}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={fetchDashboardData}>Try Again</button>
          <button className="btn btn-outline" onClick={handleLogout}>Sign Out</button>
        </div>
      </div>
    );
  }

  const { summary, recent_transactions, budgets, savings_goals, upcoming_bills, accounts, expenses_by_category, chart_data } = dashboardData || {
    summary: { total_balance: '0.00', income: '0.00', expenses: '0.00', savings: '0.00', budget_progress: 0 },
    recent_transactions: [],
    budgets: [],
    savings_goals: [],
    upcoming_bills: [],
    accounts: [],
    expenses_by_category: [],
    chart_data: [],
  };

  const displayUser = dashboardData?.user || user;
  const greeting = getGreeting(now);
  const name = firstNameOf(displayUser?.name);

  // Filtered transactions for Transactions Tab
  const filteredTransactions = (recent_transactions || []).filter(t => {
    if (txnFilterType !== 'all' && t.type !== txnFilterType) return false;
    if (txnCategoryFilter !== 'all' && t.category !== txnCategoryFilter) return false;
    if (txnSearch) {
      const s = txnSearch.toLowerCase();
      return t.description.toLowerCase().includes(s) || t.category.toLowerCase().includes(s) || (t.account_name && t.account_name.toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <div className="dash-layout">
      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <CheckCircle size={18} /> {toast.message}
          </div>
        </div>
      )}

      {/* Tap-outside backdrop for the mobile sidebar */}
      {sidebarOpen && <div className="dash-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar Drawer */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="dash-sidebar-header">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('Dashboard')}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="16" width="4" height="10" rx="2" fill="#10B981" />
              <rect x="11" y="10" width="4" height="16" rx="2" fill="#FF5A5F" />
              <rect x="18" y="4" width="4" height="22" rx="2" fill="#10B981" />
              <circle cx="27" cy="6" r="3" fill="#FF5A5F" />
            </svg>
            <span>Finova</span>
          </div>
          <button className="dash-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={22} />
          </button>
        </div>

        <nav className="dash-sidebar-nav">
          {NAV_ITEMS.map(({ key, icon: Icon }) => (
            <a
              key={key}
              href="#"
              className={`dash-nav-item ${activeTab === key ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(key);
                setSidebarOpen(false);
              }}
            >
              <Icon size={18} /> {key}
            </a>
          ))}
        </nav>

        <div className="sidebar-cta-card">
          <div className="sidebar-cta-icon">
            <Sparkles size={20} />
          </div>
          <p>Instantly record your spending</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              onClick={() => {
                setEditingTxn(null);
                setTxnForm({
                  description: '',
                  amount: '',
                  type: 'expense',
                  category: 'Food & Dining',
                  account_id: accounts?.[0]?.id || '',
                  date: new Date().toISOString().split('T')[0],
                  status: 'Completed',
                  notes: '',
                });
                setShowTxnModal(true);
              }}
            >
              <Plus size={16} /> Quick Add Transaction
            </button>
          </div>
        </div>

        <div className="dash-sidebar-footer">
          <div className="user-profile-widget">
            <div className="user-widget-avatar flex-center">
              {displayUser?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="user-widget-info">
              <h5>{displayUser?.name || 'User'}</h5>
              <p>{displayUser?.email || 'user@example.com'}</p>
            </div>
            <button className="btn-logout" title="Log Out" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="dash-main">
        {/* Header Bar */}
        <header className="dash-header">
          <div className="dash-header-left">
            <button
              className="hamburger-btn"
              style={{ display: 'block', marginRight: '8px' }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 className="dash-greeting-title">{greeting}, {name}! 👋</h2>
              <p className="dash-greeting-sub">Viewing <strong>{activeTab}</strong> • Live Balance Synchronized</p>
            </div>
          </div>

          <div className="dash-header-right">
            <BillReminders
              bills={upcoming_bills}
              currencySymbol={currencySymbol}
              onViewBills={() => setActiveTab('Bills')}
              apiBase={apiBase}
              authHeaders={authHeaders}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditingTxn(null);
                setTxnForm({
                  description: '',
                  amount: '',
                  type: 'expense',
                  category: 'Food & Dining',
                  account_id: accounts?.[0]?.id || '',
                  date: new Date().toISOString().split('T')[0],
                  status: 'Completed',
                  notes: '',
                });
                setShowTxnModal(true);
              }}
            >
              <Plus size={16} /> Add Entry
            </button>
            <div className="dash-header-user">
              <div className="user-widget-avatar flex-center" style={{ width: 36, height: 36 }}>
                {displayUser?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="dash-header-user-info">
                <h5>{displayUser?.name || 'User'}</h5>
                <p>{currencySymbol} Active</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Feature Content Body */}
        <div className="dash-content-body">
          {/* ========================================================== */}
          {/* 1. DASHBOARD OVERVIEW TAB */}
          {/* ========================================================== */}
          {activeTab === 'Dashboard' && (
            <>
              {/* KPI Metrics Cards Grid */}
              <section className="cards-grid">
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('Accounts')}>
                  <div className="stat-header">
                    <span className="stat-title">Total Balance</span>
                    <div className="stat-icon flex-center" style={{ backgroundColor: '#EEF2F6', color: 'var(--text-main)' }}>
                      <Wallet size={20} />
                    </div>
                  </div>
                  <div className="stat-value">{currencySymbol}{Number(summary.total_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <span className="stat-empty-hint">{accounts?.length || 0} Accounts linked</span>
                </div>

                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setActiveTab('Transactions'); setTxnFilterType('income'); }}>
                  <div className="stat-header">
                    <span className="stat-title">Total Income</span>
                    <div className="stat-icon flex-center" style={{ backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                      <ArrowDownRight size={20} />
                    </div>
                  </div>
                  <div className="stat-value" style={{ color: 'var(--secondary)' }}>{currencySymbol}{Number(summary.income).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <span className="stat-empty-hint">Recorded credits</span>
                </div>

                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setActiveTab('Transactions'); setTxnFilterType('expense'); }}>
                  <div className="stat-header">
                    <span className="stat-title">Total Expenses</span>
                    <div className="stat-icon flex-center" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                      <ArrowUpRight size={20} />
                    </div>
                  </div>
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>{currencySymbol}{Number(summary.expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <span className="stat-empty-hint">Recorded debits</span>
                </div>

                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('Savings Goals')}>
                  <div className="stat-header">
                    <span className="stat-title">Total Savings</span>
                    <div className="stat-icon flex-center" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
                      <PiggyBank size={20} />
                    </div>
                  </div>
                  <div className="stat-value">{currencySymbol}{Number(summary.savings).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <span className="stat-empty-hint">{savings_goals?.length || 0} active goals</span>
                </div>
              </section>

              {/* Panel Row: Income vs Expenses & Recent Transactions */}
              <div className="panels-grid">
                {/* Income vs Expenses Cashflow */}
                <div className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Monthly Cashflow Overview</h3>
                    <button className="btn btn-outline btn-sm" onClick={() => setActiveTab('Reports')}>
                      Full Analytics
                    </button>
                  </div>
                  {chart_data && chart_data.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#10B981' }} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Income</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FF5A5F' }} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Expense</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chart_data.length}, 1fr)`, gap: '12px', alignItems: 'flex-end', height: '180px', paddingTop: '20px' }}>
                        {chart_data.map((item, idx) => {
                          const maxVal = Math.max(...chart_data.map(d => Math.max(d.income, d.expense)), 1000);
                          const incH = Math.max(10, Math.min(100, (item.income / maxVal) * 100));
                          const expH = Math.max(10, Math.min(100, (item.expense / maxVal) * 100));
                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '130px', width: '100%', justifyContent: 'center' }}>
                                <div
                                  title={`Income: ${currencySymbol}${item.income}`}
                                  style={{ width: '16px', height: `${incH}%`, backgroundColor: '#10B981', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }}
                                />
                                <div
                                  title={`Expense: ${currencySymbol}${item.expense}`}
                                  style={{ width: '16px', height: `${expH}%`, backgroundColor: '#FF5A5F', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }}
                                />
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>{item.month}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="panel-empty-state">
                      <div className="panel-empty-icon"><BarChart2 size={26} /></div>
                      <div className="panel-empty-title">No cashflow data yet</div>
                      <div className="panel-empty-desc">Add transactions to visualize your income and expense charts.</div>
                    </div>
                  )}
                </div>

                {/* Recent Transactions Snapshot */}
                <div className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Recent Transactions</h3>
                    <button className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setActiveTab('Transactions')}>
                      View All
                    </button>
                  </div>
                  {recent_transactions && recent_transactions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {recent_transactions.slice(0, 5).map((txn) => (
                        <div
                          key={txn.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            backgroundColor: 'var(--bg-main)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                backgroundColor: txn.type === 'income' ? 'var(--secondary-light)' : 'var(--primary-light)',
                                color: txn.type === 'income' ? 'var(--secondary)' : 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {txn.type === 'income' ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                            </div>
                            <div>
                              <h5 style={{ fontSize: '0.9rem', fontWeight: '600' }}>{txn.description}</h5>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{txn.date} • {txn.category}</p>
                            </div>
                          </div>
                          <span style={{ fontWeight: '700', color: txn.type === 'income' ? 'var(--secondary)' : 'var(--text-main)', fontSize: '0.95rem' }}>
                            {txn.type === 'income' ? '+' : '-'}{currencySymbol}{Number(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty-state">
                      <div className="panel-empty-icon"><FileText size={26} /></div>
                      <div className="panel-empty-title">No transactions yet</div>
                      <div className="panel-empty-desc">Add your first transaction to start updating your balance.</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={() => setShowTxnModal(true)}>
                        <Plus size={14} /> Add Transaction
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Row: Category breakdown + Budgets & Bills */}
              <div className="dash-row-3">
                {/* Category Expenses Breakdown */}
                <div className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Expense Breakdown</h3>
                  </div>
                  {expenses_by_category && expenses_by_category.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {expenses_by_category.slice(0, 5).map((cat, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: '600' }}>{cat.category}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{currencySymbol}{cat.amount} ({cat.percent}%)</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty-state">
                      <div className="donut-placeholder" />
                      <div className="panel-empty-title">No expenses yet</div>
                      <div className="panel-empty-desc">Track spending to see category distributions.</div>
                    </div>
                  )}
                </div>

                {/* Budgets Tracker */}
                <div className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Budgets Progress</h3>
                    <button className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setActiveTab('Budgets')}>
                      Manage
                    </button>
                  </div>
                  {budgets && budgets.length > 0 ? (
                    <div className="budget-panel-item">
                      {budgets.slice(0, 3).map((b, i) => (
                        <div className="budget-category-row" key={i}>
                          <div className="category-info">
                            <span>{b.label}</span>
                            <span style={{ fontWeight: '600' }}>{currencySymbol}{b.spent} / {currencySymbol}{b.limit}</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${b.percent}%`, backgroundColor: b.is_over ? '#EF4444' : b.percent > 80 ? '#F59E0B' : '#10B981' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty-state">
                      <div className="panel-empty-icon"><ClipboardList size={22} /></div>
                      <div className="panel-empty-title">No budgets set</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: '8px' }} onClick={() => setShowBudgetModal(true)}>
                        <Plus size={14} /> Set Budget
                      </button>
                    </div>
                  )}
                </div>

                {/* Upcoming Bills */}
                <div className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Upcoming Bills</h3>
                    <button className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setActiveTab('Bills')}>
                      View All
                    </button>
                  </div>
                  {upcoming_bills && upcoming_bills.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {upcoming_bills.slice(0, 3).map((bill) => (
                        <div key={bill.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                          <div>
                            <h5 style={{ fontSize: '0.85rem', fontWeight: '600' }}>{bill.name}</h5>
                            <span style={{ fontSize: '0.75rem', color: bill.status === 'Paid' ? '#10B981' : '#EF4444' }}>
                              Due: {bill.due_date} • {bill.status}
                            </span>
                          </div>
                          <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{currencySymbol}{bill.amount}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty-state">
                      <div className="panel-empty-icon"><FileText size={22} /></div>
                      <div className="panel-empty-title">No upcoming bills</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: '8px' }} onClick={() => setShowBillModal(true)}>
                        <Plus size={14} /> Add Bill
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ========================================================== */}
          {/* 2. ACCOUNTS & BALANCE STORE TAB */}
          {/* ========================================================== */}
          {activeTab === 'Accounts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Financial Accounts & Balance Store</h2>
                  <p>All user financial accounts, cash wallets, bank ledgers, and calculated balances.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-primary" onClick={() => { setEditingAccount(null); setAccountForm({ name: '', account_type: 'bank', initial_balance: '', color: '#3B82F6', account_number: '' }); setShowAccountModal(true); }}>
                    <Plus size={16} /> Add New Account
                  </button>
                </div>
              </div>

              {/* Account Cards Grid */}
              <div className="cards-grid">
                {accounts && accounts.map((acc) => (
                  <div className="account-card" key={acc.id}>
                    <div className="account-card-accent" style={{ backgroundColor: acc.color }} />
                    <div className="account-card-header">
                      <div>
                        <span className="badge-tag" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>
                          {acc.account_type.toUpperCase()}
                        </span>
                        <h3 style={{ fontSize: '1.15rem', marginTop: '6px' }}>{acc.name}</h3>
                        {acc.account_number && <p style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>•••• {acc.account_number.slice(-4)}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="btn-icon"
                          title="Edit Account"
                          onClick={() => {
                            setEditingAccount(acc);
                            setAccountForm({
                              name: acc.name,
                              account_type: acc.account_type,
                              initial_balance: acc.initial_balance,
                              color: acc.color,
                              account_number: acc.account_number,
                            });
                            setShowAccountModal(true);
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-icon btn-icon-danger" title="Delete Account" onClick={() => handleDeleteAccount(acc.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Balance</span>
                      <div className="account-card-balance" style={{ color: Number(acc.current_balance) < 0 ? 'var(--primary)' : 'var(--text-main)' }}>
                        {currencySymbol}{Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Initial: {currencySymbol}{acc.initial_balance} • {acc.transactions_count} records</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Account Balances Summary Table */}
              <div className="dashboard-panel">
                <div className="panel-header">
                  <h3 className="panel-title">Account Balance Records Ledger</h3>
                  <button className="btn btn-outline btn-sm" onClick={fetchDashboardData}>
                    <RefreshCw size={14} /> Refresh Balances
                  </button>
                </div>
                <div className="table-responsive-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th>Type</th>
                        <th>Account No.</th>
                        <th>Starting Balance</th>
                        <th>Transactions</th>
                        <th>Live Calculated Balance</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts && accounts.map((acc) => (
                        <tr key={acc.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: acc.color }} />
                              <strong>{acc.name}</strong>
                            </div>
                          </td>
                          <td><span className="badge-tag" style={{ backgroundColor: '#F1F5F9' }}>{acc.account_type}</span></td>
                          <td>{acc.account_number || '—'}</td>
                          <td>{currencySymbol}{acc.initial_balance}</td>
                          <td>{acc.transactions_count} entries</td>
                          <td style={{ fontWeight: '700', fontSize: '1rem', color: Number(acc.current_balance) >= 0 ? 'var(--secondary)' : 'var(--primary)' }}>
                            {currencySymbol}{Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn-icon"
                                onClick={() => {
                                  setEditingAccount(acc);
                                  setAccountForm({
                                    name: acc.name,
                                    account_type: acc.account_type,
                                    initial_balance: acc.initial_balance,
                                    color: acc.color,
                                    account_number: acc.account_number,
                                  });
                                  setShowAccountModal(true);
                                }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteAccount(acc.id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 3. TRANSACTIONS & RECORD LEDGER TAB */}
          {/* ========================================================== */}
          {activeTab === 'Transactions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Transactions & Balance Ledger</h2>
                  <p>Comprehensive transaction history where every entry dynamically updates your balance.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-outline" onClick={exportTransactionsCSV}>
                    <Download size={16} /> Export CSV
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setEditingTxn(null);
                      setTxnForm({
                        description: '',
                        amount: '',
                        type: 'expense',
                        category: 'Food & Dining',
                        account_id: accounts?.[0]?.id || '',
                        date: new Date().toISOString().split('T')[0],
                        status: 'Completed',
                        notes: '',
                      });
                      setShowTxnModal(true);
                    }}
                  >
                    <Plus size={16} /> Record Transaction
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="filter-bar">
                <div className="search-input-wrap">
                  <Search size={16} color="var(--text-light)" />
                  <input
                    type="text"
                    placeholder="Search by description, category, or account..."
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '8px 12px' }}
                    value={txnFilterType}
                    onChange={(e) => setTxnFilterType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="income">Income (+)</option>
                    <option value="expense">Expense (-)</option>
                  </select>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '8px 12px' }}
                    value={txnCategoryFilter}
                    onChange={(e) => setTxnCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Main Ledger Table */}
              <div className="dashboard-panel" style={{ padding: '0px' }}>
                <div className="table-responsive-container" style={{ border: 'none' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Account</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions && filteredTransactions.length > 0 ? (
                        filteredTransactions.map((txn) => (
                          <tr key={txn.id}>
                            <td>
                              <strong>{txn.description}</strong>
                              {txn.notes && <p style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{txn.notes}</p>}
                            </td>
                            <td>
                              <span style={{ fontSize: '0.8rem', backgroundColor: '#F1F5F9', padding: '4px 8px', borderRadius: '6px', fontWeight: '500' }}>
                                {txn.category}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {txn.account_name || 'General'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <Calendar size={13} /> {txn.date}
                              </div>
                            </td>
                            <td className={`txn-amount ${txn.type}`}>
                              {txn.type === 'income' ? '+' : '-'}{currencySymbol}{Number(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span className={`status-badge ${txn.status.toLowerCase()}`}>{txn.status}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="btn-icon"
                                  onClick={() => {
                                    setEditingTxn(txn);
                                    setTxnForm({
                                      description: txn.description,
                                      amount: txn.amount,
                                      type: txn.type,
                                      category: txn.category,
                                      account_id: txn.account_id || '',
                                      date: txn.date,
                                      status: txn.status,
                                      notes: txn.notes || '',
                                    });
                                    setShowTxnModal(true);
                                  }}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteTransaction(txn.id)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                            <FileText size={32} color="var(--text-light)" style={{ margin: '0 auto 8px' }} />
                            <p style={{ fontWeight: '600' }}>No transactions found matching your criteria</p>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ marginTop: '12px' }}
                              onClick={() => {
                                setEditingTxn(null);
                                setShowTxnModal(true);
                              }}
                            >
                              <Plus size={14} /> Add Transaction
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 4. BUDGETS TAB */}
          {/* ========================================================== */}
          {activeTab === 'Budgets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Monthly Budgets & Limits</h2>
                  <p>Set spending thresholds per category and track your live expenses.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-primary" onClick={() => { setEditingBudget(null); setBudgetForm({ category_name: 'Food & Dining', monthly_limit: '' }); setShowBudgetModal(true); }}>
                    <Plus size={16} /> Set Category Budget
                  </button>
                </div>
              </div>

              <div className="cards-grid">
                {budgets && budgets.length > 0 ? (
                  budgets.map((b) => (
                    <div className="budget-card" key={b.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: '1.15rem' }}>{b.category_name || b.label}</h3>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monthly Allocation</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn-icon"
                            onClick={() => {
                              setEditingBudget(b);
                              setBudgetForm({ category_name: b.category_name || b.label, monthly_limit: b.monthly_limit || b.limit });
                              setShowBudgetModal(true);
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteBudget(b.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: '800', fontFamily: 'var(--font-title)' }}>
                          {currencySymbol}{Number(b.spent).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          of {currencySymbol}{Number(b.monthly_limit || b.limit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(100, b.percent)}%`,
                            backgroundColor: b.is_over || b.percent > 100 ? '#EF4444' : b.percent > 80 ? '#F59E0B' : '#10B981',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '500' }}>
                        <span style={{ color: b.is_over ? '#EF4444' : 'var(--text-muted)' }}>
                          {b.is_over ? 'Budget Exceeded!' : `${currencySymbol}${b.remaining} left`}
                        </span>
                        <span style={{ fontWeight: '700' }}>{b.percent}%</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="panel-empty-icon"><ClipboardList size={32} /></div>
                    <div className="panel-empty-title">No category budgets defined</div>
                    <div className="panel-empty-desc">Create budget limits for Food, Shopping, Rent, etc. to prevent overspending.</div>
                    <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setShowBudgetModal(true)}>
                      <Plus size={16} /> Create First Budget
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 5. BILLS & RECURRING REMINDERS TAB */}
          {/* ========================================================== */}
          {activeTab === 'Bills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Bills & Subscriptions Tracker</h2>
                  <p>Never miss a utility, broadband, rent, or recurring payment deadline.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-primary" onClick={() => setShowBillModal(true)}>
                    <Plus size={16} /> Schedule Bill
                  </button>
                </div>
              </div>

              <div className="cards-grid">
                {upcoming_bills && upcoming_bills.length > 0 ? (
                  upcoming_bills.map((bill) => (
                    <div className="stat-card" key={bill.id}>
                      <div className="stat-header">
                        <div>
                          <span className="badge-tag" style={{ backgroundColor: bill.status === 'Paid' ? 'var(--secondary-light)' : '#FEE2E2', color: bill.status === 'Paid' ? 'var(--secondary)' : '#EF4444' }}>
                            {bill.status}
                          </span>
                          <h3 style={{ fontSize: '1.15rem', marginTop: '6px' }}>{bill.name}</h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bill.category} • {bill.frequency}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteBill(bill.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="stat-value" style={{ margin: '8px 0' }}>
                        {currencySymbol}{Number(bill.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} /> Due: {bill.due_date}
                        </span>
                        {bill.status !== 'Paid' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handlePayBill(bill.id)}>
                            <CheckCircle size={14} /> Mark as Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="panel-empty-icon"><FileText size={32} /></div>
                    <div className="panel-empty-title">No upcoming bills</div>
                    <div className="panel-empty-desc">Add electricity, wifi, rent or credit card bills to track due dates.</div>
                    <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setShowBillModal(true)}>
                      <Plus size={16} /> Add First Bill
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 6. SAVINGS GOALS TAB */}
          {/* ========================================================== */}
          {activeTab === 'Savings Goals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Savings Goals & Target Tracker</h2>
                  <p>Set targets for emergency funds, vacations, gadgets, or vehicles and contribute anytime.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-primary" onClick={() => setShowGoalModal(true)}>
                    <Plus size={16} /> Create Goal
                  </button>
                </div>
              </div>

              <div className="cards-grid">
                {savings_goals && savings_goals.length > 0 ? (
                  savings_goals.map((g) => (
                    <div className="goal-card" key={g.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span className="badge-tag" style={{ backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                            {g.percent}% COMPLETED
                          </span>
                          <h3 style={{ fontSize: '1.2rem', marginTop: '6px' }}>{g.name}</h3>
                        </div>
                        <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteGoal(g.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '1.6rem', fontWeight: '800', fontFamily: 'var(--font-title)', color: 'var(--secondary)' }}>
                          {currencySymbol}{Number(g.saved || g.saved_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Target: {currencySymbol}{Number(g.target || g.target_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${Math.min(100, g.percent)}%`, backgroundColor: g.color || '#10B981' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {g.target_date ? `Target: ${g.target_date}` : 'Ongoing goal'}
                        </span>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}
                          onClick={() => {
                            setSelectedGoal(g);
                            setDepositAmount('');
                            setShowDepositModal(true);
                          }}
                        >
                          <Plus size={13} /> Deposit Funds
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="panel-empty-icon"><Target size={32} /></div>
                    <div className="panel-empty-title">No savings goals created</div>
                    <div className="panel-empty-desc">Create your dream savings goal and watch your wealth grow.</div>
                    <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setShowGoalModal(true)}>
                      <Plus size={16} /> Set First Goal
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 7. REPORTS & ANALYTICS TAB */}
          {/* ========================================================== */}
          {activeTab === 'Reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Financial Health & Net Analytics</h2>
                  <p>Comprehensive cashflow breakdown, net savings rate, and category distribution.</p>
                </div>
                <div className="tab-actions">
                  {['1m', '3m', '6m', '1y', 'all'].map((tf) => (
                    <button
                      key={tf}
                      className={`btn btn-sm ${reportsTimeframe === tf ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setReportsTimeframe(tf)}
                    >
                      {tf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reports Summary KPI */}
              <div className="cards-grid">
                <div className="stat-card">
                  <span className="stat-title">Period Income</span>
                  <div className="stat-value" style={{ color: 'var(--secondary)' }}>
                    {currencySymbol}{reportsData?.summary?.income || summary.income}
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Period Expenses</span>
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>
                    {currencySymbol}{reportsData?.summary?.expenses || summary.expenses}
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Net Savings</span>
                  <div className="stat-value">
                    {currencySymbol}{reportsData?.summary?.net_savings || (Number(summary.income) - Number(summary.expenses)).toFixed(2)}
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Savings Rate</span>
                  <div className="stat-value" style={{ color: '#3B82F6' }}>
                    {reportsData?.summary?.savings_rate ?? 0}%
                  </div>
                </div>
              </div>

              {/* Account Balances Sheet */}
              <div className="dashboard-panel">
                <div className="panel-header">
                  <h3 className="panel-title">Current Asset & Account Balances Sheet</h3>
                </div>
                <div className="table-responsive-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th>Account Type</th>
                        <th>Initial Capital</th>
                        <th>Current Stored Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts && accounts.map((acc) => (
                        <tr key={acc.id}>
                          <td><strong>{acc.name}</strong></td>
                          <td><span className="badge-tag" style={{ backgroundColor: '#F1F5F9' }}>{acc.account_type}</span></td>
                          <td>{currencySymbol}{acc.initial_balance}</td>
                          <td style={{ fontWeight: '700', color: Number(acc.current_balance) >= 0 ? 'var(--secondary)' : 'var(--primary)' }}>
                            {currencySymbol}{Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 8. CATEGORIES TAB */}
          {/* ========================================================== */}
          {activeTab === 'Categories' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="tab-toolbar">
                <div className="tab-title-group">
                  <h2>Categories Management</h2>
                  <p>Organize your income and expense categories for better financial budgeting.</p>
                </div>
                <div className="tab-actions">
                  <button className="btn btn-primary" onClick={() => setShowCategoryModal(true)}>
                    <Plus size={16} /> Add Category
                  </button>
                </div>
              </div>

              <div className="cards-grid">
                {categoriesList && categoriesList.map((c) => (
                  <div className="stat-card" key={c.id} style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: c.color }} />
                        <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>{c.name}</h4>
                      </div>
                      <button className="btn-icon btn-icon-danger" onClick={() => handleDeleteCategory(c.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge-tag" style={{ backgroundColor: c.type === 'income' ? 'var(--secondary-light)' : 'var(--primary-light)', color: c.type === 'income' ? 'var(--secondary)' : 'var(--primary)' }}>
                        {c.type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* AI ASSISTANT TAB */}
          {/* ========================================================== */}
          {activeTab === 'AI Assistant' && (
            <ChatAssistant apiBase={apiBase} authHeaders={authHeaders} onUnauthorized={handleLogout} />
          )}

          {/* ========================================================== */}
          {/* 10. SETTINGS TAB */}
          {/* ========================================================== */}
          {activeTab === 'Settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '700px' }}>
              <div className="tab-title-group">
                <h2>User Preferences & Settings</h2>
                <p>Customize your currency, display name, and system preferences.</p>
              </div>

              <div className="dashboard-panel">
                <h3 className="panel-title" style={{ marginBottom: '16px' }}>Currency & Units</h3>
                <div className="form-group">
                  <label className="form-label">Default Currency Symbol</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {['₹', '$', '€', '£', '¥', 'AED'].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        className={`btn ${currencySymbol === sym ? 'btn-primary' : 'btn-outline'}`}
                        style={{ minWidth: '60px' }}
                        onClick={() => handleSaveSettings(sym, displayUser?.name)}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-panel">
                <h3 className="panel-title" style={{ marginBottom: '16px' }}>Account Information</h3>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    defaultValue={displayUser?.name || ''}
                    onBlur={(e) => handleSaveSettings(currencySymbol, e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Registered Email</label>
                  <input type="text" className="form-input" disabled value={displayUser?.email || ''} style={{ backgroundColor: 'var(--bg-main)' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================== */}
      {/* MODAL 1: ADD / EDIT TRANSACTION */}
      {/* ========================================================== */}
      {showTxnModal && (
        <div className="modal-backdrop" onClick={() => setShowTxnModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTxn ? 'Edit Transaction' : 'Record Transaction'}</h3>
              <button className="modal-close-btn" onClick={() => setShowTxnModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveTransaction}>
              <div className="modal-body">
                <div className="type-toggle">
                  <button
                    type="button"
                    className={`type-toggle-btn ${txnForm.type === 'expense' ? 'active-expense' : ''}`}
                    onClick={() => {
                      const newCat = txnForm.type === 'income' ? 'Food & Dining' : txnForm.category;
                      setTxnForm({ ...txnForm, type: 'expense', category: newCat });
                    }}
                  >
                    <ArrowUpRight size={16} /> Expense
                  </button>
                  <button
                    type="button"
                    className={`type-toggle-btn ${txnForm.type === 'income' ? 'active-income' : ''}`}
                    onClick={() => {
                      const newCat = txnForm.type === 'expense' ? 'Salary' : txnForm.category;
                      setTxnForm({ ...txnForm, type: 'income', category: newCat });
                    }}
                  >
                    <ArrowDownRight size={16} /> Income
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={txnForm.type === 'income' ? "e.g. Monthly Salary, Freelance Client, Investment Return" : "e.g. Supermarket Groceries, Dining Out, Fuel"}
                    required
                    value={txnForm.description}
                    onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Amount ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      required
                      value={txnForm.amount}
                      onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={txnForm.date}
                      onChange={(e) => setTxnForm({ ...txnForm, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={txnForm.category}
                      onChange={(e) => setTxnForm({ ...txnForm, category: e.target.value })}
                    >
                      {categoriesList.filter(c => c.type === txnForm.type).length > 0 ? (
                        categoriesList.filter(c => c.type === txnForm.type).map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                      ) : txnForm.type === 'income' ? (
                        <>
                          <option value="Salary">Salary</option>
                          <option value="Freelance">Freelance</option>
                          <option value="Investments">Investments</option>
                          <option value="Other Income">Other Income</option>
                        </>
                      ) : (
                        <>
                          <option value="Food & Dining">Food & Dining</option>
                          <option value="Groceries">Groceries</option>
                          <option value="Shopping">Shopping</option>
                          <option value="Housing & Rent">Housing & Rent</option>
                          <option value="Transportation">Transportation</option>
                          <option value="Utilities & Bills">Utilities & Bills</option>
                          <option value="Healthcare">Healthcare</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Account (Credit / Debit To)</label>
                    <select
                      className="form-select"
                      value={txnForm.account_id}
                      onChange={(e) => setTxnForm({ ...txnForm, account_id: e.target.value })}
                    >
                      <option value="">Auto (Default Account)</option>
                      {accounts && accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({currencySymbol}{a.current_balance})</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Additional details..."
                    value={txnForm.notes}
                    onChange={(e) => setTxnForm({ ...txnForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowTxnModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingTxn ? 'Save Changes' : 'Record Transaction'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: ADD / EDIT ACCOUNT */}
      {/* ========================================================== */}
      {showAccountModal && (
        <div className="modal-backdrop" onClick={() => setShowAccountModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingAccount ? 'Edit Financial Account' : 'Add Financial Account'}</h3>
              <button className="modal-close-btn" onClick={() => setShowAccountModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveAccount}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Account Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. HDFC Bank, ICICI Salary, Cash Wallet, Amex Card"
                    required
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Account Type</label>
                    <select
                      className="form-select"
                      value={accountForm.account_type}
                      onChange={(e) => setAccountForm({ ...accountForm, account_type: e.target.value })}
                    >
                      <option value="bank">Bank Account</option>
                      <option value="cash">Cash Wallet</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="savings">Savings Account</option>
                      <option value="investment">Investment Account</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Starting Balance ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={accountForm.initial_balance}
                      onChange={(e) => setAccountForm({ ...accountForm, initial_balance: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Card/Account Number (Last 4 digits)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 4321"
                      value={accountForm.account_number}
                      onChange={(e) => setAccountForm({ ...accountForm, account_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Accent Color</label>
                    <input
                      type="color"
                      className="form-input"
                      style={{ height: '42px', padding: '4px' }}
                      value={accountForm.color}
                      onChange={(e) => setAccountForm({ ...accountForm, color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAccountModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingAccount ? 'Update Account' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: ADD / EDIT BUDGET */}
      {/* ========================================================== */}
      {showBudgetModal && (
        <div className="modal-backdrop" onClick={() => setShowBudgetModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingBudget ? 'Edit Monthly Budget' : 'Set Category Budget'}</h3>
              <button className="modal-close-btn" onClick={() => setShowBudgetModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveBudget}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-select"
                    value={budgetForm.category_name}
                    onChange={(e) => setBudgetForm({ ...budgetForm, category_name: e.target.value })}
                  >
                    {categoriesList.length > 0 ? (
                      categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                    ) : (
                      <>
                        <option value="Food & Dining">Food & Dining</option>
                        <option value="Groceries">Groceries</option>
                        <option value="Shopping">Shopping</option>
                        <option value="Transportation">Transportation</option>
                        <option value="Housing & Rent">Housing & Rent</option>
                        <option value="Utilities & Bills">Utilities & Bills</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Monthly Limit ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="e.g. 5000"
                    required
                    value={budgetForm.monthly_limit}
                    onChange={(e) => setBudgetForm({ ...budgetForm, monthly_limit: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowBudgetModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Budget</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 4: ADD BILL */}
      {/* ========================================================== */}
      {showBillModal && (
        <div className="modal-backdrop" onClick={() => setShowBillModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Upcoming Bill</h3>
              <button className="modal-close-btn" onClick={() => setShowBillModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveBill}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Bill / Subscription Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Broadband, House Rent, Netflix 4K"
                    required
                    value={billForm.name}
                    onChange={(e) => setBillForm({ ...billForm, name: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Amount ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      required
                      value={billForm.amount}
                      onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Due Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={billForm.due_date}
                      onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={billForm.category}
                      onChange={(e) => setBillForm({ ...billForm, category: e.target.value })}
                    >
                      <option value="Utilities & Bills">Utilities & Bills</option>
                      <option value="Housing & Rent">Housing & Rent</option>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Education">Education</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Frequency</label>
                    <select
                      className="form-select"
                      value={billForm.frequency}
                      onChange={(e) => setBillForm({ ...billForm, frequency: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="one_time">One Time</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowBillModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Schedule Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 5: ADD SAVINGS GOAL */}
      {/* ========================================================== */}
      {showGoalModal && (
        <div className="modal-backdrop" onClick={() => setShowGoalModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Savings Goal</h3>
              <button className="modal-close-btn" onClick={() => setShowGoalModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveGoal}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Goal Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Emergency Fund, New Laptop, Goa Trip"
                    required
                    value={goalForm.name}
                    onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Target Amount ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="50000"
                      required
                      value={goalForm.target_amount}
                      onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Initial Saved Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={goalForm.saved_amount}
                      onChange={(e) => setGoalForm({ ...goalForm, saved_amount: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Target Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={goalForm.target_date}
                      onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color Tag</label>
                    <input
                      type="color"
                      className="form-input"
                      style={{ height: '42px', padding: '4px' }}
                      value={goalForm.color}
                      onChange={(e) => setGoalForm({ ...goalForm, color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowGoalModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Goal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 6: DEPOSIT TO SAVINGS GOAL */}
      {/* ========================================================== */}
      {showDepositModal && selectedGoal && (
        <div className="modal-backdrop" onClick={() => setShowDepositModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contribute to "{selectedGoal.name}"</h3>
              <button className="modal-close-btn" onClick={() => setShowDepositModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleDepositGoal}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Currently saved: <strong>{currencySymbol}{selectedGoal.saved || selectedGoal.saved_amount}</strong> of {currencySymbol}{selectedGoal.target || selectedGoal.target_amount}
                </p>
                <div className="form-group">
                  <label className="form-label">Deposit Amount ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="e.g. 5000"
                    required
                    autoFocus
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowDepositModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Deposit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 7: ADD CATEGORY */}
      {/* ========================================================== */}
      {showCategoryModal && (
        <div className="modal-backdrop" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Custom Category</h3>
              <button className="modal-close-btn" onClick={() => setShowCategoryModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveCategory}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Category Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Pet Care, Gadgets, Crypto"
                    required
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={categoryForm.type}
                      onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color</label>
                    <input
                      type="color"
                      className="form-input"
                      style={{ height: '42px', padding: '4px' }}
                      value={categoryForm.color}
                      onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Category</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
