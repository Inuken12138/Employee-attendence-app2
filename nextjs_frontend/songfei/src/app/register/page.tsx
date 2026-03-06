'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import useErrorPopup from '../hooks/useErrorPopup';
import { buildApiUrl } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const registerResponse = await fetch(buildApiUrl('/register/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role: 'customer' }),
      });

      if (!registerResponse.ok) {
        throw new Error('Registration failed. Try a different username or email.');
      }

      const loginResponse = await fetch(buildApiUrl('/login/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const loginData = await loginResponse.json();
      if (!loginData.token) {
        throw new Error('Registration succeeded, but automatic sign-in failed.');
      }

      window.localStorage.setItem('token', loginData.token);
      window.localStorage.setItem('username', username);
      router.push('/kitchen-designer');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create your account.';
      showErrorPopup(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hero">
      <div className="card card-glass">
        <div className="pill">Customer account</div>
        <h1 className="section-title" style={{ marginTop: '1rem' }}>Create your Songfei planner account</h1>
        <p className="muted">
          Registration unlocks synced kitchen projects, add-to-bag, and checkout-ready order history.
        </p>
        <form onSubmit={handleRegister} className="form-grid" style={{ marginTop: '1.8rem' }}>
          <div className="form-field">
            <label>Username</label>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <div style={{ marginTop: '1rem' }}>
          <Link className="btn btn-outline" href="/login">
            Already have an account?
          </Link>
        </div>
      </div>
    </div>
  );
}