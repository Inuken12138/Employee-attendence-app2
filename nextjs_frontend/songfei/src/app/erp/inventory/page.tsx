'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface InventoryItem {
  id: number;
  item_code: string;
  name: string;
  image_url: string;
  image?: string | null;
  quantity: number;
  least_inventory_amount: number;
  inventory_condition?: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    item_code: '',
    name: '',
    quantity: '',
    least_inventory_amount: '',
    unit: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/inventory/');
      const data = await response.json();
      setItems(data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const getImageSrc = (image?: string | null) => {
    if (!image) {
      return null;
    }
    return image.startsWith('http') ? image : `http://localhost:8000${image}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('item_code', form.item_code);
      formData.append('name', form.name);
      formData.append('quantity', String(Number(form.quantity)));
      formData.append('least_inventory_amount', String(Number(form.least_inventory_amount || 0)));
      formData.append('unit', form.unit);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await fetch('http://localhost:8000/api/inventory/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data?.detail || 'Failed to create inventory item.');
        return;
      }

      setForm({
        item_code: '',
        name: '',
        quantity: '',
        least_inventory_amount: '',
        unit: '',
      });
      setImageFile(null);
      setShowForm(false);
      fetchItems();
    } catch (error) {
      console.error('Error creating inventory item:', error);
      alert('Failed to create inventory item.');
    }
  };

  const deleteItem = async (id: number) => {
    if (!window.confirm('Delete this inventory item?')) {
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/api/inventory/${id}/`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        alert('Failed to delete inventory item.');
        return;
      }
      fetchItems();
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      alert('Failed to delete inventory item.');
    }
  };

  return (
    <div>
      <div className="kicker">Inventory</div>
      <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Inventory intelligence at a glance.</h1>
      <p className="hero-copy">
        Track product stock, monitor thresholds, and open item histories instantly.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '1.8rem' }}>
        <div className="tag-row">
          <span className="badge">Live Stock</span>
          <span className="badge badge-success">Auto Alerts</span>
        </div>
        <button onClick={() => setShowForm((prev) => !prev)} className="btn btn-primary">
          {showForm ? 'Close' : 'Add New Inventory'}
        </button>
      </div>

      {showForm && (
        <div className="card card-glass" style={{ marginTop: '1.8rem' }}>
          <h2 className="section-title">New Inventory Item</h2>
          <p className="muted">
            Fill in the basic product details to start tracking stock levels.
          </p>
          <form onSubmit={createItem} className="form-grid" style={{ marginTop: '1.5rem' }}>
            <div className="grid-2">
              <div className="form-field">
                <label>Item Code</label>
                <input
                  name="item_code"
                  value={form.item_code}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g. G1"
                />
              </div>
              <div className="form-field">
                <label>Product Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="input"
                  placeholder="Product name"
                  required
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-field">
                <label>Product Image (Upload)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="input"
                />
              </div>
              <div className="form-field">
                <label>Unit</label>
                <input
                  name="unit"
                  value={form.unit}
                  onChange={handleChange}
                  className="input"
                  placeholder="pcs, boxes, etc."
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-field">
                <label>Remaining Amount</label>
                <input
                  name="quantity"
                  type="number"
                  value={form.quantity}
                  onChange={handleChange}
                  className="input"
                  required
                />
              </div>
              <div className="form-field">
                <label>Least Inventory Amount</label>
                <input
                  name="least_inventory_amount"
                  type="number"
                  value={form.least_inventory_amount}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card card-glass" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="section-title">Inventory Items</h2>
          <span className="pill">Catalog</span>
        </div>
        <div className="overflow-x-auto" style={{ marginTop: '1rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Product Name</th>
                <th>Product Image</th>
                <th>Remaining Amount</th>
                <th>Inventory Condition</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: '1rem 0' }}>
                    No inventory items yet.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'table-row-highlight' : ''}>
                    <td>{item.item_code || '-'}</td>
                    <td>{item.name}</td>
                    <td>
                      {item.image ? (
                        <img
                          src={getImageSrc(item.image) || ''}
                          alt={item.name}
                          style={{ width: '90px', height: '64px', objectFit: 'cover', borderRadius: '10px' }}
                        />
                      ) : (
                        <div style={{ width: '90px', height: '64px', borderRadius: '10px', background: 'rgba(245, 242, 234, 0.08)' }} />
                      )}
                    </td>
                    <td>{item.quantity}</td>
                    <td>
                      {item.inventory_condition ||
                        (item.quantity < item.least_inventory_amount ? 'requiring restock' : 'normal')}
                    </td>
                    <td style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <Link href={`/erp/inventory/${item.id}`} className="btn btn-primary">
                        View More
                      </Link>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="btn btn-outline"
                        style={{ borderColor: 'rgba(255, 107, 107, 0.4)', color: 'var(--danger)' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}