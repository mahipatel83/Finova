import React, { useState, useEffect } from 'react';
import heroImage from '../assets/hero.png';
import { 
  Shield, 
  Smartphone, 
  TrendingUp, 
  Headphones, 
  CheckCircle2, 
  Menu, 
  X, 
  Wallet,
  PiggyBank
} from 'lucide-react';

export default function LandingPage({ setView }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [legalDoc, setLegalDoc] = useState(null); // 'privacy' | 'terms' | null

  // Highlight the nav link of the section currently on screen
  useEffect(() => {
    const ids = ['home', 'features', 'benefits'];
    const onScroll = () => {
      const probe = window.scrollY + 140; // just below the sticky header
      let current = 'home';
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= probe) current = id;
      });
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = 'benefits';
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the legal popup with the Escape key
  useEffect(() => {
    if (!legalDoc) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setLegalDoc(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [legalDoc]);

  const goTo = (e, id) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  const handleStart = () => {
    setView('register');
  };

  const handleLogin = () => {
    setView('login');
  };

  return (
    <div className="landing-container">
      {/* Sticky Header Nav */}
      <nav className="landing-nav">
        <div className="container flex-between" style={{ height: '100%' }}>
          <div className="logo" style={{ cursor: 'pointer' }} onClick={(e) => goTo(e, 'home')}>
            {/* Custom SVG logo representing growth graph */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="16" width="4" height="10" rx="2" fill="#10B981" />
              <rect x="11" y="10" width="4" height="16" rx="2" fill="#FF5A5F" />
              <rect x="18" y="4" width="4" height="22" rx="2" fill="#10B981" />
              <circle cx="27" cy="6" r="3" fill="#FF5A5F" />
            </svg>
            <span>Finova</span>
          </div>

          {/* Desktop Nav Links */}
          <ul className="nav-links">
            <li><a href="#home" className={`nav-link${activeSection === 'home' ? ' active' : ''}`} onClick={(e) => goTo(e, 'home')}>Home</a></li>
            <li><a href="#features" className={`nav-link${activeSection === 'features' ? ' active' : ''}`} onClick={(e) => goTo(e, 'features')}>Features</a></li>
            <li><a href="#benefits" className={`nav-link${activeSection === 'benefits' ? ' active' : ''}`} onClick={(e) => goTo(e, 'benefits')}>Benefits</a></li>
          </ul>

          {/* Desktop Actions */}
          <div className="nav-actions">
            <button className="btn btn-outline" style={{ borderColor: '#10B981', color: '#10B981' }} onClick={handleLogin}>Login</button>
            <button className="btn btn-primary" onClick={handleStart}>Sign Up</button>
          </div>

          {/* Hamburger Menu Icon */}
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={28} />
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay">
          <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
            <X size={32} />
          </button>
          <div className="mobile-menu-links">
            <a href="#home" className="mobile-menu-link" onClick={(e) => goTo(e, 'home')}>Home</a>
            <a href="#features" className="mobile-menu-link" onClick={(e) => goTo(e, 'features')}>Features</a>
            <a href="#benefits" className="mobile-menu-link" onClick={(e) => goTo(e, 'benefits')}>Benefits</a>
          </div>
          <div className="mobile-menu-actions">
            <button className="btn btn-outline" style={{ color: '#FFFFFF', borderColor: '#FFFFFF', width: '100%' }} onClick={() => { setMobileMenuOpen(false); handleLogin(); }}>Login</button>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setMobileMenuOpen(false); handleStart(); }}>Sign Up</button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <header id="home" className="hero-sec">
        <div className="container grid-cols-2">
          <div className="hero-content">
            <div>
              <span className="tag-badge">
                <CheckCircle2 size={16} /> Smart • Simple • Secure
              </span>
            </div>
            <h1 className="hero-title">
              Take Control of <br />Your <span>Finances</span>
            </h1>
            <p className="hero-subtitle">
              Finova helps you track income, manage expenses, plan budgets and achieve your financial goals effortlessly.
            </p>
            
            <div className="hero-bullets">
              <div className="bullet-item"><CheckCircle2 size={18} /> Track Expenses</div>
              <div className="bullet-item"><CheckCircle2 size={18} /> Create Budgets</div>
              <div className="bullet-item"><CheckCircle2 size={18} /> Save More</div>
              <div className="bullet-item"><CheckCircle2 size={18} /> Achieve Goals</div>
            </div>
          </div>

          {/* Visual Mockup Image on Right */}
          <div className="hero-image-wrapper">
            <img src={heroImage} alt="Finova Mockup" style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} />
          </div>
        </div>
      </header>

      {/* Features Grid Section */}
      <section id="features" className="features-sec">
        <div className="container">
          <div className="section-title-wrap">
            <p className="section-tag">Features</p>
            <h2 className="section-title">Everything you need to <span>manage your money</span></h2>
          </div>

          <div className="grid-cols-3">
            {/* Card 1 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                <TrendingUp size={22} />
              </div>
              <h3 className="feature-title">Smart Dashboard</h3>
              <p className="feature-desc">Get a complete overview of your entire financial health in one single premium interface.</p>
            </div>

            {/* Card 2 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                <Wallet size={22} />
              </div>
              <h3 className="feature-title">Track Expenses</h3>
              <p className="feature-desc">Track every single transaction automatically. Categorize and analyze cash flow seamlessly.</p>
            </div>

            {/* Card 3 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: '#E0F2FE', color: '#0284C7' }}>
                <CheckCircle2 size={22} />
              </div>
              <h3 className="feature-title">Budget Management</h3>
              <p className="feature-desc">Create custom budgets, set limits, and stay on top of monthly spending constraints.</p>
            </div>

            {/* Card 4 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: '#FEE2E2', color: '#EF4444' }}>
                <Smartphone size={22} />
              </div>
              <h3 className="feature-title">Bills & Reminders</h3>
              <p className="feature-desc">Never miss another utility bill payment with automatic system push alerts.</p>
            </div>

            {/* Card 5 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
                <PiggyBank size={22} />
              </div>
              <h3 className="feature-title">Savings Goals</h3>
              <p className="feature-desc">Establish long-term savings projects, monitor progress, and achieve goals faster.</p>
            </div>

            {/* Card 6 */}
            <div className="feature-card">
              <div className="feature-icon-box flex-center" style={{ backgroundColor: '#E2E8F0', color: 'var(--text-main)' }}>
                <TrendingUp size={22} />
              </div>
              <h3 className="feature-title">Reports & Insights</h3>
              <p className="feature-desc">Visualize growth charts, check categories, and generate monthly reports.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="trust-sec">
        <div className="container">
          <div className="section-title-wrap">
            <p className="section-tag">Benefits</p>
            <h2 className="section-title">Why people choose <span>Finova</span></h2>
          </div>
          <div className="trust-grid">
          <div className="trust-item">
            <div className="trust-icon"><Shield size={24} /></div>
            <div className="trust-info">
              <h4>Bank-Level Security</h4>
              <p>Your data is fully encrypted</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><Smartphone size={24} /></div>
            <div className="trust-info">
              <h4>Access Anywhere</h4>
              <p>Manage on any mobile device</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><TrendingUp size={24} /></div>
            <div className="trust-info">
              <h4>Smarter Decisions</h4>
              <p>Actionable financial insights</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><Headphones size={24} /></div>
            <div className="trust-info">
              <h4>24/7 Support</h4>
              <p>We are here for you anytime</p>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: 'var(--text-main)', color: '#FFFFFF', padding: '60px 0 30px 0' }}>
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '30px' }}>
            <div>
              <div className="logo" style={{ color: '#FFFFFF' }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4" y="16" width="4" height="10" rx="2" fill="#10B981" />
                  <rect x="11" y="10" width="4" height="16" rx="2" fill="#FF5A5F" />
                  <rect x="18" y="4" width="4" height="22" rx="2" fill="#10B981" />
                  <circle cx="27" cy="6" r="3" fill="#FF5A5F" />
                </svg>
                <span>Finova</span>
              </div>
              <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginTop: '16px', maxWidth: '260px' }}>
                Manage Today. Secure Tomorrow. Make smart moves with Finova.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '60px', flexWrap: 'wrap' }}>
              <div>
                <h4 style={{ color: '#FFFFFF', marginBottom: '16px', fontSize: '1rem' }}>Product</h4>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem', color: 'var(--text-light)' }}>
                  <li><a href="#features" onClick={(e) => goTo(e, 'features')}>Features</a></li>
                  <li><a href="#benefits" onClick={(e) => goTo(e, 'benefits')}>Security</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #334155', paddingTop: '30px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-light)' }}>
            <p>© 2026 Finova. All rights reserved.</p>
            <div style={{ display: 'flex', gap: '20px' }}>
              <a href="#privacy" onClick={(e) => { e.preventDefault(); setLegalDoc('privacy'); }}>Privacy Policy</a>
              <a href="#terms" onClick={(e) => { e.preventDefault(); setLegalDoc('terms'); }}>Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
      {/* Privacy / Terms popup */}
      {legalDoc && (
        <div className="modal-backdrop" onClick={() => setLegalDoc(null)}>
          <div className="modal-dialog" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{legalDoc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</h3>
              <button className="modal-close-btn" onClick={() => setLegalDoc(null)} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
              {legalDoc === 'privacy' ? (
                <>
                  <p>Finova only stores the information you enter: your name, email, accounts, transactions, budgets, bills and savings goals.</p>
                  <p>Your data is used only to show your dashboard, reports and AI assistant answers. The assistant reads your own data and never another user&apos;s.</p>
                  <p>We do not sell or share your financial data. You can delete your records at any time from inside the app.</p>
                </>
              ) : (
                <>
                  <p>By creating an account you agree to use Finova for personal money tracking and to keep your login details private.</p>
                  <p>Finova&apos;s insights, predictions and assistant replies are for guidance only and are not professional financial advice.</p>
                  <p>You are responsible for the accuracy of the data you enter. We may update the app and these terms from time to time.</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setLegalDoc(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
