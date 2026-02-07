# Plan: Reviews, Ratings, Category Images, Product Page

TL;DR

Add customer-driven reviews and aggregated ratings, model staff vs customers (linked to existing `User`), add a `Review` model and wire product rating/ratingCount into the product API, add category image upload/replace in the ERP product/category UI (multipart file upload to backend media storage), and implement a product detail page (`/p/[slug]`) with IKEA-inspired layout that surfaces rating stars and rating counts both in product grids and on the detail page. Prepare backend, API, and frontend changes so the system is ready to accept customer reviews later.

---

**Why**

- Ratings must come from customer reviews, not staff. We need a `Review` model and customer profiles, even if customers are not yet signing up. Preparing the data model and API now avoids breaking changes later.
- Category images are important for the store UI; staff should be able to upload or replace images from the ERP. The backend already supports media storage — we will use file upload (multipart) to the existing media storage instead of only URL text fields.
- Product detail page is currently missing; we will create a dedicated, polished `/p/[slug]` page inspired by IKEA product pages and show ratings and review counts everywhere a product appears.

---

## Summary of changes (high level)

- Backend (Django)
  - Add `Review` model (`product` FK, `user` FK, `rating` int 1..5, `title`, `body`, `created_at`, optional `verified_purchase` boolean).
  - Ensure `User` is used for both staff and customers. Add lightweight profile distinction: either a `User.is_staff` (existing) and `CustomerProfile` model (optional) OR a `role` enumeration on `User` (recommended: profile model for extensibility). Document the recommended approach in the plan.
 - Ensure `User` is used for both staff and customers. Add a lightweight `CustomerProfile` model (OneToOne to `User`) for customer-specific fields. Keep using `is_staff` for ERP staff. Document the recommended approach in the plan (see security rationale below).
  - Add `Product` computed properties or annotated fields for `rating` (avg float) and `rating_count` (int). Expose these through the `ProductSerializer` as `rating` (rounded to 1 decimal) and `ratingCount` (int).
  - Ensure category model uses an `ImageField` or existing file-backed field for `image` (not only URL text). Accept multipart form data for category create/update via DRF.
  - Add migrations, admin registration for `Review` and `Category` image management.
  - Add API endpoints/filters: POST `api/reviews/` (create review), GET product detail includes aggregated rating info, return `reviews` list (paginated) for a product if requested.

- Frontend (Next.js)
  - ERP: in the category creation UI (`/erp/products` category picker / create subcategory flow), add a required image upload field (file input) when creating a new category. On existing categories, add a clear "Replace image" button that opens a file picker and uploads multipart to the backend; provide a "Remove image" action as well.
  - ERP: ensure category create/update uses `FormData` and includes the file under the key the backend expects (e.g., `image` or `image_file`). Preserve existing UX for name/slug and add client-side preview.
  - Storefront: add product rating and rating count to product cards in grids (category pages, search results). Show stars (visual) and the number (e.g., ★★★★☆ (541)). Use the screenshot in the repository for styling guidance; follow the `frontend-design` skill for the `/p/[slug]` layout.
  - Storefront: implement `/p/[slug]` product detail page that fetches product by slug and displays image gallery, title, price, rating stars + count, buy CTA(s), product details, and related products. Follow IKEA-like visual hierarchy and spacing using existing CSS variables and fonts.

- Tests & Data
  - Add model tests for `Review` aggregation and `Product` rating calculations.
  - Provide a simple management command or migration data seed (optional) to populate a few reviews for demo products so UI can be validated locally.

---

## Detailed plan (step-by-step)

1. Backend model changes
   1. Add a `Review` model in `django_backend/core/models.py`:
      - Fields: `product` (FK), `user` (FK to settings.AUTH_USER_MODEL), `rating` (PositiveSmallIntegerField, 1..5), `title` (optional), `body` (TextField optional), `created_at` (DateTimeField auto_now_add), `verified_purchase` (BooleanField default False).
      - Index `product, created_at` for fast lookup and ordering.
   2. Customer vs Staff modelling
         - Recommended: add a lightweight `CustomerProfile` model with OneToOne to `User` for customer-specific fields (shipping address, phone, loyalty id). Keep using `is_staff` for ERP staff. Document why: profiles are easier to extend and don't change auth flows.
            - Security & auth centralization rationale: keeping a single `User` auth model and adding a `CustomerProfile` preserves the existing authentication flow and avoids touching auth-backend logic. Authorization decisions are enforced centrally by the backend (DRF permissions) so frontends only need to call protected endpoints. This reduces chances of inconsistent role handling across services and prevents privilege escalation bugs caused by duplicated role fields in multiple places.
            - Centralized auth pattern: backend enforces permissions (e.g., only authenticated users can post reviews; staff-only endpoints use `is_staff`), and frontend uses a single auth hook/provider (shared across store and ERP) to gate UI flows (e.g., show "Write a review" only when authenticated).
         
   3. Product aggregation
      - Use ORM annotations or model methods to compute `avg_rating` and `rating_count`.
      - Expose these values via `ProductSerializer` as `rating` and `ratingCount`.
   4. Category image field
      - Ensure `Category` model has an `ImageField` or `FileField` (e.g., `image = models.ImageField(upload_to='category_images/', null=True, blank=True)`), and make sure serializers accept file uploads and return absolute URLs.
   5. Serializers and ViewSets
      - Add `ReviewSerializer` and `ReviewViewSet` (create/list). Require authentication for creating reviews and enforce `verified_purchase` (see review rules below). Do not allow anonymous reviews.
      - Modify `ProductSerializer` to include `rating` and `ratingCount` as read-only fields.
      - Modify `CategorySerializer` to accept `image` file uploads on create/update.
   6. Routes & permissions
      - Register `reviews` endpoints in router (e.g., `/api/products/<pk>/reviews/` or `/api/reviews/`) and add permissions (authenticated users for posting).
   7. Admin
      - Register `Review` and `Category` in Django admin, allow staff to moderate reviews.

