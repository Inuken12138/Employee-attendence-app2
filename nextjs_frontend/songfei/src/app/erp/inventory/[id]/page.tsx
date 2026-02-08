'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import useErrorPopup from '../../../hooks/useErrorPopup';

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
  const { showErrorPopup } = useErrorPopup();

  useEffect(() => {
    if (!itemId) {
      return;
    }

    const fetchItem = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/inventory/${itemId}/`);
        const data = await response.json();
        setItem(data);
      } catch {
        showErrorPopup('Error fetching inventory item.');
      }
    };

    fetchItem();
  }, [itemId, showErrorPopup]);

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
        showErrorPopup(data?.detail || 'Failed to update image.');
        return;
      }

      const updated = await response.json();
      setItem(updated);
      setNewImage(null);
    } catch {
      showErrorPopup('Failed to update image.');
    } finally {
      setIsUploading(false);
    }
  };

  const condition = item
    ? item.inventory_condition || (item.quantity < item.least_inventory_amount ? 'requiring restock' : 'normal')
    : '-';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="kicker">Inventory Detail</div>
          <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Inventory Movement History</h1>
        </div>
        <Link href="/erp/inventory" className="btn btn-outline">
          Back to Inventory
        </Link>
      </div>

      <div className="split-layout">
        <div className="card card-glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="section-title">Movement Timeline</h2>
            <span className="pill">History</span>
          </div>
          <div className="overflow-x-auto" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th colSpan={5}>Incoming (Restock)</th>
                  <th colSpan={3}>Outgoing (Sales)</th>
                  <th colSpan={1}>Notes</th>
                </tr>
                <tr>
                  <th>Date</th>
                  <th>Cost</th>
                  <th>Delivery Fees</th>
                  <th>Total Cost</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Sale Price</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 20 }).map((_, index) => (
                  <tr key={`row-${index}`} className={index % 2 === 0 ? 'table-row-highlight' : ''}>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                    <td> </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="floating-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="pill">Item Summary</div>
            {item?.image && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ position: 'relative', height: '200px', width: '100%', borderRadius: '18px', overflow: 'hidden' }}>
                  <Image
                    src={getImageSrc(item.image) || ''}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 360px"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              </div>
            )}
            <form onSubmit={updateImage} className="form-grid" style={{ marginTop: '1.2rem' }}>
              <div className="form-field">
                <label>Replace Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewImage(e.target.files?.[0] || null)}
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={!newImage || isUploading}
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
              >
                {isUploading ? 'Updating...' : 'Update Image'}
              </button>
            </form>
            <div className="divider" />
            <div className="form-grid">
              <div className="stat">
                <span className="stat-value">{item?.item_code || '-'}</span>
                <span className="stat-label">Product Code</span>
              </div>
              <div className="stat">
                <span className="stat-value">{item?.name || '-'}</span>
                <span className="stat-label">Product Name</span>
              </div>
              <div className="stat">
                <span className="stat-value">{item?.quantity ?? '-'}</span>
                <span className="stat-label">Remaining Amount</span>
              </div>
              <div className="stat">
                <span className="stat-value">{item?.least_inventory_amount ?? '-'}</span>
                <span className="stat-label">Least Inventory</span>
              </div>
              <div className="stat">
                <span className="stat-value">{condition}</span>
                <span className="stat-label">Condition</span>
              </div>
            </div>
          </div>

          <button className="btn btn-outline" style={{ justifyContent: 'center' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
