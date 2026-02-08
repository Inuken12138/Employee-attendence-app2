'use client';

import { useState, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import useErrorPopup from '../../hooks/useErrorPopup';

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

interface Product {
  id: number;
  product_id: string;
  name: string;
  price: number;
  description?: string;
  category: number | null;
  category_name?: string | null;
  image_url?: string | null;
  colour?: string;
  material?: string;
  is_best_seller: boolean;
  is_new: boolean;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    product_id: '',
    name: '',
    price: '',
    description: '',
    category: '',
    colour: '',
    material: '',
    is_best_seller: false,
    is_new: false,
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
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
  const { showErrorPopup } = useErrorPopup();

  const getErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  const convertImageToJpegOrPng = async (file: File): Promise<File> => {
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      return file;
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for conversion'));
      };
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image conversion failed'))),
        'image/jpeg',
        0.9
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  };

  useEffect(() => {
    fetch('http://localhost:8000/api/categories/?parent=null')
      .then(res => res.json())
      .then(data => {
        setRootCategories(data);
        setCurrentCategories(data);
      })
      .catch(err => {
        const message = err?.message || 'Error fetching categories';
        showErrorPopup(message);
      });
  }, [showErrorPopup]);

  const selectedCategoryId = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1].id : null;

  const selectedCategoryName = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1].name : null;

  const selectedCategorySlug = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1].slug : null;

  const normalizeProductList = useCallback((data: unknown): Product[] => {
    if (Array.isArray(data)) return data as Product[];
    if (Array.isArray((data as { results?: unknown[] })?.results)) {
      return (data as { results: Product[] }).results;
    }
    return [];
  }, []);

  const fetchProducts = useCallback(async (categorySlug: string, searchTerm?: string) => {
    setProductsLoading(true);
    setProductsError(null);

    try {
      const params = new URLSearchParams();
      params.set('category_slug', categorySlug);
      params.set('include_descendants', 'true');
      if (searchTerm?.trim()) {
        params.set('search', searchTerm.trim());
      }

      const res = await fetch(`http://localhost:8000/api/products/?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }
      const data = await res.json();
      setProducts(normalizeProductList(data));
    } catch (err: unknown) {
      setProductsError(getErrorMessage(err, 'Failed to fetch products'));
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [normalizeProductList]);

  useEffect(() => {
    if (selectedCategorySlug) {
      fetchProducts(selectedCategorySlug);
    } else {
      setProducts([]);
      setProductsError(null);
      setEditingProduct(null);
    }
  }, [fetchProducts, selectedCategorySlug]);

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
        .catch(err => {
          const message = err?.message || 'Error fetching children';
          showErrorPopup(message);
        });
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
        .catch(err => {
          const message = err?.message || 'Error fetching children';
          showErrorPopup(message);
        });
    }
  };

  const handleCreateSubcategory = async () => {
    if (!newSubcategoryName.trim()) {
      const message = 'Subcategory name is required';
      setError(message);
      showErrorPopup(message);
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
        const converted = await convertImageToJpegOrPng(newCategoryImageFile);
        formData.append('image', converted);
      }

      const res = await fetch('http://localhost:8000/api/categories/', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        const message =
          errorData.image?.[0] ||
          errorData.non_field_errors?.[0] ||
          errorData.detail ||
          'Failed to create subcategory';
        throw new Error(message);
      }

      const newCategory = await res.json();
      setCurrentCategories([...currentCategories, newCategory]);
      setShowCreateSubcategory(false);
      setNewSubcategoryName('');
      setNewSubcategorySlug('');
      setNewCategoryImageFile(null);
      setNewCategoryImagePreview(null);
      setError(null);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to create subcategory');
      setError(message);
      showErrorPopup(message);
    }
  };

  const handleNewCategoryImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const converted = await convertImageToJpegOrPng(file);
      setNewCategoryImageFile(converted);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCategoryImagePreview(reader.result as string);
      };
      reader.readAsDataURL(converted);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to process image');
      setError(message);
      showErrorPopup(message);
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
        const converted = await convertImageToJpegOrPng(file);
        formData.append('image', converted);
      } else {
        formData.append('image', '');
      }

      const res = await fetch(`http://localhost:8000/api/categories/${target.id}/`, {
        method: 'PATCH',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        const message =
          errorData.image?.[0] ||
          errorData.non_field_errors?.[0] ||
          errorData.detail ||
          'Failed to update category image';
        throw new Error(message);
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
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to update category image');
      setCategoryImageError(message);
      showErrorPopup(message);
    } finally {
      setCategoryImageUpdating(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const converted = await convertImageToJpegOrPng(file);
      setImageFile(converted);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(converted);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to process image');
      setError(message);
      showErrorPopup(message);
    }
  };

  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const converted = await convertImageToJpegOrPng(file);
      setEditImageFile(converted);
      setEditRemoveImage(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreview(reader.result as string);
      };
      reader.readAsDataURL(converted);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to process image');
      setEditError(message);
      showErrorPopup(message);
    }
  };

  const startEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      product_id: product.product_id,
      name: product.name,
      price: product.price?.toString() || '',
      description: product.description || '',
      category: product.category ? product.category.toString() : '',
      colour: product.colour || '',
      material: product.material || '',
      is_best_seller: product.is_best_seller,
      is_new: product.is_new,
    });
    setEditImageFile(null);
    setEditRemoveImage(false);
    setEditImagePreview(product.image_url || null);
    setEditError(null);
  };

  const handleEditCancel = () => {
    setEditingProduct(null);
    setEditError(null);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditRemoveImage(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingProduct) return;

    if (!editForm.product_id.trim()) {
      const message = 'Product ID is required';
      setEditError(message);
      showErrorPopup(message);
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const formData = new FormData();
      formData.append('product_id', editForm.product_id);
      formData.append('name', editForm.name);
      formData.append('price', editForm.price);
      formData.append('description', editForm.description);
      if (editForm.category) {
        formData.append('category', editForm.category);
      }
      formData.append('colour', editForm.colour);
      formData.append('material', editForm.material);
      formData.append('is_best_seller', editForm.is_best_seller.toString());
      formData.append('is_new', editForm.is_new.toString());

      if (editRemoveImage) {
        formData.append('image', '');
      } else if (editImageFile) {
        formData.append('image', editImageFile);
      }

      const res = await fetch(`http://localhost:8000/api/products/${editingProduct.id}/`, {
        method: 'PATCH',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        const message =
          errorData.image?.[0] ||
          errorData.product_id?.[0] ||
          errorData.non_field_errors?.[0] ||
          errorData.detail ||
          'Failed to update product';
        throw new Error(message);
      }

      const updated = await res.json();
      setProducts(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setEditingProduct(updated);
      setEditImageFile(null);
      setEditRemoveImage(false);
      setEditImagePreview(updated.image_url || null);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to update product');
      setEditError(message);
      showErrorPopup(message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    const confirmed = window.confirm(`Delete ${product.name}? This cannot be undone.`);
    if (!confirmed) return;

    setDeleteLoadingId(product.id);

    try {
      const res = await fetch(`http://localhost:8000/api/products/${product.id}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        const message = errorData.detail || 'Failed to delete product';
        throw new Error(message);
      }

      setProducts(prev => prev.filter(item => item.id !== product.id));
      if (editingProduct?.id === product.id) {
        handleEditCancel();
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to delete product');
      showErrorPopup(message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleProductSearch = () => {
    if (selectedCategorySlug) {
      fetchProducts(selectedCategorySlug, productSearch);
    }
  };

  const validateProductId = async (productId: string): Promise<boolean> => {
    if (!productId.trim()) return true; // Empty is OK, will be validated on submit
    
    try {
      const res = await fetch(`http://localhost:8000/api/products/?product_id=${productId}`);
      const data = await res.json();
      const list = normalizeProductList(data);
      return list.length === 0; // True if no product exists with this ID
    } catch {
      return true; // Assume valid if check fails
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (selectedPath.length === 0) {
      const message = 'Please select a category';
      setError(message);
      showErrorPopup(message);
      setSaving(false);
      return;
    }

    if (!productForm.product_id.trim()) {
      const message = 'Product ID is required';
      setError(message);
      showErrorPopup(message);
      setSaving(false);
      return;
    }

    // Validate product_id uniqueness
    const isUnique = await validateProductId(productForm.product_id);
    if (!isUnique) {
      const message = 'A product with this product_id already exists';
      setError(message);
      showErrorPopup(message);
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
        const message =
          errorData.image?.[0] ||
          errorData.product_id?.[0] ||
          errorData.non_field_errors?.[0] ||
          errorData.detail ||
          'Failed to create product';
        throw new Error(message);
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
      if (selectedCategorySlug) {
        fetchProducts(selectedCategorySlug);
      }
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to create product');
      setError(message);
      showErrorPopup(message);
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
                      position: 'relative',
                    }}>
                      {newCategoryImagePreview ? (
                        <NextImage
                          src={newCategoryImagePreview}
                          alt="Category preview"
                          fill
                          sizes="72px"
                          style={{ objectFit: 'cover' }}
                          unoptimized
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
                  position: 'relative',
                }}>
                  {selectedPath[selectedPath.length - 1].image_url ? (
                    <NextImage
                      src={selectedPath[selectedPath.length - 1].image_url as string}
                      alt="Category"
                      fill
                      sizes="96px"
                      style={{ objectFit: 'cover' }}
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
                    position: 'relative',
                  }}>
                    <NextImage
                      src={imagePreview}
                      alt="Preview"
                      fill
                      sizes="150px"
                      style={{ objectFit: 'cover' }}
                      unoptimized
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

      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.25rem' }}>Products</h3>
            <div className="muted" style={{ fontSize: '0.9rem' }}>
              {selectedCategoryName ? `Showing products in ${selectedCategoryName}` : 'Select a category to view products.'}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => selectedCategorySlug && fetchProducts(selectedCategorySlug, productSearch)}
            disabled={!selectedCategorySlug || productsLoading}
          >
            {productsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="Search products"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            style={{ flex: '1 1 220px' }}
            disabled={!selectedCategorySlug}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleProductSearch}
            disabled={!selectedCategorySlug || productsLoading}
          >
            Search
          </button>
        </div>

        {productsError && (
          <div style={{
            padding: '0.8rem',
            backgroundColor: 'rgba(255, 107, 107, 0.15)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            color: 'var(--danger)',
          }}>
            {productsError}
          </div>
        )}

        {!selectedCategorySlug ? (
          <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
            Select a category to manage products.
          </div>
        ) : productsLoading ? (
          <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
            No products found in this category.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--edge)' }}>
                  <th style={{ padding: '0.6rem' }}>Image</th>
                  <th style={{ padding: '0.6rem' }}>Product ID</th>
                  <th style={{ padding: '0.6rem' }}>Name</th>
                  <th style={{ padding: '0.6rem' }}>Price</th>
                  <th style={{ padding: '0.6rem' }}>Flags</th>
                  <th style={{ padding: '0.6rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.6rem' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', backgroundColor: 'rgba(245, 242, 234, 0.08)' }}>
                        {product.image_url ? (
                          <NextImage
                            src={product.image_url}
                            alt={product.name}
                            width={56}
                            height={56}
                            style={{ objectFit: 'cover' }}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{product.product_id}</td>
                    <td style={{ padding: '0.6rem' }}>{product.name}</td>
                    <td style={{ padding: '0.6rem' }}>¥{Number(product.price).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--ink-3)', fontSize: '0.85rem' }}>
                      {product.is_best_seller ? 'Best seller' : ''}
                      {product.is_best_seller && product.is_new ? ' · ' : ''}
                      {product.is_new ? 'New' : ''}
                    </td>
                    <td style={{ padding: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-outline" onClick={() => startEditProduct(product)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleDeleteProduct(product)}
                          disabled={deleteLoadingId === product.id}
                        >
                          {deleteLoadingId === product.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingProduct && (
          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--edge)' }}>
            <h4 style={{ marginBottom: '1rem' }}>Edit product</h4>

            {editError && (
              <div style={{
                padding: '0.8rem',
                backgroundColor: 'rgba(255, 107, 107, 0.15)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
                color: 'var(--danger)',
              }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Product ID *</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.product_id}
                    onChange={(e) => setEditForm({ ...editForm, product_id: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Category</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input"
                      value={editingProduct.category_name || 'Unassigned'}
                      readOnly
                      style={{ backgroundColor: 'rgba(245, 242, 234, 0.05)' }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        if (selectedCategoryId) {
                          setEditForm({ ...editForm, category: selectedCategoryId.toString() });
                        }
                      }}
                      disabled={!selectedCategoryId}
                    >
                      Use selected
                    </button>
                  </div>
                  {selectedCategoryName && (
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                      Selected category: {selectedCategoryName}
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label>Name *</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Description</label>
                  <textarea
                    className="textarea"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={4}
                  />
                </div>

                <div className="form-field">
                  <label>Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setEditImageFile(null);
                        setEditRemoveImage(true);
                        setEditImagePreview(null);
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                  {editImagePreview ? (
                    <div style={{
                      width: '150px',
                      height: '150px',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      marginTop: '0.5rem',
                      position: 'relative',
                    }}>
                      <NextImage
                        src={editImagePreview}
                        alt="Preview"
                        fill
                        sizes="150px"
                        style={{ objectFit: 'cover' }}
                        unoptimized
                      />
                    </div>
                  ) : (
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
                    value={editForm.colour}
                    onChange={(e) => setEditForm({ ...editForm, colour: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label>Material</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.material}
                    onChange={(e) => setEditForm({ ...editForm, material: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={editForm.is_best_seller}
                      onChange={(e) => setEditForm({ ...editForm, is_best_seller: e.target.checked })}
                    />
                    Best seller
                  </label>
                </div>

                <div className="form-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={editForm.is_new}
                      onChange={(e) => setEditForm({ ...editForm, is_new: e.target.checked })}
                    />
                    New product
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-outline" onClick={handleEditCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