2. API behavior and contract
   - `GET /api/products/` and `GET /api/products/<id>/` include `rating` (float) and `ratingCount` (int).
   - `POST /api/reviews/` body: `product`, `rating`, `title`, `body` (user taken from auth). Return created review.
   - `POST /api/categories/` and `PUT/PATCH /api/categories/<id>/` accept multipart file field `image`.
   - Keep backwards compatibility: if `image_url` text field exists, continue supporting it for a transition period but prefer `image` file uploads.

3. Frontend ERP changes
    - Update the create-subcategory modal or form in `nextjs_frontend/songfei/src/app/erp/products/page.tsx`:
       - Add a file input `accept="image/*"` labelled "Category image (recommended)".
       - Make image optional for newly created categories but show a prominent, dismissible toast warning that adding a category image is highly recommended for storefront discoverability.
     - On submit, send `FormData` with the image file under `image` and other fields as before.
     - For editing existing categories, show current image thumbnail and add two actions: "Replace image" (file picker) and "Remove image" (confirm -> send a patch with `image: null`).
     - Implement client-side preview using `URL.createObjectURL()` and validate image size (<5MB) and type.

4. Frontend Store changes
   - Product grid cards: fetch and show `rating` and `ratingCount`. Display fractional stars up to 5 (supporting partial fills with smooth masks; do not snap to halves). Show numeric `ratingCount` next to stars styled like the screenshot.
   - Product detail page `/p/[slug]`:
     - Create `nextjs_frontend/songfei/src/app/p/[slug]/page.tsx` and follow layout patterns from `cat/[slug]/page.tsx` while applying `frontend-design` guidance (clear visual hierarchy, large product image area, right column for price + CTA + ratings, long description below, related products carousel).
     - Include review list (paginated) and a CTA to "Write a review" which prompts login or shows a small form for authenticated customers.

5. Tests and seed data
   - Add unit tests for `Review` creation and `Product` annotation (average rating computation and count).
   - Add a management command `seed_demo_reviews` (optional) that creates several `Review` rows for demo products to populate UI locally.

6. Migration & deploy notes
   - Create and run migrations for `Review` and `Category.image` changes.
   - If using local development, confirm `MEDIA_URL` and `MEDIA_ROOT` settings allow serving uploaded files in DEBUG mode.
   - Communicate to devs that category images are stored under `category_images/` and product images under `product_images/` (or keep current structure if already present).

---

## UX details and wireframes (text)

- ERP category creation flow
  - Step: "Add subcategory"
  - Fields: `Name`, `Slug (auto)`, `Parent (implicit)`, `Category image` (file input) — show a 3:2 thumbnail preview.
  - Buttons: `Create` (sends `FormData`), `Cancel`.
  - On success: show toast "Category created" and link to category edit.
  - Category edit: thumbnail + `Replace image` button + `Remove image` link (remove sets image to null).

- Product grid card (compact)
  - Image (square)
  - Name (line-limited)
  - Price
  - Rating: star icons + `(`ratingCount`)` — e.g. ★★★★☆ (541)

- Product detail page (IKEA-inspired)
  - Left: big image (gallery thumbnails below)
  - Right: title, short descriptor, price (large), rating row (stars + count), buy CTA, wishlist, details accordion
  - Below: long description, specs, reviews (list + write form)

---

## Open questions / decisions for you

1. Roles & profiles: prefer adding a lightweight `CustomerProfile` model (OneToOne to `User`) and keeping `is_staff` for ERP staff, or prefer a `role` field on `User`? I recommend profiles for future extension.
2. Should category images be required on create, or optional but strongly recommended? I recommend optional required on create only if you want a high-quality storefront immediately.
3. For reviews: do we want anonymous reviews (allow unauthenticated submissions) or require login/purchase? Recommended: require authenticated users; mark `verified_purchase` later when purchase records exist.

---

If you confirm the open questions, I will create the backend model and serializer changes and propose the exact API contract (field names) and the frontend form/patch code. I can also implement the ERP UI changes and the new product detail page next.  

File: [plan/reviews-ratings-category-images-product-page.plan.md](plan/reviews-ratings-category-images-product-page.plan.md)
