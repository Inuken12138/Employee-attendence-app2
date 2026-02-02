'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', username);
      router.push('/erp');
    } else {
      alert('Login failed');
    }
  };

  return (
    <div className="hero">
      <div className="card card-glass">
        <div className="pill">Secure Access</div>
        <h1 className="section-title" style={{ marginTop: '1rem' }}>Welcome back to Songfei</h1>
        <p className="muted">
          Sign in to manage inventory movements, payroll approvals, and operational snapshots.
        </p>
        <form onSubmit={handleLogin} className="form-grid" style={{ marginTop: '1.8rem' }}>
          <div className="form-field">
            <label>Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. operations_admin"
              required
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
            Sign in
          </button>
        </form>
      </div>
      <div className="card">
        <div className="pill">Quick Actions</div>
        <h2 className="section-title" style={{ marginTop: '1rem' }}>Need instant access?</h2>
        <p className="muted">
          Launch the ERP to review inventory thresholds or upload attendance sheets once authenticated.
        </p>
        <div className="divider" />
        <div className="grid-2">
          <div className="stat">
            <span className="stat-value">98%</span>
            <span className="stat-label">On-time Logs</span>
          </div>
          <div className="stat">
            <span className="stat-value">6m</span>
            <span className="stat-label">Avg Check-in</span>
          </div>
        </div>
        <div style={{ marginTop: '1.6rem' }}>
          <a className="btn btn-outline" href="/erp">Go to ERP overview</a>
        </div>
      </div>
    </div>
  );
}