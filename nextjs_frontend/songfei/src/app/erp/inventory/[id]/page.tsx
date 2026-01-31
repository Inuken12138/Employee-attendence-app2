'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface InventoryItem {
  id: number;
  item_code: string;
  name: string;
  image_url: string;
  image?: string | null;
  quantity: number;
  least_inventory_amount: number;
  unit: string;
  inventory_condition?: string;
}

export default function InventoryDetailPage() {
  const params = useParams();
  const itemId = params?.id;
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!itemId) {
      return;
    }

    const fetchItem = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/inventory/${itemId}/`);
        const data = await response.json();
        setItem(data);
      } catch (error) {
        console.error('Error fetching inventory item:', error);
      }
    };

    fetchItem();
  }, [itemId]);

  const getImageSrc = (image?: string | null) => {
    if (!image) {
      return null;
    }
    return image.startsWith('http') ? image : `http://localhost:8000${image}`;
  };

  const updateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImage || !itemId) {
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('image', newImage);

      const response = await fetch(`http://localhost:8000/api/inventory/${itemId}/`, {
        method: 'PATCH',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data?.detail || 'Failed to update image.');
        return;
      }

      const updated = await response.json();
      setItem(updated);
      setNewImage(null);
    } catch (error) {
      console.error('Error updating image:', error);
      alert('Failed to update image.');
    } finally {
      setIsUploading(false);
    }
  };

  const condition = item
    ? item.inventory_condition || (item.quantity < item.least_inventory_amount ? 'requiring restock' : 'normal')
    : '-';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Inventory Item Detail</h1>
        <Link href="/erp/inventory" className="text-blue-600 hover:underline">
          Back to Inventory
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Inventory Movement History</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border">
              <thead>
                <tr className="bg-green-100">
                  <th className="px-3 py-2 text-left" colSpan={5}>Incoming (Restock)</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Cost</th>
                  <th className="px-3 py-2 text-left">Delivery Fees</th>
                  <th className="px-3 py-2 text-left">Total Cost</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-3 text-gray-400" colSpan={5}>Placeholder rows for future incoming transactions</td>
                </tr>
              </tbody>
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-3 py-2 text-left" colSpan={3}>Outgoing (Sales)</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Sale Price</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-3 text-gray-400" colSpan={3}>Placeholder rows for future outgoing transactions</td>
                </tr>
              </tbody>
              <thead>
                <tr className="bg-purple-100">
                  <th className="px-3 py-2 text-left" colSpan={2}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-3 text-gray-400" colSpan={2}>Placeholder notes area for future use</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Item Summary</h2>
          <div className="space-y-3 text-sm">
            {item?.image && (
              <div className="mb-4">
                <img
                  src={getImageSrc(item.image) || ''}
                  alt={item.name}
                  className="h-32 w-full rounded border object-cover"
                />
              </div>
            )}
            <form onSubmit={updateImage} className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Replace Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewImage(e.target.files?.[0] || null)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <button
                type="submit"
                disabled={!newImage || isUploading}
                className="rounded-md bg-emerald-600 px-3 py-2 text-white shadow hover:bg-emerald-700 disabled:opacity-60"
              >
                {isUploading ? 'Updating...' : 'Update Image'}
              </button>
            </form>
            <div className="flex justify-between">
              <span className="text-gray-500">Product Code:</span>
              <span>{item?.item_code || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Product Name:</span>
              <span>{item?.name || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Remaining Amount:</span>
              <span>{item?.quantity ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Least Inventory:</span>
              <span>{item?.least_inventory_amount ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Condition:</span>
              <span className={condition === 'requiring restock' ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                {condition}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
