'use client';

/**
 * Defines the Next.js page module for the /erp/products/[id]/designer route.
 *
 * This file wires the route into the App Router tree and hosts the page-level UI or hands control to a feature-owned screen component.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import useErrorPopup from '@/app/hooks/useErrorPopup';
import {
  buildAssemblyCompositeDraft,
  buildLeafCompositeDraft,
  buildSinkBaseCompositeDraft,
  getCompositeNodeKind,
  setCompositeNodeKind,
  type PlannerCompositeDraft,
} from '@/features/kitchen-designer/lib/compositeSchema';
import {
  PLANNER_CABINET_GROUPS,
  PLANNER_ROOT_CATEGORIES,
  formatPlannerBreadcrumb,
  type PlannerCabinetGroupKey,
} from '@/features/kitchen-designer/lib/plannerTaxonomy';
import type { PlannerCompositeNodeKind, PlannerCompositeSchema } from '@/features/kitchen-designer/types/planner';
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
  planner_root_category: string;
  planner_group_category: string;
  planner_leaf_category: string;
  glb_file_url: string | null;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  allow_vertical_movement: boolean;
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
  composite_schema: PlannerCompositeSchema;
  has_production_assets: boolean;
  production_asset_notes: string;
  validation_notes: string;
  latest_validation: LatestValidation | null;
  production_assets: ProductionAsset[];
}

interface DesignerFormState {
  is_enabled: boolean;
  planner_role: string;
  planner_root_category: string;
  planner_group_category: string;
  planner_leaf_category: string;
  width_mm: string;
  depth_mm: string;
  height_mm: string;
  allow_vertical_movement: boolean;
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
  composite_node_kind: PlannerCompositeNodeKind;
  production_asset_notes: string;
  validation_notes: string;
}

const defaultForm: DesignerFormState = {
  is_enabled: false,
  planner_role: '',
  planner_root_category: '',
  planner_group_category: '',
  planner_leaf_category: '',
  width_mm: '',
  depth_mm: '',
  height_mm: '',
  allow_vertical_movement: false,
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
  composite_node_kind: 'leaf',
  production_asset_notes: '',
  validation_notes: '',
};

/** Formats the json field into display-ready text. */
function formatJsonField(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

const productionAssetTypes = [
  { value: 'gcode', label: 'G-code' },
  { value: 'cnc_program', label: 'CNC program' },
  { value: 'toolpath', label: 'Toolpath' },
  { value: 'setup_sheet', label: 'Setup sheet' },
  { value: 'cut_list', label: 'Cut list' },
  { value: 'manufacturing_pdf', label: 'Manufacturing PDF' },
  { value: 'other', label: 'Other' },
];

/** Formats the validation issues into display-ready text. */
function formatValidationIssues(items: string[]) {
  return items.map((item) => `- ${item}`).join('\n');
}

/** Formats the validation popup message into display-ready text. */
function formatValidationPopupMessage(validation: LatestValidation) {
  const sections: string[] = [];

  if (validation.errors.length > 0) {
    sections.push(`Errors\n${formatValidationIssues(validation.errors)}`);
  }

  if (validation.warnings.length > 0) {
    sections.push(`Still required before publish\n${formatValidationIssues(validation.warnings)}`);
  }

  return sections.join('\n\n') || 'The validation run did not return any issues.';
}

/** Renders the product designer settings page. */
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
  const plannerLeafOptions = useMemo(() => {
    if (!form.planner_group_category) {
      return [];
    }

    return Object.entries(
      PLANNER_CABINET_GROUPS[form.planner_group_category as PlannerCabinetGroupKey]?.leaves ?? {},
    );
  }, [form.planner_group_category]);
  const plannerBreadcrumb = formatPlannerBreadcrumb({
    rootCategory: form.planner_root_category,
    groupCategory: form.planner_group_category,
    leafCategory: form.planner_leaf_category,
  });

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
        planner_root_category: data.planner_root_category || '',
        planner_group_category: data.planner_group_category || '',
        planner_leaf_category: data.planner_leaf_category || '',
        width_mm: data.width_mm?.toString() || '',
        depth_mm: data.depth_mm?.toString() || '',
        height_mm: data.height_mm?.toString() || '',
        allow_vertical_movement: Boolean(data.allow_vertical_movement),
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
        composite_node_kind: getCompositeNodeKind(data.interaction_schema || {}),
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

  /** Updates the form and returns the next value. */
  const updateForm = <K extends keyof DesignerFormState>(key: K, value: DesignerFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  /** Parses the json field into a value the module can use. */
  const parseJsonField = (value: string, fieldLabel: string) => {
    try {
      return JSON.parse(value || '{}') as Record<string, unknown>;
    } catch {
      throw new Error(`${fieldLabel} must be valid JSON.`);
    }
  };

  /** Helper used by this module to manage apply composite draft. */
  const applyCompositeDraft = (draft: PlannerCompositeDraft, nextKind: PlannerCompositeNodeKind, message: string) => {
    setForm((current) => ({
      ...current,
      interaction_schema: formatJsonField(draft.interaction_schema),
      constraint_schema: formatJsonField(draft.constraint_schema),
      compatibility_schema: formatJsonField(draft.compatibility_schema),
      composite_node_kind: nextKind,
    }));
    setStatusMessage(message);
  };

  /** Helper used by this module to manage save profile. */
  const saveProfile = async ({ showSavedMessage = true }: { showSavedMessage?: boolean } = {}) => {
    if (!productId) {
      return null;
    }

    setSaving(true);

    if (showSavedMessage) {
      setStatusMessage(null);
    }

    try {
      const formData = new FormData();
      const parsedInteractionSchema = setCompositeNodeKind(
        parseJsonField(form.interaction_schema, 'Interaction schema'),
        form.composite_node_kind,
      );
      const parsedConstraintSchema = parseJsonField(form.constraint_schema, 'Constraint schema');
      const parsedCompatibilitySchema = parseJsonField(form.compatibility_schema, 'Compatibility schema');

      formData.append('is_enabled', String(form.is_enabled));
      formData.append('planner_role', form.planner_role);
      formData.append('planner_root_category', form.planner_root_category);
      formData.append('planner_group_category', form.planner_group_category);
      formData.append('planner_leaf_category', form.planner_leaf_category);
      formData.append('allow_vertical_movement', String(form.allow_vertical_movement));
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
      formData.append('interaction_schema', JSON.stringify(parsedInteractionSchema));
      formData.append('constraint_schema', JSON.stringify(parsedConstraintSchema));
      formData.append('compatibility_schema', JSON.stringify(parsedCompatibilitySchema));

      if (form.override_price) formData.append('override_price', form.override_price);
      if (glbFile) formData.append('glb_file', glbFile);

      const data = await apiJson<DesignerProfile>(`/planner/erp/products/${productId}/profile/`, {
        method: 'PATCH',
        body: formData,
      });

      setProfile(data);
      setGlbFile(null);
      if (showSavedMessage) {
        setStatusMessage('Designer settings saved.');
      }
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save designer settings.';
      showErrorPopup(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** Handles the save interaction for this component. */
  const handleSave = async () => {
    await saveProfile();
  };

  /** Handles the validate interaction for this component. */
  const handleValidate = async () => {
    if (!productId) {
      return;
    }

    setActionLoading('validate');
    setStatusMessage(null);
    try {
      const savedProfile = await saveProfile({ showSavedMessage: false });

      if (!savedProfile) {
        return;
      }

      const validation = await apiJson<LatestValidation>(`/planner/erp/products/${productId}/asset-validate/`, {
        method: 'POST',
      });
      setProfile((current) => (current ? { ...current, latest_validation: validation } : current));
      if (validation.status === 'passed') {
        setStatusMessage(
          validation.warnings.length > 0
            ? 'Asset validation passed with warnings. Review the validation panel before staging.'
            : 'Asset validation passed.',
        );
      } else {
        setStatusMessage(null);
        showErrorPopup(`Asset validation completed with errors.\n\n${formatValidationPopupMessage(validation)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run asset validation.';
      showErrorPopup(message);
    } finally {
      setActionLoading(null);
    }
  };

  /** Handles the catalog action interaction for this component. */
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

  /** Handles the upload production asset interaction for this component. */
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

  /** Handles the delete asset interaction for this component. */
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
            <span>Planner root category</span>
            <select
              className="input"
              value={form.planner_root_category}
              onChange={(event) => {
                const nextRootCategory = event.target.value;
                setForm((current) => ({
                  ...current,
                  planner_root_category: nextRootCategory,
                  planner_group_category: nextRootCategory === 'cabinets' ? current.planner_group_category : '',
                  planner_leaf_category: nextRootCategory === 'cabinets' ? current.planner_leaf_category : '',
                }));
              }}
            >
              <option value="">Select root category</option>
              {Object.entries(PLANNER_ROOT_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Planner group category</span>
            <select
              className="input"
              value={form.planner_group_category}
              disabled={form.planner_root_category !== 'cabinets'}
              onChange={(event) => {
                const nextGroupCategory = event.target.value;
                setForm((current) => ({
                  ...current,
                  planner_group_category: nextGroupCategory,
                  planner_leaf_category: '',
                }));
              }}
            >
              <option value="">Select group category</option>
              {Object.entries(PLANNER_CABINET_GROUPS).map(([value, definition]) => (
                <option key={value} value={value}>{definition.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Planner leaf category</span>
            <select
              className="input"
              value={form.planner_leaf_category}
              disabled={form.planner_root_category !== 'cabinets' || !form.planner_group_category}
              onChange={(event) => updateForm('planner_leaf_category', event.target.value)}
            >
              <option value="">Select leaf category</option>
              {plannerLeafOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
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
          <div className="form-field" style={{ justifyContent: 'center' }}>
            <span>GLB size source</span>
            <div className="muted">
              Imported planner models now keep their native meter scale automatically. Manual width, depth, and height entry is no longer used.
            </div>
          </div>
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
            <input type="checkbox" checked={form.allow_vertical_movement} onChange={(event) => updateForm('allow_vertical_movement', event.target.checked)} />
            <span>Allow vertical movement in 3D designer</span>
          </label>
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

        <div className="card card-glass" style={{ marginTop: '1rem', padding: '1rem' }}>
          <div className="pill">Planner publish path</div>
          <p className="muted" style={{ marginTop: '0.7rem', marginBottom: 0 }}>
            To make a product appear in the live planner, set <strong>Planner enabled</strong>, choose both the <strong>planner role</strong> and <strong>planner category path</strong>, upload a `.glb`, run asset validation, move the product to staging, and then publish it. The planner now reads the model&apos;s native meter scale directly from the uploaded `.glb`.
          </p>
          {plannerBreadcrumb && (
            <p className="muted" style={{ marginTop: '0.7rem', marginBottom: 0 }}>
              Current planner path: <strong>{plannerBreadcrumb}</strong>
            </p>
          )}
        </div>

        <div className="card card-glass" style={{ marginTop: '1rem', padding: '1rem' }}>
          <div className="pill">Composite product authoring</div>
          <p className="muted" style={{ marginTop: '0.7rem', marginBottom: 0 }}>
            Use <strong>leaf</strong> for the smallest immutable sellable part, and use <strong>assembly</strong> for a configurable parent such as a sink base cabinet that owns slots like countertop, sink, faucet, door, and handle.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <label className="form-field">
              <span>Planner structure</span>
              <select className="input" value={form.composite_node_kind} onChange={(event) => updateForm('composite_node_kind', event.target.value as PlannerCompositeNodeKind)}>
                <option value="leaf">Leaf part</option>
                <option value="assembly">Assembly template</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => applyCompositeDraft(buildLeafCompositeDraft(), 'leaf', 'Leaf composite starter applied.')}>Use leaf starter</button>
            <button type="button" className="btn btn-outline" onClick={() => applyCompositeDraft(buildAssemblyCompositeDraft(), 'assembly', 'Assembly starter applied.')}>Use assembly starter</button>
            <button type="button" className="btn btn-outline" onClick={() => applyCompositeDraft(buildSinkBaseCompositeDraft(), 'assembly', 'Sink-base composite starter applied.')}>Use sink-base starter</button>
          </div>
          <p className="muted" style={{ marginTop: '0.7rem', marginBottom: 0 }}>
            Saving will force `interaction_schema.node_kind` to match the planner structure selected above. The runtime will start consuming these slots and replacement rules in the next implementation slice.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          <label className="form-field">
            <span>Bounding box JSON</span>
            <textarea className="input" rows={5} value={form.bounding_box_mm} onChange={(event) => updateForm('bounding_box_mm', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Interaction schema JSON</span>
            <span className="muted">Use this for node kind and animation affordances such as door open or close metadata.</span>
            <textarea className="input" rows={5} value={form.interaction_schema} onChange={(event) => updateForm('interaction_schema', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Constraint schema JSON</span>
            <span className="muted">Use `slots` to define named child attachment points such as countertop, sink, faucet, front, and handle.</span>
            <textarea className="input" rows={6} value={form.constraint_schema} onChange={(event) => updateForm('constraint_schema', event.target.value)} />
          </label>
          <label className="form-field">
            <span>Compatibility schema JSON</span>
            <span className="muted">Use `default_children`, `replacement_groups`, and `cutout_rules` to define valid replacements and countertop variant swaps.</span>
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
              <div style={{ color: '#fbbf24' }}>
                <strong>Warnings</strong>
                <ul>
                  {profile.latest_validation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {profile.latest_validation.errors.length > 0 && (
              <div style={{ color: '#f87171' }}>
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
