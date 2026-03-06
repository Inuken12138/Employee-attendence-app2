'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import { apiJson } from '@/lib/api';

interface ProductionAsset {
  id: number;
  label: string;
  asset_type: string;
  file_url: string | null;
  file_format: string;
  machine_profile: string;
  variant_key: string;
  version_label: string;
  notes: string;
  is_active: boolean;
}

interface LatestValidation {
  id: number;
  status: 'pending' | 'passed' | 'failed';
  detected_format: string;
  file_size_bytes: number;
  warnings: string[];
  errors: string[];
  validated_at: string;
  validated_by_username?: string;
}

interface DesignerProfile {
  id: number;
  product: number;
  product_name: string;
  product_code: string;
  is_enabled: boolean;
  catalog_state: 'draft' | 'staging' | 'published' | 'archived';
  planner_role: string;
  glb_file_url: string | null;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  bounding_box_mm: Record<string, unknown>;
  origin_anchor: string;
  default_rotation_deg: number;
  requires_wall_attachment: boolean;
  requires_benchtop: boolean;
  supports_left_end_panel: boolean;
  supports_right_end_panel: boolean;
  pricing_mode: string;
  override_price: number | null;
  interaction_schema: Record<string, unknown>;
  constraint_schema: Record<string, unknown>;
  compatibility_schema: Record<string, unknown>;
  has_production_assets: boolean;
  production_asset_notes: string;
  validation_notes: string;
  latest_validation: LatestValidation | null;
  production_assets: ProductionAsset[];
}

interface DesignerFormState {
  is_enabled: boolean;
  planner_role: string;
  width_mm: string;
  depth_mm: string;
  height_mm: string;
  origin_anchor: string;
  default_rotation_deg: string;
  requires_wall_attachment: boolean;
  requires_benchtop: boolean;
  supports_left_end_panel: boolean;
  supports_right_end_panel: boolean;
  pricing_mode: string;
  override_price: string;
  bounding_box_mm: string;
  interaction_schema: string;
  constraint_schema: string;
  compatibility_schema: string;
  production_asset_notes: string;
  validation_notes: string;
}

const defaultForm: DesignerFormState = {
  is_enabled: false,
  planner_role: '',
  width_mm: '',
  depth_mm: '',
  height_mm: '',
  origin_anchor: 'floor_back_left',
  default_rotation_deg: '0',
  requires_wall_attachment: false,
  requires_benchtop: false,
  supports_left_end_panel: false,
  supports_right_end_panel: false,
  pricing_mode: 'use_product_price',
  override_price: '',
  bounding_box_mm: '{}',
  interaction_schema: '{}',
  constraint_schema: '{}',
  compatibility_schema: '{}',
  production_asset_notes: '',
  validation_notes: '',
};

const productionAssetTypes = [
  { value: 'gcode', label: 'G-code' },
  { value: 'cnc_program', label: 'CNC program' },
  { value: 'toolpath', label: 'Toolpath' },
  { value: 'setup_sheet', label: 'Setup sheet' },
  { value: 'cut_list', label: 'Cut list' },
  { value: 'manufacturing_pdf', label: 'Manufacturing PDF' },
  { value: 'other', label: 'Other' },
];

