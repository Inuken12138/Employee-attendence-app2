# Plan: ERP Products CRUD (Interactive)

## Goal
Enable staff to perform full CRUD operations on products from `http://localhost:3000/erp/products`:
- Create products (already exists)
- View/list products
- Update product fields (name, price, description, attributes), image, and assigned category
- Delete products

This should be interactive and efficient for daily ERP use.

---

## Current state
- The ERP page creates products via `POST /api/products/` using multipart `FormData`.
- Category selection exists and can create categories + upload category images.
- No UI to list, edit, or delete existing products.

---

## Backend assumptions / API
Existing backend endpoints (DRF `ModelViewSet`):
- List products: `GET /api/products/`
- Filter/search: `GET /api/products/?search=...`, `?category=...`, `?category_slug=...`
- Create product: `POST /api/products/` (multipart)
- Update product: `PATCH /api/products/:id/` (multipart)
- Delete product: `DELETE /api/products/:id/`

Notes:
- For updates, use `PATCH` and send only changed fields.
- For image replace: include `image` file in `FormData`.
- For category change: send `category=<newCategoryId>`.

---

## Frontend UX design (ERP)
Single page, two-panel workflow:

### Left panel: Category + Context
- Existing category picker remains.
- When editing a product, show a “Change category” mode:
  - Default: show current category
  - Optional: click “Change category” to pick a new leaf category

### Right panel: Product form (Create / Edit)
- Two modes:
  - Create mode (default)
  - Edit mode (when staff clicks “Edit” on a product)

Edit mode requirements:
- Pre-fill all fields from the selected product
- Allow saving changes (`PATCH`)
- Allow cancelling edit (returns to create mode)
- Support image replacement (optional)

### Products list panel (below or side)
- A table/grid listing products with:
  - product_id, name, price, category name
  - status tags: best seller / new
  - rating (stars + count) read-only
  - actions: Edit, Delete
- Search input (client-side filter or API search)
- Optional category filter: show products under selected leaf or selected branch

### Deleting
- Confirm dialog before delete
- After delete, refresh list and clear edit form if the deleted product was being edited

---

## Implementation steps
1. Add product list state and fetch logic
   - Load products on page mount
   - Add refresh function after create/update/delete

2. Add edit mode to product form
   - `editingProductId` state
   - Populate form + category selection from chosen product

3. Implement update flow
   - `PATCH /api/products/:id/` with `FormData`
   - Update UI messages (“Updated successfully”)

4. Implement delete flow
   - `DELETE /api/products/:id/`
   - Refresh list and show success/error status

5. UI polish
   - Clear “Create vs Edit” header state
   - Disable buttons while saving
   - Keep current dark theme and typography

---

## Optional: Git worktree
Create a dedicated worktree for this feature so changes are isolated:
- Create branch `feature/erp-products-crud`
- Add worktree directory (outside the current working tree)

This supports parallel development and easy rollback.
