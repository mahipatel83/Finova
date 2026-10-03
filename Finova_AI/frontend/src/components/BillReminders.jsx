import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Bell, BellRing, Smartphone, Volume2, VolumeX, X } from 'lucide-react';

const SEEN_KEY = 'finova_bill_reminders_seen';
const SOUND_KEY = 'finova_bill_reminder_sound';

// ---- date helpers (all local time, so "tomorrow" matches the user's own calendar) ----
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysUntil(dueDateStr, today = new Date()) {
  const [y, m, d] = dueDateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - start) / 86400000);
}

// ---- sound (Web Audio, no audio file needed) ----
let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Rings a loud two-note bell, once. Browsers block audio until the user has clicked/typed on the
// page, so resume() stays pending until then and the chime plays on the first interaction.
let chimeQueued = false;
function ring(ctx) {
  const t0 = ctx.currentTime + 0.05;
  for (let r = 0; r < 1; r++) {
    [[880, 0], [1318.5, 0.25]].forEach(([freq, offset]) => {
      const start = t0 + r * 1.1 + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.7, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
  }
}

function playChime() {
  try {
    const ctx = getCtx();
    if (!ctx || chimeQueued) return;
    chimeQueued = true;
    const go = () => {
      chimeQueued = false;
      ring(ctx);
    };
    if (ctx.state === 'running') go();
    else ctx.resume().then(go).catch(() => { chimeQueued = false; });
  } catch {
    chimeQueued = false;
  }
}


// ---- phone push helpers ----
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function BillReminders({ bills = [], currencySymbol = '₹', onViewBills, apiBase = '', authHeaders = () => ({}) }) {
  const [today, setToday] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [popups, setPopups] = useState([]);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const wrapRef = useRef(null);
  // 'checking' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on' | 'busy'
  const [pushState, setPushState] = useState('checking');
  const [pushMsg, setPushMsg] = useState('');

  // Re-check every minute so reminders roll over at midnight
  useEffect(() => {
    const t = setInterval(() => setToday(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Reminders exist for every unpaid bill due tomorrow or today
  const reminders = useMemo(() => {
    const list = [];
    (bills || []).forEach((bill) => {
      if (!bill?.due_date || bill.status === 'Paid') return;
      const diff = daysUntil(bill.due_date, today);
      if (diff === 1 || diff === 0) {
        list.push({ bill, kind: diff === 0 ? 'today' : 'tomorrow' });
      }
    });
    // Due today first
    return list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'today' ? -1 : 1));
  }, [bills, today]);

  const messageFor = useCallback(
    ({ bill, kind }) => {
      const amt = `${currencySymbol}${Number(bill.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const auto = bill.auto_pay ? ' (auto-pay is on)' : '';
      return kind === 'today'
        ? `${bill.name} bill of ${amt} is due TODAY${auto}.`
        : `${bill.name} bill of ${amt} is due tomorrow${auto}.`;
    },
    [currencySymbol]
  );

  // Fire a popup + sound once per bill, per reminder day, per calendar day
  useEffect(() => {
    if (reminders.length === 0) return;
    const todayKey = localDateStr(today);
    const seen = readSeen();
    const fresh = reminders.filter(({ bill, kind }) => !seen.includes(`${bill.id}:${kind}:${todayKey}`));
    if (fresh.length === 0) return;

    const updatedSeen = [
      // drop entries from previous days
      ...seen.filter((k) => k.endsWith(`:${todayKey}`)),
      ...fresh.map(({ bill, kind }) => `${bill.id}:${kind}:${todayKey}`),
    ];
    localStorage.setItem(SEEN_KEY, JSON.stringify(updatedSeen));

    setPopups((prev) => [
      ...prev,
      ...fresh.map((r) => ({ id: `${r.bill.id}:${r.kind}:${todayKey}`, kind: r.kind, text: messageFor(r) })),
    ]);

    if (soundOn) playChime();
  }, [reminders, today, soundOn, messageFor]);

  // Any click/keypress lets the browser start audio (a queued chime then plays by itself)
  useEffect(() => {
    const unlock = () => getCtx()?.resume?.();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Auto-dismiss popups after 10s
  useEffect(() => {
    if (popups.length === 0) return;
    const t = setTimeout(() => setPopups((p) => p.slice(1)), 10000);
    return () => clearTimeout(t);
  }, [popups]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);


  // Work out whether this device is already subscribed (and keep the server copy fresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setPushState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setPushState('blocked');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub && Notification.permission === 'granted') {
          // re-register so the subscription belongs to whoever is logged in now
          await fetch(`${apiBase}/api/push/subscribe/`, {
            method: 'POST',
            headers: { ...authHeaders() },
            body: JSON.stringify(sub.toJSON()),
          });
          if (!cancelled) setPushState('on');
        } else if (!cancelled) {
          setPushState('off');
        }
      } catch {
        if (!cancelled) setPushState('off');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enablePush = async () => {
    setPushMsg('');
    setPushState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const keyRes = await fetch(`${apiBase}/api/push/public-key/`);
      const { public_key } = await keyRes.json();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      const res = await fetch(`${apiBase}/api/push/subscribe/`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Server rejected the subscription');
      setPushState('on');
      setPushMsg('Phone notifications are on.');
    } catch (err) {
      setPushState('off');
      setPushMsg(
        window.isSecureContext
          ? `Could not enable notifications: ${err.message}`
          : 'Phone notifications need a secure (https) address, or localhost.'
      );
    }
  };

  const disablePush = async () => {
    setPushState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch(`${apiBase}/api/push/subscribe/`, {
          method: 'DELETE',
          headers: { ...authHeaders() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }
    setPushState('off');
    setPushMsg('');
  };

  const sendTestPush = async () => {
    setPushMsg('Sending test...');
    try {
      const res = await fetch(`${apiBase}/api/push/test/`, { method: 'POST', headers: { ...authHeaders() } });
      const data = await res.json();
      setPushMsg(res.ok ? 'Test sent - check your notifications.' : data.error || 'Test failed.');
    } catch {
      setPushMsg('Test failed - is the server running?');
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    if (next) playChime();
  };

  const count = reminders.length;

  return (
    <>
      <div className="bill-bell-wrap" ref={wrapRef}>
        <button
          className={`bill-bell-btn ${count > 0 ? 'ringing' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={`Bill reminders${count ? `, ${count} due soon` : ''}`}
        >
          {count > 0 ? <BellRing size={20} /> : <Bell size={20} />}
          {count > 0 && <span className="bill-bell-badge">{count}</span>}
        </button>

        {open && (
          <div className="bill-bell-dropdown">
            <div className="bill-bell-dropdown-head">
              <strong>Bill Reminders</strong>
              <button className="bill-bell-sound" onClick={toggleSound} title={soundOn ? 'Mute reminder sound' : 'Unmute reminder sound'}>
                {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <button className="bill-bell-test" onClick={() => playChime()}>
              <Volume2 size={14} /> Test sound
            </button>
            <div className="bill-push-box">
              <div className="bill-push-title">
                <Smartphone size={14} /> Phone notifications
              </div>
              {pushState === 'unsupported' && (
                <p className="bill-push-note">This browser can't receive push notifications.</p>
              )}
              {pushState === 'ios-install' && (
                <p className="bill-push-note">
                  On iPhone: tap Share, then "Add to Home Screen", and open Finova from the home screen to enable
                  notifications.
                </p>
              )}
              {pushState === 'blocked' && (
                <p className="bill-push-note">
                  Notifications are blocked. Allow them for this site in your browser settings, then reload.
                </p>
              )}
              {(pushState === 'off' || pushState === 'busy' || pushState === 'checking') && (
                <button className="bill-push-btn" onClick={enablePush} disabled={pushState !== 'off'}>
                  {pushState === 'busy' ? 'Please wait...' : 'Enable on this device'}
                </button>
              )}
              {pushState === 'on' && (
                <div className="bill-push-row">
                  <button className="bill-push-btn" onClick={sendTestPush}>Send test</button>
                  <button className="bill-push-btn ghost" onClick={disablePush}>Turn off</button>
                </div>
              )}
              {pushMsg && <p className="bill-push-note">{pushMsg}</p>}
            </div>
            {count === 0 ? (
              <p className="bill-bell-empty">No bills due today or tomorrow.</p>
            ) : (
              reminders.map((r) => (
                <button
                  key={`${r.bill.id}:${r.kind}`}
                  className={`bill-bell-item ${r.kind}`}
                  onClick={() => {
                    setOpen(false);
                    onViewBills?.();
                  }}
                >
                  <Bell size={16} />
                  <span>{messageFor(r)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {popups.length > 0 && (
        <div className="bill-popup-stack">
          {popups.map((p) => (
            <div key={p.id} className={`bill-popup ${p.kind}`}>
              <BellRing size={22} className="bill-popup-bell" />
              <div className="bill-popup-text">
                <strong>{p.kind === 'today' ? 'Bill due today' : 'Bill due tomorrow'}</strong>
                <span>{p.text}</span>
              </div>
              <button
                className="bill-popup-close"
                aria-label="Dismiss"
                onClick={() => setPopups((prev) => prev.filter((x) => x.id !== p.id))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
