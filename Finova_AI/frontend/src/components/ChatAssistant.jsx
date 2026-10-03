import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Wallet, ShieldCheck, ChevronRight, User, TrendingUp } from 'lucide-react';
import './ChatAssistant.css';

const QUICK_QUESTIONS = [
  'What is my current balance?',
  'Predict my expenses this month',
  'Predicted balance of each budget',
  'Will I exceed any budget?',
  'Give me recommendations',
  'How much of my budget is left?',
  'Can I spend ₹2,000?',
  'Can I afford a ₹5,000 hotel?',
  'How much have I saved?',
];

const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Chat history lives in sessionStorage: it survives switching tabs/pages and refreshes
// while the app is open, but a brand-new visit (tab closed and app opened again) or a
// logout starts a fresh conversation.
const CHAT_KEY = 'finova_chat_history';

function loadSavedChat() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
    const owner = localStorage.getItem('finova_token');
    if (saved && saved.owner === owner && Array.isArray(saved.messages) && saved.messages.length) {
      return saved.messages;
    }
  } catch (_) { /* ignore corrupt data */ }
  return [];
}

export default function ChatAssistant({ apiBase, authHeaders, onUnauthorized }) {
  const [messages, setMessages] = useState(loadSavedChat);
  const [metrics, setMetrics] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);

  // Keep the conversation saved for the rest of this session
  useEffect(() => {
    if (!messages.length) return;
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify({
        owner: localStorage.getItem('finova_token'),
        messages,
      }));
    } catch (_) { /* storage full / unavailable */ }
  }, [messages]);

  // Load the logged-in user's summary (+ greeting only when there is no saved chat)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let name = 'there';
      try {
        const res = await fetch(`${apiBase}/api/ai-chat/`, { headers: { ...authHeaders() } });
        if (res.status === 401) return onUnauthorized();
        const data = await res.json();
        if (cancelled) return;
        setMetrics(data.metrics || null);
        name = data.user_name || name;
      } catch (_) {
        /* greeting still shows */
      }
      if (!cancelled) {
        setMessages((current) => current.length ? current : [{
          role: 'bot',
          time: timeNow(),
          text: `Hi ${name}! 👋\nI can help you with your balance, budgets, spending and savings, predict your expenses and budget balances, and give recommendations. What would you like to know?`,
        }]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, []);

  // Scroll ONLY the chat box (not the whole page) to the newest message
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question, time: timeNow() }]);
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/ai-chat/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ message: question }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setMessages((m) => [...m, { role: 'bot', text: data.reply, time: timeNow() }]);
      if (data.metrics) setMetrics(data.metrics);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', error: true, text: 'Sorry, I could not reach the server. Please try again.', time: timeNow() }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fchat-layout">
      {/* ---------- Chat ---------- */}
      <section className="fchat-card">
        <header className="fchat-header">
          <div className="fchat-avatar"><Bot size={22} /></div>
          <div>
            <h3>Finova Assistant</h3>
            <p>Your personal balance assistant</p>
          </div>
          <span className="fchat-pill"><i /> Using your data only</span>
        </header>

        <div className="fchat-messages" ref={messagesRef}>
          {messages.map((m, i) => (
            <div key={i} className={`fchat-row ${m.role}`}>
              <div className={`fchat-avatar small ${m.role}`}>
                {m.role === 'bot' ? <Bot size={18} /> : <User size={18} />}
              </div>
              <div>
                <div className={`fchat-bubble ${m.role}${m.error ? ' error' : ''}`}>{m.text}</div>
                <span className="fchat-time">{m.time}</span>
              </div>
            </div>
          ))}
          {sending && (
            <div className="fchat-row bot">
              <div className="fchat-avatar small bot"><Bot size={18} /></div>
              <div className="fchat-bubble bot fchat-typing"><span /><span /><span /></div>
            </div>
          )}
        </div>

        <div className="fchat-inputbar">
          <input
            value={input}
            maxLength={300}
            placeholder="Ask about your balance, budgets or predictions..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          />
          <button type="button" onClick={() => send()} disabled={sending || !input.trim()} aria-label="Send">
            <Send size={18} />
          </button>
        </div>
      </section>

      {/* ---------- Side panel ---------- */}
      <aside className="fchat-side">
        <div className="fchat-balance">
          <div className="fchat-balance-top">
            <div>
              <h4>Your Current Balance</h4>
              <strong>{metrics?.balance ?? '—'}</strong>
              <span>Available balance</span>
            </div>
            <Wallet size={34} />
          </div>
          <div className="fchat-stats">
            <div><b>{metrics?.monthly_budget_left ?? '—'}</b><span>Monthly budget left</span></div>
            <div><b>{metrics?.predicted_balance ?? '—'}</b><span>Predicted month-end balance</span></div>
            <div><b>{metrics?.savings_goal ?? '—'}</b><span>Savings goal progress</span></div>
          </div>
        </div>

        <div className="fchat-budgets">
          <div className="fchat-budgets-head">
            <h4>Your Budgets</h4>
            <span><TrendingUp size={14} /> Predicted spend: {metrics?.predicted_month_spend ?? '—'}</span>
          </div>
          {metrics?.budgets?.length ? (
            metrics.budgets.map((b) => (
              <div key={b.name} className={`fchat-budget ${b.status}`}>
                <div className="fchat-budget-top">
                  <b>{b.name}</b>
                  <em>{b.status_label}</em>
                </div>
                <div className="fchat-bar"><i style={{ width: `${Math.min(100, b.percent)}%` }} /></div>
                <div className="fchat-budget-row"><span>{b.spent} of {b.limit}</span><span>{b.left} left</span></div>
                <div className="fchat-budget-row pred"><span>Predicted by month end: {b.predicted_spend}</span><span>{b.predicted_left} left</span></div>
              </div>
            ))
          ) : (
            <p className="fchat-empty">No budgets yet. Add one on the Budgets page and I will track and predict it here.</p>
          )}
        </div>

        <div className="fchat-quick">
          <h4>Quick Questions</h4>
          <p>You can ask me things like:</p>
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => send(q)} disabled={sending}>
              <span>{q}</span><ChevronRight size={16} />
            </button>
          ))}
        </div>

        <div className="fchat-safe">
          <ShieldCheck size={22} />
          <div>
            <b>Your data is safe</b>
            <span>Only your logged-in account information is used for this chat.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
