'use client';

import Link from 'next/link';

import type { CartItem } from '../types/cart';

export default function CartItemRow({
  item,
  onUpdateQuantity,
  onRemove,
  busy,
}: {
  item: CartItem;
  onUpdateQuantity: (itemId: number, quantity: number) => Promise<void>;
  onRemove: (itemId: number) => Promise<void>;
  busy?: boolean;
}) {
  const sourceProjectSlug = typeof item.metadata?.source_project_slug === 'string' ? item.metadata.source_project_slug : null;

  return (
    <div className="card" style={{ padding: '1rem', display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{item.product.name}</div>
          <div className="muted" style={{ marginTop: '0.35rem' }}>
            {item.product.product_id} · {item.source_type === 'kitchen_bundle' ? 'Kitchen bundle' : 'Catalog product'}
          </div>
        </div>
        <div style={{ fontWeight: 700, color: 'var(--accent-1)' }}>${item.line_total.toFixed(2)}</div>
      </div>

      {item.source_type === 'kitchen_bundle' && (
        <div style={{ border: '1px solid rgba(242, 196, 111, 0.25)', borderRadius: 'var(--radius-md)', padding: '0.75rem', background: 'rgba(242, 196, 111, 0.08)' }}>
          <div style={{ fontWeight: 600 }}>Designer-managed line</div>
          <div className="muted" style={{ marginTop: '0.35rem' }}>
            Quantity and removal stay locked because this line was generated from a validated kitchen design.
          </div>
          {sourceProjectSlug && (
            <div style={{ marginTop: '0.6rem' }}>
              <Link className="btn btn-outline" href={`/kitchen-designer/${sourceProjectSlug}`}>
                Return to designer
              </Link>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {item.is_quantity_locked ? (
          <div className="muted">Quantity: {item.quantity}</div>
        ) : (
          <label className="form-field" style={{ maxWidth: '160px' }}>
            <span>Quantity</span>
            <input
              className="input"
              type="number"
              min={1}
              value={item.quantity}
              onChange={(event) => void onUpdateQuantity(item.id, Number(event.target.value) || 1)}
              disabled={busy}
            />
          </label>
        )}

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void onRemove(item.id)}
          disabled={busy || item.is_removal_locked}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
