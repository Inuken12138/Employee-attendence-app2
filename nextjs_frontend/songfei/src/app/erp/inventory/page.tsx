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
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-gray-600">Track inventory levels and view item history.</p>
        </div>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
        >
          {showForm ? 'Close' : 'Add New Inventory'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">New Inventory Item</h2>
          <p className="text-sm text-gray-600 mb-4">
            Fill in the basic product details to start tracking stock levels.
          </p>
          <form onSubmit={createItem} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Item Code</label>
              <input
                name="item_code"
                value={form.item_code}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="e.g. G1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Product Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Product name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Product Image (Upload)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Unit</label>
              <input
                name="unit"
                value={form.unit}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="pcs, boxes, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Remaining Amount</label>
              <input
                name="quantity"
                type="number"
                value={form.quantity}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Least Inventory Amount</label>
              <input
                name="least_inventory_amount"
                type="number"
                value={form.least_inventory_amount}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Item Code</th>
                <th className="px-4 py-2 text-left">Product Name</th>
                <th className="px-4 py-2 text-left">Product Image</th>
                <th className="px-4 py-2 text-left">Remaining Amount</th>
                <th className="px-4 py-2 text-left">Inventory Condition</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    No inventory items yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2">{item.item_code || '-'}</td>
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2">
                      {item.image ? (
                        <img
                          src={getImageSrc(item.image) || ''}
                          alt={item.name}
                          className="h-16 w-24 rounded border object-cover"
                        />
                      ) : (
                        <div className="h-16 w-24 rounded border bg-gray-100" />
                      )}
                    </td>
                    <td className="px-4 py-2">{item.quantity}</td>
                    <td className="px-4 py-2">
                      {item.inventory_condition ||
                        (item.quantity < item.least_inventory_amount ? 'requiring restock' : 'normal')}
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <Link
                        href={`/erp/inventory/${item.id}`}
                        className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-white shadow hover:bg-green-700"
                      >
                        MORE
                      </Link>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-white shadow hover:bg-red-700"
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