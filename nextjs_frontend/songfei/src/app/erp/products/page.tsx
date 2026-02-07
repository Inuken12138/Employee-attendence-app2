'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: number;
  name: string;
  slug: string;
  children_count: number;
  image_url?: string | null;
}

interface SelectedCategory {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
}

export default function ManageProducts() {
  const [rootCategories, setRootCategories] = useState<Category[]>([]);
  const [currentCategories, setCurrentCategories] = useState<Category[]>([]);
  const [selectedPath, setSelectedPath] = useState<SelectedCategory[]>([]);
  const [showCreateSubcategory, setShowCreateSubcategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [newSubcategorySlug, setNewSubcategorySlug] = useState('');
  const [newCategoryImageFile, setNewCategoryImageFile] = useState<File | null>(null);
  const [newCategoryImagePreview, setNewCategoryImagePreview] = useState<string | null>(null);
  const [showCategoryImageToast, setShowCategoryImageToast] = useState(false);
  const [categoryImageUpdating, setCategoryImageUpdating] = useState(false);
  const [categoryImageError, setCategoryImageError] = useState<string | null>(null);
  const [categoryImageSuccess, setCategoryImageSuccess] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    product_id: '',
    name: '',
    price: '',
    description: '',
    colour: '',
    material: '',
    is_best_seller: false,
    is_new: false,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/api/categories/?parent=null')
      .then(res => res.json())
      .then(data => {
        setRootCategories(data);
        setCurrentCategories(data);
      })
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  const handleCategorySelect = (category: Category) => {
    setSelectedPath([
      ...selectedPath,
      { id: category.id, name: category.name, slug: category.slug, image_url: category.image_url },
    ]);
    
    if (category.children_count > 0) {
      fetch(`http://localhost:8000/api/categories/?parent=${category.id}`)
        .then(res => res.json())
        .then(data => {
          setCurrentCategories(data);
        })
        .catch(err => console.error('Error fetching children:', err));
    } else {
      // Leaf category selected
      setCurrentCategories([]);
    }
  };

  const handleBack = () => {
    if (selectedPath.length === 0) return;
    
    const newPath = selectedPath.slice(0, -1);
    setSelectedPath(newPath);
    
    if (newPath.length === 0) {
      setCurrentCategories(rootCategories);
    } else {
      const parentId = newPath[newPath.length - 1].id;
      fetch(`http://localhost:8000/api/categories/?parent=${parentId}`)
        .then(res => res.json())
        .then(data => {
          setCurrentCategories(data);
        })
        .catch(err => console.error('Error fetching children:', err));
    }
  };

  const handleCreateSubcategory = async () => {
    if (!newSubcategoryName.trim()) {
      setError('Subcategory name is required');
      return;
    }

    if (!newCategoryImageFile) {
      setShowCategoryImageToast(true);
    }

    const parentId = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1].id : null;
    const slug = newSubcategorySlug || newSubcategoryName.toLowerCase().replace(/\s+/g, '-');

    try {
      const formData = new FormData();
      formData.append('name', newSubcategoryName);
      formData.append('slug', slug);
      if (parentId) {
        formData.append('parent', parentId.toString());
      }
      if (newCategoryImageFile) {
        formData.append('image', newCategoryImageFile);
      }

      const res = await fetch('http://localhost:8000/api/categories/', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to create subcategory');
      }

      const newCategory = await res.json();
      setCurrentCategories([...currentCategories, newCategory]);
      setShowCreateSubcategory(false);
      setNewSubcategoryName('');
      setNewSubcategorySlug('');
      setNewCategoryImageFile(null);
      setNewCategoryImagePreview(null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to create subcategory');
    }
  };

  const handleNewCategoryImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewCategoryImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCategoryImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCategoryImageReplace = async (file: File | null) => {
    if (selectedPath.length === 0) return;

    const target = selectedPath[selectedPath.length - 1];
    setCategoryImageError(null);
    setCategoryImageUpdating(true);

    try {
      const formData = new FormData();
      if (file) {
        formData.append('image', file);
      } else {
        formData.append('image', '');
      }

      const res = await fetch(`http://localhost:8000/api/categories/${target.id}/`, {
        method: 'PATCH',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to update category image');
      }

      const updated = await res.json();
      setSelectedPath(prev => {
        const newPath = [...prev];
        newPath[newPath.length - 1] = {
          ...newPath[newPath.length - 1],
          image_url: updated.image_url,
        };
        return newPath;
      });

      setCurrentCategories(prev => prev.map(cat => (cat.id === updated.id ? updated : cat)));
      setCategoryImageSuccess(file ? 'Category image updated.' : 'Category image removed.');
      setTimeout(() => setCategoryImageSuccess(null), 3000);
    } catch (err: any) {
      setCategoryImageError(err.message || 'Failed to update category image');
    } finally {
      setCategoryImageUpdating(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const validateProductId = async (productId: string): Promise<boolean> => {
    if (!productId.trim()) return true; // Empty is OK, will be validated on submit
    
    try {
      const res = await fetch(`http://localhost:8000/api/products/?product_id=${productId}`);
      const data = await res.json();
      return data.length === 0; // True if no product exists with this ID
    } catch {
      return true; // Assume valid if check fails
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (selectedPath.length === 0) {
      setError('Please select a category');
      setSaving(false);
      return;
    }

    if (!productForm.product_id.trim()) {
      setError('Product ID is required');
      setSaving(false);
      return;
    }

    // Validate product_id uniqueness
    const isUnique = await validateProductId(productForm.product_id);
    if (!isUnique) {
      setError('A product with this product_id already exists');
      setSaving(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('product_id', productForm.product_id);
      formData.append('name', productForm.name);
      formData.append('price', productForm.price);
      formData.append('description', productForm.description);
      formData.append('category', selectedPath[selectedPath.length - 1].id.toString());
      formData.append('colour', productForm.colour);
      formData.append('material', productForm.material);
      formData.append('is_best_seller', productForm.is_best_seller.toString());
      formData.append('is_new', productForm.is_new.toString());
      
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch('http://localhost:8000/api/products/', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.product_id?.[0] || 'Failed to create product');
      }

      setSuccess(true);
      // Reset form
      setProductForm({
        product_id: '',
        name: '',
        price: '',
        description: '',
        colour: '',
        material: '',
        is_best_seller: false,
        is_new: false,
      });
      setImageFile(null);
      setImagePreview(null);
      setSelectedPath([]);
      setCurrentCategories(rootCategories);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = () => {
    setProductForm({
      product_id: '',
      name: '',
      price: '',
      description: '',
      colour: '',
      material: '',
      is_best_seller: false,
      is_new: false,
    });
    setImageFile(null);
    setImagePreview(null);
    setSelectedPath([]);
    setCurrentCategories(rootCategories);
    setError(null);
    setSuccess(false);
  };

  return (
    <div>
      <h2 style={{ marginBottom: '2rem' }}>Manage Products</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Category Picker */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Select Category</h3>
          
          {/* Breadcrumb */}
          {selectedPath.length > 0 && (
            <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--edge)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--ink-3)', marginBottom: '0.5rem' }}>Selected path:</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedPath.map((cat, idx) => (
                  <span key={cat.id} style={{ fontSize: '0.9rem' }}>
                    {cat.name}
                    {idx < selectedPath.length - 1 && ' > '}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-outline"
                style={{ marginTop: '0.5rem', fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
              >
                ← Back
              </button>
            </div>
          )}

          {/* Category List */}
          {currentCategories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {currentCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategorySelect(category)}
                  className="btn btn-outline"
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {category.name} {category.children_count > 0 && '→'}
                </button>
              ))}
            </div>
          ) : selectedPath.length > 0 ? (
            <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
              Leaf category selected. You can now create a product.
            </div>
          ) : (
            <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
              No categories available. Create categories first.
            </div>
          )}

          {/* Create New Subcategory */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--edge)' }}>
            {!showCreateSubcategory ? (
              <button
                type="button"
                onClick={() => setShowCreateSubcategory(true)}
                className="btn btn-outline"
                style={{ width: '100%' }}
              >
                + Create New Subcategory
              </button>
            ) : (
              <div>
                {showCategoryImageToast && (
                  <div style={{
                    padding: '0.8rem',
                    backgroundColor: 'rgba(255, 211, 105, 0.18)',
                    border: '1px solid rgba(255, 211, 105, 0.6)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.75rem',
                    color: 'var(--ink-1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}>
                    <div>
                      <strong>Image recommended.</strong> Categories with images perform better in the storefront.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCategoryImageToast(false)}
                      className="btn btn-outline"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Subcategory name"
                  value={newSubcategoryName}
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  className="input"
                  style={{ marginBottom: '0.5rem' }}
                />
                <input
                  type="text"
                  placeholder="Slug (optional, auto-generated)"
                  value={newSubcategorySlug}
                  onChange={(e) => setNewSubcategorySlug(e.target.value)}
                  className="input"
                  style={{ marginBottom: '0.5rem' }}
                />
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--ink-3)', display: 'block', marginBottom: '0.4rem' }}>
                    Category image (recommended)
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(245, 242, 234, 0.08)',
                      overflow: 'hidden',
                      border: '1px dashed var(--edge)',
                    }}>
                      {newCategoryImagePreview ? (
                        <img
                          src={newCategoryImagePreview}
                          alt="Category preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : null}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleNewCategoryImageChange}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleCreateSubcategory}
                    className="btn btn-primary"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateSubcategory(false);
                      setNewSubcategoryName('');
                      setNewSubcategorySlug('');
                      setNewCategoryImageFile(null);
                      setNewCategoryImagePreview(null);
                    }}
                    className="btn btn-outline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedPath.length > 0 && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--edge)' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Selected category image</h4>
              {categoryImageError && (
                <div style={{
                  padding: '0.6rem',
                  backgroundColor: 'rgba(255, 107, 107, 0.15)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '0.75rem',
                  color: 'var(--danger)',
                }}>
                  {categoryImageError}
                </div>
              )}
              {categoryImageSuccess && (
                <div style={{
                  padding: '0.6rem',
                  backgroundColor: 'rgba(111, 213, 199, 0.15)',
                  border: '1px solid var(--accent-2)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '0.75rem',
                  color: 'var(--accent-2)',
                }}>
                  {categoryImageSuccess}
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(245, 242, 234, 0.08)',
                  overflow: 'hidden',
                  border: '1px solid var(--edge)',
                }}>
                  {selectedPath[selectedPath.length - 1].image_url ? (
                    <img
                      src={selectedPath[selectedPath.length - 1].image_url as string}
                      alt="Category"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                    Replace image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          handleCategoryImageReplace(file);
                        }
                      }}
                      style={{ display: 'none' }}
                      disabled={categoryImageUpdating}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleCategoryImageReplace(null)}
                    disabled={categoryImageUpdating}
                  >
                    Remove image
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Product Form */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Product Details</h3>
          
          {error && (
            <div style={{
              padding: '0.8rem',
              backgroundColor: 'rgba(255, 107, 107, 0.15)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              color: 'var(--danger)',
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '0.8rem',
              backgroundColor: 'rgba(111, 213, 199, 0.15)',
              border: '1px solid var(--accent-2)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              color: 'var(--accent-2)',
            }}>
              Product created successfully!
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Product ID *</label>
                <input
                  type="text"
                  className="input"
                  value={productForm.product_id}
                  onChange={(e) => setProductForm({ ...productForm, product_id: e.target.value })}
                  required
                  placeholder="e.g. G01, 50225592"
                />
              </div>

              <div className="form-field">
                <label>Category (read-only)</label>
                <input
                  type="text"
                  className="input"
                  value={selectedPath.length > 0 ? selectedPath.map(c => c.name).join(' > ') : 'None selected'}
                  readOnly
                  style={{ backgroundColor: 'rgba(245, 242, 234, 0.05)' }}
                />
              </div>

              <div className="form-field">
                <label>Name *</label>
                <input
                  type="text"
                  className="input"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Price *</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  className="textarea"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="form-field">
                <label>Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ marginBottom: '0.5rem' }}
                />
                {imagePreview && (
                  <div style={{
                    width: '150px',
                    height: '150px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    marginTop: '0.5rem',
                  }}>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
                {!imagePreview && (
                  <div style={{
                    width: '150px',
                    height: '150px',
                    backgroundColor: 'rgba(245, 242, 234, 0.12)',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ink-3)',
                    fontSize: '0.85rem',
                  }}>
                    No image
                  </div>
                )}
              </div>

              <div className="form-field">
                <label>Colour</label>
                <input
                  type="text"
                  className="input"
                  value={productForm.colour}
                  onChange={(e) => setProductForm({ ...productForm, colour: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Material</label>
                <input
                  type="text"
                  className="input"
                  value={productForm.material}
                  onChange={(e) => setProductForm({ ...productForm, material: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={productForm.is_best_seller}
                    onChange={(e) => setProductForm({ ...productForm, is_best_seller: e.target.checked })}
                  />
                  Best seller
                </label>
              </div>

              <div className="form-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={productForm.is_new}
                    onChange={(e) => setProductForm({ ...productForm, is_new: e.target.checked })}
                  />
                  New product
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Product'}
              </button>
              {success && (
                <button type="button" onClick={handleAddAnother} className="btn btn-outline">
                  Add Another
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
