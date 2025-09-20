'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AddEmployee() {
  const [form, setForm] = useState({
    name: '',
    position: '',
    base_salary: '',
    bonus: '',
    deductions: ''
  });
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

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
        position: form.position,
        base_salary: parseFloat(form.base_salary),
        bonus: parseFloat(form.bonus),
        deductions: parseFloat(form.deductions)
      })
    });

    if (res.ok) {
      alert('Employee added successfully');
      router.push('/erp/employees');
    } else {
      alert('Error adding employee');
    }
  };

  return (
    <div>
      <h2>Add New Employee</h2>
      <form onSubmit={handleSubmit}>
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required /><br />
        <input name="position" placeholder="Position" value={form.position} onChange={handleChange} required /><br />
        <input name="base_salary" placeholder="Base Salary" value={form.base_salary} onChange={handleChange} required type="number" /><br />
        <input name="bonus" placeholder="Bonus" value={form.bonus} onChange={handleChange} required type="number" /><br />
        <input name="deductions" placeholder="Deductions" value={form.deductions} onChange={handleChange} required type="number" /><br />
        <button type="submit">Save Employee</button>
      </form>
    </div>
  );
}