export default function ProductDesignerSettingsPage() {
  const params = useParams();
  const productId = useMemo(() => {
    const raw = params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.id]);

  const { showErrorPopup } = useErrorPopup();

  const [profile, setProfile] = useState<DesignerProfile | null>(null);
  const [form, setForm] = useState<DesignerFormState>(defaultForm);
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState({
    label: '',
    asset_type: 'other',
    file_format: '',
    machine_profile: '',
    variant_key: '',
    version_label: '',
    notes: '',
    is_active: true,
  });
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetSaving, setAssetSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!productId) {
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson<DesignerProfile>(`/planner/erp/products/${productId}/profile/`);
      setProfile(data);
      setForm({
        is_enabled: data.is_enabled,
        planner_role: data.planner_role || '',
        width_mm: data.width_mm?.toString() || '',
        depth_mm: data.depth_mm?.toString() || '',
        height_mm: data.height_mm?.toString() || '',
        origin_anchor: data.origin_anchor || 'floor_back_left',
        default_rotation_deg: data.default_rotation_deg?.toString() || '0',
        requires_wall_attachment: data.requires_wall_attachment,
        requires_benchtop: data.requires_benchtop,
        supports_left_end_panel: data.supports_left_end_panel,
        supports_right_end_panel: data.supports_right_end_panel,
        pricing_mode: data.pricing_mode || 'use_product_price',
        override_price: data.override_price?.toString() || '',
        bounding_box_mm: JSON.stringify(data.bounding_box_mm || {}, null, 2),
        interaction_schema: JSON.stringify(data.interaction_schema || {}, null, 2),
        constraint_schema: JSON.stringify(data.constraint_schema || {}, null, 2),
        compatibility_schema: JSON.stringify(data.compatibility_schema || {}, null, 2),
        production_asset_notes: data.production_asset_notes || '',
        validation_notes: data.validation_notes || '',
      });
      setStatusMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load designer settings.';
      showErrorPopup(message);
    } finally {
      setLoading(false);
    }
  }, [productId, showErrorPopup]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const updateForm = <K extends keyof DesignerFormState>(key: K, value: DesignerFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const parseJsonField = (value: string, fieldLabel: string) => {
    try {
      return JSON.parse(value || '{}') as Record<string, unknown>;
    } catch {
      throw new Error(`${fieldLabel} must be valid JSON.`);
    }
  };

  const handleSave = async () => {
    if (!productId) {
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('is_enabled', String(form.is_enabled));
      formData.append('planner_role', form.planner_role);
      formData.append('origin_anchor', form.origin_anchor);
      formData.append('default_rotation_deg', form.default_rotation_deg || '0');
      formData.append('requires_wall_attachment', String(form.requires_wall_attachment));
      formData.append('requires_benchtop', String(form.requires_benchtop));
      formData.append('supports_left_end_panel', String(form.supports_left_end_panel));
      formData.append('supports_right_end_panel', String(form.supports_right_end_panel));
      formData.append('pricing_mode', form.pricing_mode);
      formData.append('production_asset_notes', form.production_asset_notes);
      formData.append('validation_notes', form.validation_notes);
      formData.append('bounding_box_mm', JSON.stringify(parseJsonField(form.bounding_box_mm, 'Bounding box')));
      formData.append('interaction_schema', JSON.stringify(parseJsonField(form.interaction_schema, 'Interaction schema')));
      formData.append('constraint_schema', JSON.stringify(parseJsonField(form.constraint_schema, 'Constraint schema')));
      formData.append('compatibility_schema', JSON.stringify(parseJsonField(form.compatibility_schema, 'Compatibility schema')));

      if (form.width_mm) formData.append('width_mm', form.width_mm);
      if (form.depth_mm) formData.append('depth_mm', form.depth_mm);
      if (form.height_mm) formData.append('height_mm', form.height_mm);
      if (form.override_price) formData.append('override_price', form.override_price);
      if (glbFile) formData.append('glb_file', glbFile);

      const data = await apiJson<DesignerProfile>(`/planner/erp/products/${productId}/profile/`, {
        method: 'PATCH',
        body: formData,
      });

      setProfile(data);
      setGlbFile(null);
      setStatusMessage('Designer settings saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save designer settings.';
      showErrorPopup(message);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!productId) {
      return;
    }

    setActionLoading('validate');
    setStatusMessage(null);
    try {
      const validation = await apiJson<LatestValidation>(`/planner/erp/products/${productId}/asset-validate/`, {
        method: 'POST',
      });
      setProfile((current) => (current ? { ...current, latest_validation: validation } : current));
      setStatusMessage(validation.status === 'passed' ? 'Asset validation passed.' : 'Asset validation completed with errors.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run asset validation.';
      showErrorPopup(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCatalogAction = async (action: 'stage' | 'publish' | 'unpublish') => {
    if (!productId) {
      return;
    }

    setActionLoading(action);
    setStatusMessage(null);
    try {
      const data = await apiJson<DesignerProfile>(`/planner/erp/products/${productId}/${action}/`, {
        method: 'POST',
      });
      setProfile(data);
      setStatusMessage(`Catalog state updated to ${data.catalog_state}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${action} product.`;
      showErrorPopup(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadProductionAsset = async () => {
    if (!productId || !assetFile || !assetForm.label.trim()) {
      showErrorPopup('Add a label and file before uploading a production asset.');
      return;
    }

    setAssetSaving(true);
    try {
      const formData = new FormData();
      formData.append('label', assetForm.label);
      formData.append('asset_type', assetForm.asset_type);
      formData.append('file', assetFile);
      formData.append('file_format', assetForm.file_format);
      formData.append('machine_profile', assetForm.machine_profile);
      formData.append('variant_key', assetForm.variant_key);
      formData.append('version_label', assetForm.version_label);
      formData.append('notes', assetForm.notes);
      formData.append('is_active', String(assetForm.is_active));

      await apiJson<ProductionAsset>(`/planner/erp/products/${productId}/production-assets/`, {
        method: 'POST',
        body: formData,
      });

      setAssetForm({
        label: '',
        asset_type: 'other',
        file_format: '',
        machine_profile: '',
        variant_key: '',
        version_label: '',
        notes: '',
        is_active: true,
      });
      setAssetFile(null);
      setStatusMessage('Production asset uploaded.');
      await loadProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload production asset.';
      showErrorPopup(message);
    } finally {
      setAssetSaving(false);
    }
  };

  const handleDeleteAsset = async (assetId: number) => {
    if (!window.confirm('Delete this production asset?')) {
      return;
    }

    try {
      await apiJson(`/planner/erp/production-assets/${assetId}/`, { method: 'DELETE' });
      setStatusMessage('Production asset deleted.');
      await loadProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete production asset.';
      showErrorPopup(message);
    }
  };

  if (loading) {
    return <div className="muted">Loading designer settings…</div>;
  }

  if (!profile) {
    return <div className="muted">Designer settings are unavailable.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div className="pill">Designer Settings</div>
          <h1 className="section-title" style={{ marginTop: '1rem' }}>{profile.product_name}</h1>
          <p className="muted" style={{ marginTop: '0.4rem' }}>
            Product code {profile.product_code} · catalog state {profile.catalog_state}
          </p>
        </div>
        <Link className="btn btn-outline" href="/erp/products">
          Back to products
        </Link>
      </div>

      {statusMessage && (
        <div className="card" style={{ padding: '1rem', border: '1px solid rgba(111, 213, 199, 0.35)', color: 'var(--accent-2)' }}>
          {statusMessage}
        </div>
      )}

      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <label className="form-field">
            <span>Planner enabled</span>
            <input type="checkbox" checked={form.is_enabled} onChange={(event) => updateForm('is_enabled', event.target.checked)} />
          </label>
          <label className="form-field">
            <span>Planner role</span>
            <select className="input" value={form.planner_role} onChange={(event) => updateForm('planner_role', event.target.value)}>
              <option value="">Select role</option>
              <option value="base">Base cabinet</option>
              <option value="wall">Wall cabinet</option>
              <option value="tall">Tall cabinet</option>
              <option value="panel">Panel</option>
              <option value="benchtop">Benchtop</option>
              <option value="appliance">Appliance</option>
              <option value="accessory">Accessory</option>
            </select>
          </label>
          <label className="form-field">
            <span>Origin anchor</span>
            <select className="input" value={form.origin_anchor} onChange={(event) => updateForm('origin_anchor', event.target.value)}>
              <option value="floor_back_left">Floor back left</option>
              <option value="floor_back_center">Floor back center</option>
              <option value="center">Center</option>
            </select>
          </label>
          <label className="form-field">
            <span>Pricing mode</span>
            <select className="input" value={form.pricing_mode} onChange={(event) => updateForm('pricing_mode', event.target.value)}>
              <option value="use_product_price">Use product price</option>
              <option value="override">Override</option>
              <option value="formula">Formula</option>
            </select>
          </label>
          <label className="form-field">
            <span>Width (mm)</span>
            <input className="input" value={form.width_mm} onChange={(event) => updateForm('width_mm', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Depth (mm)</span>
            <input className="input" value={form.depth_mm} onChange={(event) => updateForm('depth_mm', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Height (mm)</span>
            <input className="input" value={form.height_mm} onChange={(event) => updateForm('height_mm', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Default rotation (deg)</span>
            <input className="input" value={form.default_rotation_deg} onChange={(event) => updateForm('default_rotation_deg', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Override price</span>
            <input className="input" value={form.override_price} onChange={(event) => updateForm('override_price', event.target.value)} placeholder="Optional" />
          </label>
          <label className="form-field">
            <span>Planner .glb asset</span>
            <input type="file" accept=".glb" onChange={(event) => setGlbFile(event.target.files?.[0] || null)} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.requires_wall_attachment} onChange={(event) => updateForm('requires_wall_attachment', event.target.checked)} />
            <span>Requires wall attachment</span>
          </label>
          <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.requires_benchtop} onChange={(event) => updateForm('requires_benchtop', event.target.checked)} />
            <span>Requires benchtop</span>
          </label>
          <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.supports_left_end_panel} onChange={(event) => updateForm('supports_left_end_panel', event.target.checked)} />
            <span>Supports left end panel</span>
          </label>
          <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.supports_right_end_panel} onChange={(event) => updateForm('supports_right_end_panel', event.target.checked)} />
            <span>Supports right end panel</span>
          </label>
        </div>

        {profile.glb_file_url && (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Current asset: <a href={profile.glb_file_url} target="_blank" rel="noreferrer">download .glb</a>
          </p>
        )}

        <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          <label className="form-field">
            <span>Bounding box JSON</span>
            <textarea className="input" rows={5} value={form.bounding_box_mm} onChange={(event) => updateForm('bounding_box_mm', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Interaction schema JSON</span>
            <textarea className="input" rows={5} value={form.interaction_schema} onChange={(event) => updateForm('interaction_schema', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Constraint schema JSON</span>
            <textarea className="input" rows={6} value={form.constraint_schema} onChange={(event) => updateForm('constraint_schema', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Compatibility schema JSON</span>
            <textarea className="input" rows={6} value={form.compatibility_schema} onChange={(event) => updateForm('compatibility_schema', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Production asset notes</span>
            <textarea className="input" rows={3} value={form.production_asset_notes} onChange={(event) => updateForm('production_asset_notes', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Validation notes</span>
            <textarea className="input" rows={3} value={form.validation_notes} onChange={(event) => updateForm('validation_notes', event.target.value)} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="btn btn-outline" onClick={handleValidate} disabled={actionLoading === 'validate'}>
            {actionLoading === 'validate' ? 'Validating…' : 'Run asset validation'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => handleCatalogAction('stage')} disabled={actionLoading === 'stage'}>
            {actionLoading === 'stage' ? 'Staging…' : 'Move to staging'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => handleCatalogAction('publish')} disabled={actionLoading === 'publish'}>
            {actionLoading === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => handleCatalogAction('unpublish')} disabled={actionLoading === 'unpublish'}>
            {actionLoading === 'unpublish' ? 'Updating…' : 'Unpublish'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 className="section-title">Latest asset validation</h2>
        {!profile.latest_validation ? (
          <p className="muted" style={{ marginTop: '0.8rem' }}>No validation has been run yet.</p>
        ) : (
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span className="pill">Status: {profile.latest_validation.status}</span>
              <span className="pill">Format: {profile.latest_validation.detected_format || 'unknown'}</span>
              <span className="pill">Size: {Math.round((profile.latest_validation.file_size_bytes || 0) / 1024)} KB</span>
            </div>
            {profile.latest_validation.warnings.length > 0 && (
              <div>
                <strong>Warnings</strong>
                <ul>
                  {profile.latest_validation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {profile.latest_validation.errors.length > 0 && (
              <div>
                <strong>Errors</strong>
                <ul>
                  {profile.latest_validation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 className="section-title">Production assets</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <label className="form-field">
            <span>Label</span>
            <input className="input" value={assetForm.label} onChange={(event) => setAssetForm((current) => ({ ...current, label: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Asset type</span>
            <select className="input" value={assetForm.asset_type} onChange={(event) => setAssetForm((current) => ({ ...current, asset_type: event.target.value }))}>
              {productionAssetTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>File format</span>
            <input className="input" value={assetForm.file_format} onChange={(event) => setAssetForm((current) => ({ ...current, file_format: event.target.value }))} placeholder="gcode, pdf, zip" />
          </label>
          <label className="form-field">
            <span>Machine profile</span>
            <input className="input" value={assetForm.machine_profile} onChange={(event) => setAssetForm((current) => ({ ...current, machine_profile: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Variant key</span>
            <input className="input" value={assetForm.variant_key} onChange={(event) => setAssetForm((current) => ({ ...current, variant_key: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Version label</span>
            <input className="input" value={assetForm.version_label} onChange={(event) => setAssetForm((current) => ({ ...current, version_label: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Asset file</span>
            <input type="file" onChange={(event) => setAssetFile(event.target.files?.[0] || null)} />
          </label>
          <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={assetForm.is_active} onChange={(event) => setAssetForm((current) => ({ ...current, is_active: event.target.checked }))} />
            <span>Mark active</span>
          </label>
        </div>
        <label className="form-field" style={{ marginTop: '1rem' }}>
          <span>Notes</span>
          <textarea className="input" rows={3} value={assetForm.notes} onChange={(event) => setAssetForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={handleUploadProductionAsset} disabled={assetSaving}>
            {assetSaving ? 'Uploading…' : 'Upload production asset'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: '0.8rem', marginTop: '1.5rem' }}>
          {profile.production_assets.length === 0 ? (
            <p className="muted">No production assets uploaded yet.</p>
          ) : (
            profile.production_assets.map((asset) => (
              <div key={asset.id} style={{ border: '1px solid var(--edge)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{asset.label}</div>
                    <div className="muted" style={{ marginTop: '0.35rem' }}>
                      {asset.asset_type} {asset.file_format ? `· ${asset.file_format}` : ''} {asset.version_label ? `· ${asset.version_label}` : ''}
                    </div>
                    {asset.notes && <p className="muted" style={{ marginTop: '0.5rem' }}>{asset.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {asset.file_url && (
                      <a className="btn btn-outline" href={asset.file_url} target="_blank" rel="noreferrer">
                        Download
                      </a>
                    )}
                    <button type="button" className="btn btn-outline" onClick={() => void handleDeleteAsset(asset.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
