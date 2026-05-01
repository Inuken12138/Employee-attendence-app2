'use client';

/**
 * Frontend module used by the Songfei web application.
 *
 * This file participates in the Next.js storefront or ERP experience and has been annotated to make onboarding easier.
 */

/**
 * Minimal employee creation form used inside the ERP people module.
 *
 * It captures the basic identifiers needed to create an employee record and then
 * hands more advanced payroll setup off to Salary Studio.
 */

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import useErrorPopup from '../../hooks/useErrorPopup';

/** Renders the add-employee form and posts the new record to the backend. */
export default function AddEmployee() {
  const [form, setForm] = useState({
    name: '',
    worker_id: '',
  });
  const router = useRouter();
  const { showErrorPopup } = useErrorPopup();

  /** Keeps the local form state in sync with the text inputs. */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /** Creates the employee through the API and returns to the people hub on success. */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/api/employees/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        name: form.name,
        worker_id: form.worker_id,
        is_active: true,
      })
    });

    if (res.ok) {
      router.push('/erp/employees');
    } else {
      showErrorPopup('Error adding employee');
    }
  };

  return (
    <div>
      <h2>Add New Employee</h2>
      <p>Monthly salary is managed in Salary Studio under Compensation Ledger after the employee record is created.</p>
      <form onSubmit={handleSubmit}>
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required /><br />
        <input name="worker_id" placeholder="Worker ID" value={form.worker_id} onChange={handleChange} required /><br />
        <button type="submit">Save Employee</button>
      </form>
    </div>
  );
}
