# Plan: 3D Kitchen Designer (Three.js + React Three Fiber)

Date: 2026-03-06
Status: Draft v0.1 — discovery in progress

## Product vision
Build a browser-based 3D kitchen designer inspired by the IKEA kitchen planner experience: a customer-first planning tool that lets customers design a kitchen from home, collaborate with store reps when needed, validate the result algorithmically, and place an order without requiring a manual in-store approval step.

This draft is intentionally incomplete. It will be updated as requirements are clarified.

---

## Working assumptions
- Frontend stack: Three.js + React Three Fiber.
- Expected UI shell: React/Next.js storefront-style app.
- The designer should feel approachable for non-technical users, not like a raw CAD tool.
- The product is customer-first: customers are the primary owners of kitchen designs.
- Sales reps are collaborators and advisors, not the owners of customer projects.
- The first release must support production-ready validation and a path to direct purchase.
- 3D assets are not pre-seeded initially; staff upload models and metadata through the ERP, and the planner consumes that catalog.
- Kitchen-designer items are extensions of normal ecommerce products, not a separate product universe.

These assumptions will be revised as answers come in.

---

## Core user journey candidates
1. Start a new kitchen design.
2. Define room shape and dimensions.
3. Add walls, windows, doors, and utility constraints.
4. Place base cabinets, wall cabinets, tall cabinets, appliances, and countertop runs.
5. Swap materials, colors, handles, and fronts.
6. Inspect the design in 3D with orbit / pan / zoom and see running price feedback.
7. Share the design by link for read-only viewing or duplicate-based collaboration.
8. Run a final validation pass with itemized issues and optional 3D issue highlighting.
9. Review the final 3D design, 2D floor plan, and measured 2D component layouts.
10. Choose a next step: add to bag, request rep help, book an appointment, or visit a store.
11. Purchase directly without mandatory store intervention when the design passes validation.

---

## Tentative product scope layers

### Layer 1 — MVP planner
- Rectangular room setup
- Wall length editing
- Basic drag-and-drop cabinet placement
- Snap to wall / floor grid
- Rotate, move, duplicate, delete
- Camera presets
- Save/load local projects
- Named project versions
- View-only share links
- Duplicate-to-own-account collaboration flow

### Layer 2 — Guided kitchen planning
- Doors and windows
- Collision rules
- Corner cabinet logic
- Appliance placement
- Countertop auto-generation
- Measurement overlays
- Material / finish switching

### Layer 3 — Commercial planner features
- Price estimation
- SKU-backed product catalog
- Rules engine for incompatible combinations
- Direct order readiness after validation
- Quote / PDF export
- Shareable project links
- Multi-room or island support
- ERP-driven 3D asset ingestion
- Bag/cart integration with protected BOM editing rules
- Rep-assist attribution and commission records

---

## Proposed technical direction

### Frontend architecture
- `react-three-fiber` for the 3D scene graph and rendering.
- `@react-three/drei` for camera controls, helpers, and interaction primitives.
- A dedicated planner state store for room geometry, catalog items, placement metadata, camera state, and selection state.
- A customer-friendly application shell with regular React UI for catalog browsing, sharing, checkout, and project history, plus the 3D canvas for spatial composition.

### Supporting platform systems
1. ERP catalog ingestion pipeline for SKU, price, dimensions, 3D assets, finishes, and compatibility rules.
2. Customer project ownership and collaboration permissions.
3. Named version history with restore/revert support.
4. Algorithmic validation engine that gates checkout.
5. Pricing, BOM, checkout, and fulfillment handoff.
6. Rep-assist attribution with customer confirmation.

### Likely subsystems
1. Room model
2. Cabinet/product catalog model
3. Placement and snapping engine
4. Constraint / validation engine
5. Camera and interaction system
6. Persistence and project serialization
7. Pricing / BOM engine
8. Collaboration and permissions engine
9. ERP asset ingestion and publishing pipeline
10. Final-review document generation engine for 2D measured outputs

---

## Step-by-step planning roadmap

### Phase 1 — Discovery and product definition
1. Define target user and collaboration model between customer and rep.
2. Define success metric for v1.
3. Decide how close to IKEA the workflow should be.
4. Define required outputs: save, share, version, price, order, fulfillment.

### Phase 2 — Experience design
1. Map the ideal planner flow from empty canvas to completed design.
2. Decide whether the app begins in 2D, 3D, or a split view.
3. Decide how much guidance the user gets: freeform vs wizard.
4. Define the editing interaction model for desktop and mobile.

### Phase 3 — Spatial modeling foundation
1. Decide room shapes supported in v1.
2. Define coordinate system, units, snapping increments, and wall references.
3. Model doors, windows, pillars, plumbing, and electrical constraints.
4. Define scene serialization format.

### Phase 4 — Cabinet and appliance system
1. Define catalog taxonomy.
2. Define cabinet parametrics vs prebuilt models.
3. Define how countertops, fillers, toe kicks, and handles are generated.
4. Define validation rules for overlaps, clearance, and unsupported combinations.
5. Define interactive metadata for doors, drawers, pivots, and open-clearance envelopes.

### Phase 5 — Visual fidelity and UX polish
1. Materials, lighting, shadows, and environment presets.
2. Camera presets such as walkthrough, front elevation, and top-down.
3. Measurement overlays and interaction hints.
4. Performance targets for medium and large rooms.

### Phase 6 — Persistence and commercial workflow
1. Save/load projects.
2. Named version history and restore.
3. Shareable links and duplicate-to-own-account collaboration.
4. Export images / PDF / parts list.
5. Pricing integration, add-to-bag flow, checkout readiness, and order handoff.

### Phase 7 — QA and rollout
1. Placement edge-case testing.
2. Device/browser compatibility testing.
3. Performance optimization.
4. User testing with non-expert planners.

---

## Initial functional decision areas to clarify
- Is this mainly a consumer-facing kitchen planner or an internal sales/design tool?
- Is the first release focused on fast inspiration, precise planning, or quote generation?
- Does the project need a real product catalog and pricing from day one?
- Should users define custom room shapes, or only choose from templates at first?
- Do you want true cabinet configuration rules, or just a visual composer for v1?
- Should the result be saved in a backend account system, or only locally at first?
- Is mobile support required initially, or desktop-first only?

---

## Open questions log
### Confirmed in discovery round 1
- Primary product principle for v1: customer-first ownership.
- Customers are the primary users/owners of designs, whether they design at home or work with a rep.
- Main v1 goal: order-ready design.
- Room setup for v1: custom polygon room definition.
- Required outputs in first usable version:
	- save projects
	- shareable link
	- export images
	- parts list / bill of materials
	- price estimate
	- printable PDF

### Implications of these decisions
- The planner cannot be a lightweight inspiration toy; it needs stronger dimensional accuracy and commercial workflow support.
- The room editor must support non-rectangular geometry early, not as a later enhancement.
- The data model needs project persistence, backend storage, quote artifacts, and BOM-friendly catalog structures.
- The UI should optimize for self-serve customer planning first, with collaborative rep assistance as a secondary flow.

### Confirmed in discovery round 2
- Catalog for v1: real SKUs.
- Primary editing model: 3D-first editing.
- Validation strictness: near-production constraints.
- Supported devices for v1:
	- desktop editing is required
	- mobile viewer support is required

### Additional implications
- The catalog layer needs SKU-linked metadata, pricing fields, and compatibility attributes very early in the project.
- A 3D-first workflow means manipulation controls, snapping feedback, selection affordances, and camera presets must be excellent.
- Near-production validation means the planner needs a substantial rule engine, not just collision detection.
- Mobile can be treated as a review/share surface instead of a full editing environment for v1.

### Confirmed in discovery round 3
- Project ownership: customer-owned projects.
- Mandatory room constraints in v1:
	- doors
	- windows
	- pillars
	- plumbing constraints
	- electrical constraints
	- ceiling height
- Finish/detail depth: highly configurable visual options.
- Checkout/order principle: no manual approval step; the system must algorithmically validate the design and allow direct purchase when production-ready.

### Additional implications
- The project domain model should center around a customer record and attach designs, BOMs, orders, and collaboration history to that customer.
- Geometry editing must support both floor-plan constraints and vertical constraints such as window sill height and tall cabinet conflicts.
- The visual customization layer is large: cabinet fronts, handles, countertop materials, panels, and appliance finishes likely need independent option sets.
- Checkout is not a simple export; it requires strong validation gates, versioning, and a clean transition from design to order.

### Confirmed in discovery round 4
- A rep may assist a customer in person or remotely, but does not own the customer design.
- Customers can share a design link for viewing.
- If a rep wants to edit, the rep duplicates the design into their own account and works on that copy.
- The rep then shares the new design back to the customer, who can view or duplicate it again.
- Collaboration should prefer duplication over shared mutable editing in v1.
- Named versions remain useful within a design, but cross-account collaboration is based on copy/share rather than live co-editing.
- At launch, catalog content is created through the ERP: staff upload 3D models plus metadata such as SKU and price, and the kitchen designer consumes published catalog entries.
- There is no major technical separation between customer and rep accounts for the planner itself; the main business difference is rep-assist attribution and commission tracking.

### Additional implications from round 4
- The permission model can be simplified for v1: owner + public/private share behavior, while editable collaboration is implemented through duplication.
- Collaboration is asynchronous and copy-based, which removes complex concurrent-edit conflict handling from v1.
- Version history should still capture author, timestamp, label, and restore target metadata within a single owned design.
- The ERP and planner cannot be treated as separate universes; a catalog publishing workflow is a core dependency.
- Asset ingestion must validate model formats, dimensions, orientation, and required metadata before items become usable in the planner.

### Confirmed in discovery round 5
- Preferred 3D asset format for v1: `.glb`.
- Recommended asset pipeline: Blender/export-compatible tool -> `.glb` -> web delivery in React Three Fiber.
- Preferred interaction style for moving parts: code-driven interactions and metadata-driven pivots, rather than relying mainly on baked animations.
- Price estimate should be visible during design, not only at the end.
- When the user clicks `Continue`, the system should run a final validation pass.
- If validation fails, issues should be shown in an itemized list, with an option to visualize problems in 3D.
- If validation passes, the system should show:
	- final 3D design preview
	- 2D top-down floor plan
	- 2D component layouts
	- benchtop views
	- face/elevation views
	- precise millimeter measurements
- After successful validation, the system should see several next-step options instead of a single checkout path.
- One supported path is `Add to bag`, which sends the BOM into the normal ecommerce cart.
- Kitchen-designer-derived cart items must remain locked from direct quantity editing/removal in the cart UI; users are redirected back to the designer for modifications.
- Another supported path is rep/store assistance, including rep review and appointment booking.
- The platform should also include a store-locator experience that supports multiple locations.
- The Django product model should be extended so a normal ecommerce product can optionally become a kitchen-designer-capable product.
- ERP product management should add an `enable 3d kitchen designer` option that reveals extra metadata fields such as `.glb` upload and planner constraints.

### Confirmed in discovery round 6
- `Start validation` and `Book appointment` should be merged into one assisted-design flow.
- The preferred rule model is `hard rules + soft rules`:
	- hard rules block impossible placements immediately
	- soft rules warn and suggest fixes
	- final validation still runs a full audit before the user proceeds
- Catalog availability should require a staging step before publish.
- The store-locator page should include an embedded map plus store cards.

### Confirmed in discovery round 7
- Reps should be able to mark a design as `certified` / store-reviewed for customer reassurance.
- Rep assistance/commission should be confirmed explicitly by the customer.
- Required 2D outputs for the target product vision include:
	- floor plan
	- elevations
	- benchtop plan
	- cabinet layouts
	- install pack
	- manufacturing pack
- Catalog scope for v1 is still undecided, so the data model should stay open enough for future expansion.

### Confirmed in discovery round 8
- Advanced installer/manufacturing packs should be phased after the first release.
- The first real release should assume a focused pilot catalog of fewer than 100 SKUs.
- Business scope for v1 should ship narrow, but the schema should remain extensible for future collections/brands.
- The embedded store map should use Leaflet/OpenStreetMap in v1.

### Confirmed in discovery round 9
- Rep certification should be available on the customer's shared design without requiring the rep to own a duplicate.
- Assisted-design flow should let the customer either choose a store/rep or let the system assign one.
- Rep commission confirmation should happen after checkout/order completion.
- After a rep-assisted appointment, the system should email the customer asking whether the rep helped.
- The customer confirmation action should be a simple yes/no response.
- If the customer does not respond, the system should send a reminder after one week.

### Additional implications from round 5
- The checkout model is hybrid: one validated kitchen design produces a normal cart-compatible BOM, but that BOM remains governed by the originating design.
- The cart needs linkage back to the source design so pricing, quantities, and removability stay synchronized with the design state.
- The planner needs a final-review page generator capable of producing measured 2D artifacts from the 3D scene.
- The ERP needs an intuitive non-technical constraint authoring UX, not raw JSON or code entry.
- The designer and ecommerce product model should converge around an extended product schema instead of introducing a fully separate kitchen-item entity.

### Additional implications from round 6
- Assisted review and in-store booking can share one entry point and diverge only after the customer chooses remote vs in-person help.
- The rule engine should explicitly separate hard blockers from soft advisory issues.
- Staging-before-publish means ERP needs a preview/testing state for planner-enabled products.
- The store directory experience should support multiple locations from the start and pair location cards with a map surface and external navigation links.

### Additional implications from round 7
- Although checkout is algorithmic, the platform also needs a non-blocking `rep-certified` or `store-reviewed` state for customers who want extra reassurance.
- Commission logic needs an auditable confirmation event from the customer, not just passive attribution.
- The drawing/output engine may eventually need to support installer-grade and manufacturing-grade artifacts, which significantly raises geometry and rules precision requirements.
- Because catalog scope is undecided, schema design should avoid assumptions that only one collection or one brand will ever exist.

### Additional implications from round 8
- V1 scope should stay disciplined around planning-quality outputs and defer full manufacturing-pack complexity.
- A sub-100-SKU pilot catalog makes it realistic to launch with richer metadata and tighter validation per item.
- Extensible schema matters, but the initial UX can stay optimized for a single curated kitchen assortment.
- Leaflet/OpenStreetMap avoids Google Maps billing risk while still supporting an embedded multi-store locator.

### Additional implications from round 9
- Certification needs a lightweight review artifact tied to the customer design, even when the rep only has shared access.
- The assisted-help subsystem needs appointment records, participant tracking, and rep assignment history.
- Commission attribution should be deferred until an order exists, reducing false-positive commission records for casual help.
- The platform needs post-purchase email automation and a reminder workflow for rep-help confirmation.

### Remaining questions
No critical discovery blockers at this stage. The next pass can convert this draft into a formal technical architecture and delivery backlog.

---

## Revised product principles

### 1. Customer-first ownership
- Every kitchen design belongs to a customer account.
- Reps are invited collaborators, not project owners.
- In-store and remote design assistance are both supported, but ownership remains with the customer.

### 2. Algorithmic production readiness
- The system should block checkout until all hard constraints pass.
- The validation engine replaces manual approval for v1.
- A design that passes validation should be ready for ordering, fulfillment, and delivery.
- A rep/store-certified state can exist as optional reassurance, but it should not be a mandatory checkout gate.

#### Rule categories for v1
- Hard rules: impossible placements or unsafe combinations; block immediately.
- Soft rules: suboptimal but potentially resolvable issues; warn and suggest fixes.
- Final audit rules: run again at `Continue` to ensure the full design remains production-ready.

### 3. Controlled collaboration
- Shared links support read-only access in v1.
- Editable collaboration is implemented by duplicating a design into another account.
- Named versions let each owner maintain restore points within their own design history.

### 4. ERP-fed product catalog
- Staff upload 3D assets and product metadata in the ERP first.
- The planner only surfaces catalog entries that are validated and published.
- Catalog publishing should be treated as part of the kitchen-designer platform, not a side concern.

### 5. Ecommerce-native fulfillment
- A validated kitchen design should be able to feed the normal ecommerce cart.
- Cart entries derived from a kitchen design remain controlled by the design source and should not be freely edited in-cart.
- The platform should keep the flexibility to add advisory rep review and appointment booking without making those steps mandatory.

### 6. Staged catalog publishing
- Planner-enabled products should first enter a staging state.
- Staff should preview/test the planner asset and metadata before publishing.
- Only published planner-enabled products become available in the live designer.

---

## New high-priority workstreams

### Workstream A — Customer account and collaboration
1. Customer project ownership model
2. View-link sharing
3. Duplicate-to-own-account collaboration flow
4. Version timeline and restore flow

### Workstream B — Validation-to-checkout pipeline
1. Hard constraints vs soft warnings
2. Production-readiness scoring/state model
3. BOM generation from validated layouts
4. Checkout handoff and delivery data requirements
5. Final review page with 2D measured outputs

### Workstream C — ERP catalog publishing
1. 3D model upload requirements
2. Metadata schema: SKU, price, dimensions, finish compatibility, installation constraints
3. Asset validation and preview workflow
4. Staging -> publish/unpublish workflow for planner availability

### Workstream D — Product model extension
1. Extend normal product records with planner capability flags
2. Add planner asset fields such as `.glb` model and planner metadata
3. Define cart linkage between BOM line items and source design
4. Preserve rep-assist attribution/commission relationships

---

## Proposed product/data direction based on latest input

### Product extension model
Treat kitchen-designer items as enhanced ecommerce products.

Suggested direction:
- Existing product remains the base entity.
- Add planner-specific fields or a related planner profile, such as:
  - `is_kitchen_designer_enabled`
  - `designer_model_glb`
  - physical dimensions
  - install category (`base`, `wall`, `tall`, `panel`, `countertop`, `appliance`)
  - price inputs
  - constraint metadata
  - interaction metadata for doors/drawers/pivots
  - compatibility metadata for finishes and adjacent items

### ERP authoring UX direction
ERP should expose kitchen-designer metadata through guided controls, not code entry.

Possible UI sections on the ERP product page:
1. Enable for 3D kitchen designer (checkbox)
2. Upload `.glb` model
3. Enter physical dimensions in mm
4. Select product role (base cabinet, wall cabinet, tall cabinet, appliance, etc.)
5. Configure moving parts visually:
	- has left/right door
	- has drawer count
	- required door swing clearance
	- required front open space
6. Constraint templates:
	- must attach to wall
	- cannot sit under window below sill height
	- requires adjacent filler when near wall
	- needs benchtop support
	- minimum clearance to appliance/doorway
7. Compatibility selectors:
	- allowed benchtops
	- allowed handles/fronts/finishes
8. Validation preview:
	- show orientation
	- show bounding box
	- show open-door clearance envelope

### Customer/rep attribution direction
- Any shared design can generate a verified assistance record.
- Customer should explicitly confirm that a rep helped with the design.
- Confirmed help records can be used for commission tracking.
- This should be stored independently from design ownership.
- Commission confirmation should happen after checkout/order completion, using email follow-up.
- The confirmation email should provide a simple yes/no action and resend after one week if unanswered.

### Rep-certified reassurance direction
- A rep may review a customer's shared design and mark it as store-reviewed/certified.
- This certification is informational and trust-building.
- Certification does not replace algorithmic validation and does not become a required approval gate.

### Final review and proceed flow
1. User clicks `Continue` from the planner.
2. System runs final validation.
3. If issues exist:
	- show itemized list
	- allow jump-to-problem behavior
	- optionally highlight issues in 3D
4. If valid:
	- show final 3D preview
	- show measured 2D outputs
	- keep estimated price visible
5. User clicks `Proceed` and chooses one of:
	- `Add to bag`
	- assisted rep review / appointment flow
	- store locator

### Output artifact direction
- Short-term planning outputs:
	- measured floor plan
	- measured elevations
	- benchtop/top views
	- component layouts
- Longer-horizon advanced outputs (phase later):
	- install packs
	- manufacturing/factory packs
- The implementation plan should phase these carefully because production-grade output generation is materially harder than consumer-facing planning drawings.

### Store map direction
- Use Leaflet/OpenStreetMap for the embedded store map in v1.
- Each store card should still include external directions links for navigation apps.

---

## Current codebase review (scanned state)

### Backend at current stage
- The backend is a single Django app, `core`, exposed through DRF routes under `/api/`.
- Existing commerce/catalog building blocks already present:
	- `User` with roles: `manager`, `employee`, `customer`
	- `CustomerProfile`
	- `Category`
	- `Product`
	- `Purchase`
	- `Review`
- Existing ERP/operations building blocks already present:
	- `Employee`
	- `InventoryItem`
	- attendance record models
	- workplace / face-verification models
- Existing upload pattern already supports multipart requests for product/category/inventory media uploads.
- Existing product API already supports category filtering, slug lookup, search, and annotated ratings.

### Frontend at current stage
- The frontend is a Next.js App Router project with mostly client-side pages.
- Current storefront already has:
	- homepage
	- category browsing
	- product search
	- product detail page
	- reviews display
- Current ERP already has:
	- inventory CRUD
	- employee CRUD/payroll flows
	- product/category CRUD with image upload
- Current UI foundation already has:
	- reusable global styling
	- shared error popup mechanism
	- ERP and storefront layouts

### Gaps relative to the kitchen-designer goal
- No React Three Fiber / Three.js stack is installed yet.
- No centralized frontend API layer exists yet; pages mostly fetch `http://localhost:8000/api/...` directly.
- No cart/order/store-location/appointment subsystem exists yet in the scanned code.
- No planner/project/version/share/validation models exist yet.
- The current ERP product page is already large, so planner metadata should not all be added inline without restructuring.

### Architectural implications from the current codebase
- The kitchen designer should extend the current `Product` and ERP catalog workflows instead of introducing a disconnected product system.
- The lowest-risk backend path is to keep using the existing Django `core` app while introducing planner-specific modules and services in a structured way.
- The lowest-risk frontend path is to keep the App Router shell, but add a dedicated kitchen-designer feature layer instead of putting scene logic directly inside route files.

---

## Concrete technical architecture

### 1. Recommended package additions

#### Frontend
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `zustand` for planner/editor state
- `react-leaflet` + `leaflet` for store map
- `zod` for request/response validation and large form schemas

#### Optional later
- `three-mesh-bvh` for more advanced hit-testing / spatial acceleration
- `@react-three/postprocessing` for higher-fidelity rendering

### 2. Backend code organization

#### Incremental path that fits the current repository
Keep the existing `core` app for current ERP/store/auth functionality, but create the kitchen designer as a separate Django app/module so planner concerns do not continue to bloat `core`.

Suggested structure:

		django_backend/
			core/                        # existing auth, products, categories, reviews, ERP, attendance
				models.py
				serializers.py
				views.py
				urls.py
			planner/                     # new dedicated kitchen designer app
				models.py
				serializers.py
				views.py
				urls.py
				services/
					asset_validation.py
					pricing.py
					validation.py
					bom.py
					drawings.py
					collaboration.py
					certification.py
					cart_sync.py
				selectors.py
				schemas.py
			commerce/                    # cart + checkout app for the store and planner bridge
				models.py
				serializers.py
				views.py
				urls.py

Recommended responsibility split:
- `core`: existing users, customer profile, products, categories, reviews, ERP, payroll, attendance.
- `planner`: room/project/version/validation/BOM/store-assist/designer product profile.
- `commerce`: cart, cart items, checkout/order records, and the bridge between ordinary ecommerce items and kitchen-designer bundles.

This preserves the current repository shape while giving the planner and cart systems clean boundaries.

### 3. Backend data model

#### 3.1 Extend the current product model instead of replacing it
Keep `Product` as the base sellable ecommerce entity. Add a one-to-one planner profile for products that participate in the kitchen designer.

Recommended model:

- `KitchenDesignerProductProfile`
	- `product` (OneToOne -> `Product`)
	- `is_enabled`
	- `catalog_state` (`draft`, `staging`, `published`, `archived`)
	- `planner_role` (`base`, `wall`, `tall`, `panel`, `benchtop`, `appliance`, `accessory`)
	- `glb_file`
	- `glb_thumbnail` (optional preview image)
	- `width_mm`
	- `depth_mm`
	- `height_mm`
	- `bounding_box_mm` (JSON)
	- `origin_anchor` (`floor_back_left`, `center`, etc.)
	- `default_rotation_deg`
	- `requires_wall_attachment`
	- `requires_benchtop`
	- `supports_left_end_panel`
	- `supports_right_end_panel`
	- `pricing_mode` (`use_product_price`, `override`, `formula`)
	- `override_price`
	- `interaction_schema` (JSON for doors/drawers/pivots)
	- `constraint_schema` (JSON for advanced planner rules)
	- `compatibility_schema` (JSON for finishes/handles/adjacency rules)
	- `has_production_assets`
	- `production_asset_notes`
	- `validation_notes`
	- timestamps

Rationale:
- `Product` stays compatible with the existing store.
- Planner metadata remains optional and only appears for enabled products.
- Queryable/common fields stay explicit columns.
- More complex motion/constraint detail stays in JSON where the ERP editor can serialize structured UI inputs.

#### 3.1b Production asset models
- `KitchenProductionAsset`
	- `designer_profile` (FK -> `KitchenDesignerProductProfile`)
	- `label`
	- `asset_type` (`gcode`, `cnc_program`, `toolpath`, `setup_sheet`, `cut_list`, `manufacturing_pdf`, `other`)
	- `file`
	- `file_format`
	- `machine_profile` (blank allowed)
	- `variant_key` (blank allowed, for finish/size/hinge-specific files)
	- `version_label`
	- `notes`
	- `is_active`
	- timestamps

- `KitchenOrderProductionPackage`
	- `order` (FK -> `Order`)
	- `kitchen_bundle` (FK -> `KitchenCartBundle`)
	- `status` (`pending`, `ready`, `downloaded`)
	- `package_manifest` (JSON)
	- `generated_zip` (optional file)
	- `generated_at`
	- `downloaded_at`
	- timestamps

Purpose:
- staff can upload manufacturing assets such as g-code alongside planner-enabled products
- after payment, staff can open a paid order and download one manufacturing package containing all relevant files for production

#### 3.2 Asset validation and staging
- `KitchenDesignerAssetValidation`
	- `designer_profile` (FK)
	- `status` (`pending`, `passed`, `failed`)
	- `detected_format`
	- `file_size_bytes`
	- `mesh_count`
	- `material_count`
	- `has_embedded_textures`
	- `warnings` (JSON list)
	- `errors` (JSON list)
	- `validated_at`
	- `validated_by` (nullable FK -> `User`)

This supports the staging-before-publish workflow already chosen.

#### 3.3 Planner project ownership and versions
- `KitchenProject`
	- `owner` (FK -> `User`)
	- `customer_profile` (FK -> `CustomerProfile`, nullable if owner is the customer user directly)
	- `title`
	- `slug`
	- `status` (`draft`, `validating`, `valid`, `invalid`, `proceeding`, `ordered`, `archived`)
	- `current_version` (FK -> `KitchenProjectVersion`, nullable)
	- `estimated_price`
	- `share_token` (nullable)
	- `share_mode` (`private`, `view_link`)
	- timestamps

- `KitchenProjectVersion`
	- `project` (FK)
	- `version_name`
	- `created_by` (FK -> `User`)
	- `version_number`
	- `scene_snapshot` (JSON)
	- `price_snapshot`
	- `validation_summary` (JSON)
	- `source_version` (self FK nullable)
	- `is_auto_snapshot`
	- timestamps

- `KitchenProjectDuplication`
	- `source_project` (FK)
	- `source_version` (FK nullable)
	- `duplicated_project` (FK)
	- `duplicated_by` (FK -> `User`)
	- `reason` (`rep_assist`, `customer_copy`, `variant`, `other`)
	- timestamps

This matches the chosen collaboration model: copy/share instead of shared mutable editing.

#### 3.4 Commerce cart, validation, and bundle linkage
- `Cart`
	- `user` (OneToOne -> `User`)
	- `status` (`active`, `checked_out`, `abandoned`)
	- timestamps

- `CartItem`
	- `cart` (FK)
	- `product` (FK -> `Product`)
	- `quantity`
	- `unit_price`
	- `line_total`
	- `source_type` (`catalog`, `kitchen_bundle`)
	- `kitchen_bundle` (nullable FK -> `KitchenCartBundle`)
	- `is_quantity_locked`
	- `is_removal_locked`
	- `metadata` (JSON)
	- timestamps

- `Order`
	- `user` (FK -> `User`)
	- `cart` (nullable FK)
	- `status` (`pending`, `paid`, `cancelled`, `fulfilled`)
	- `subtotal`
	- `tax`
	- `total`
	- `placed_at`
	- timestamps

- `OrderItem`
	- `order` (FK)
	- `product` (FK -> `Product`)
	- `quantity`
	- `unit_price`
	- `line_total`
	- `source_type` (`catalog`, `kitchen_bundle`)
	- `kitchen_bundle` (nullable FK -> `KitchenCartBundle`)
	- `metadata` (JSON)

- `KitchenValidationRun`
	- `project_version` (FK)
	- `status` (`passed`, `failed`)
	- `hard_issue_count`
	- `soft_issue_count`
	- `issues` (JSON list)
	- `started_at`
	- `completed_at`

- `KitchenBom`
	- `project_version` (OneToOne or FK depending on history needs)
	- `currency`
	- `subtotal`
	- `tax`
	- `total`
	- `items_snapshot` (JSON for immutable historical output)

- `KitchenBomItem`
	- `bom` (FK)
	- `product` (FK -> `Product`)
	- `source_node_id`
	- `quantity`
	- `unit_price`
	- `line_total`
	- `metadata` (JSON)

- `KitchenCartBundle`
	- `project` (FK)
	- `project_version` (FK)
	- `cart` (nullable FK -> `Cart`)
	- `status` (`active`, `superseded`, `checked_out`)
	- `locked_item_ids` (JSON)
	- `bundle_total`
	- timestamps

Working logic for v1:
- normal product pages add regular `catalog` items into the active cart
- kitchen designer `Add to bag` converts a validated BOM into a `KitchenCartBundle`
- each bundle item becomes a `CartItem` with `source_type='kitchen_bundle'`
- kitchen-bundle cart items have locked quantity/removal controls in the cart UI
- if the customer wants changes, the cart links back to the originating kitchen project
- paid kitchen orders should also be able to generate a manufacturing download package for staff

#### 3.5 Assisted help, certification, and commission
- `StoreLocation`
	- `name`
	- `slug`
	- `address_line_1`
	- `address_line_2`
	- `city`
	- `state`
	- `postcode`
	- `country`
	- `latitude`
	- `longitude`
	- `phone`
	- `email`
	- `opening_hours` (JSON)
	- `map_link`
	- `is_active`

- `StoreRepresentativeProfile`
	- `user` (OneToOne -> `User`)
	- `store_location` (FK)
	- `display_name`
	- `phone`
	- `is_available_for_assignment`
	- `commission_rate` (optional)

- `KitchenAssistRequest`
	- `project` (FK)
	- `requested_by` (FK -> `User`)
	- `mode` (`remote_review`, `in_store_appointment`)
	- `assignment_mode` (`customer_selected`, `system_assigned`)
	- `store_location` (nullable FK)
	- `assigned_rep` (nullable FK -> `User`)
	- `status` (`requested`, `scheduled`, `completed`, `cancelled`)
	- `appointment_at` (nullable)
	- `notes`
	- timestamps

- `KitchenProjectCertification`
	- `project` (FK)
	- `project_version` (FK)
	- `rep` (FK -> `User`)
	- `store_location` (nullable FK)
	- `status` (`certified`, `needs_changes`, `informational_review`)
	- `summary`
	- `created_at`

- `RepAssistConfirmation`
	- `assist_request` (FK)
	- `project` (FK)
	- `order_reference` (nullable until order exists)
	- `customer_email_sent_at`
	- `customer_response` (`pending`, `yes`, `no`)
	- `customer_responded_at`
	- `reminder_sent_at`

- `StoreRepresentativeReview`
	- `rep` (FK -> `StoreRepresentativeProfile`)
	- `customer` (FK -> `User`)
	- `assist_request` (nullable FK)
	- `order` (nullable FK -> `Order`)
	- `rating` (1-5)
	- `comment`
	- `is_verified_assist`
	- `created_at`

Purpose:
- after a completed, paid rep-assisted order, the customer can optionally leave a comment and rating for the rep
- future customers can see rep averages and detailed comments on rep profile pages

This preserves the user's requirement that rep contribution and commission are tracked independently from project ownership.

### 4. Scene snapshot contract

Use millimeters everywhere.

Recommended `scene_snapshot` shape:

		{
			"schemaVersion": 1,
			"room": {
				"ceilingHeightMm": 2400,
				"walls": [...],
				"openings": [...],
				"pillars": [...],
				"services": {
					"plumbing": [...],
					"electrical": [...]
				}
			},
			"items": [
				{
					"nodeId": "cab-001",
					"productId": 123,
					"plannerProfileId": 55,
					"positionMm": {"x": 0, "y": 0, "z": 0},
					"rotationDeg": {"x": 0, "y": 90, "z": 0},
					"variantSelections": {...},
					"finishSelections": {...},
					"adjacency": {...}
				}
			],
			"price": {
				"estimatedTotal": 0,
				"currency": "AUD"
			},
			"metadata": {
				"units": "mm"
			}
		}

The snapshot should be backend-owned JSON, not raw frontend-only ad hoc state.

### 5. Validation engine contract

#### Hard rules
Examples:
- object collides with wall/opening/pillar
- cabinet requiring wall attachment is not wall-aligned
- door swing clearance is impossible
- appliance clearance below minimum
- product missing required supporting elements

#### Soft rules
Examples:
- awkward filler recommendation
- suboptimal corner transition
- aesthetic mismatch warning
- recommended end panel missing

#### Validation response shape

		{
			"status": "failed",
			"hardIssueCount": 2,
			"softIssueCount": 3,
			"issues": [
				{
					"code": "DOOR_CLEARANCE_BLOCKED",
					"severity": "hard",
					"nodeId": "cab-001",
					"message": "Left door cannot open fully.",
					"suggestedFixes": ["Move cabinet 50mm right", "Change hinge direction"],
					"focus": {"x": 1200, "y": 900, "z": 30}
				}
			]
		}

This response should power both the issue list and optional 3D highlighting.

### 6. API design

#### Reuse existing endpoints
- Keep existing `/api/products/`, `/api/categories/`, and review endpoints.
- Extend product responses with planner capability summary where useful.

#### New commerce/cart endpoints
- `POST /api/cart/add-product/`
- `GET /api/cart/`
- `GET /api/cart/items/`
- `PATCH /api/cart/items/{id}/`
- `DELETE /api/cart/items/{id}/`
- `POST /api/cart/checkout/`

Rules:
- all cart endpoints require authentication
- product-detail-page add-to-cart requires sign-in/register first
- kitchen-designer add-to-bag requires sign-in/register first
- kitchen-bundle items reject direct quantity edits/removal via API unless the request comes from a bundle refresh flow

#### New ERP-focused endpoints
- `GET /api/planner/erp/products/{id}/profile/`
- `PATCH /api/planner/erp/products/{id}/profile/`
- `POST /api/planner/erp/products/{id}/asset-validate/`
- `POST /api/planner/erp/products/{id}/stage/`
- `POST /api/planner/erp/products/{id}/publish/`
- `POST /api/planner/erp/products/{id}/unpublish/`

#### New public/private planner catalog endpoints
- `GET /api/planner/catalog/products/`
- `GET /api/planner/catalog/products/{id}/`
- `GET /api/planner/catalog/filters/`

These should only return published planner-enabled products.

#### New project endpoints
- `POST /api/planner/projects/`
- `GET /api/planner/projects/`
- `GET /api/planner/projects/{id}/`
- `PATCH /api/planner/projects/{id}/`
- `POST /api/planner/projects/{id}/duplicate/`
- `POST /api/planner/projects/{id}/versions/`
- `GET /api/planner/projects/{id}/versions/`
- `POST /api/planner/projects/{id}/share-links/`
- `GET /api/planner/share/{token}/`

#### Validation / review / proceed endpoints
- `POST /api/planner/projects/{id}/validate/`
- `GET /api/planner/projects/{id}/review/`
- `POST /api/planner/projects/{id}/add-to-bag/`
- `GET /api/planner/projects/{id}/drawings/`

Rules for `POST /api/planner/projects/{id}/add-to-bag/`:
- if unauthenticated: return `401` with a machine-readable code like `LOGIN_REQUIRED`
- if authenticated: create/update the user's active cart and attach the generated `KitchenCartBundle`
- if the project fails validation: reject with itemized issues

#### Production/manufacturing endpoints
- `GET /api/commerce/orders/{id}/production-package/`
- `POST /api/commerce/orders/{id}/production-package/generate/`
- `GET /api/commerce/orders/{id}/production-package/download/`

Rules:
- only staff/authorized internal users can access production-package endpoints
- package generation is allowed only for paid kitchen orders
- the package manifest should enumerate all g-code and related manufacturing files included in the download

#### Assisted-help / certification / stores endpoints
- `POST /api/planner/projects/{id}/assist-requests/`
- `GET /api/planner/projects/{id}/assist-requests/`
- `POST /api/planner/projects/{id}/certifications/`
- `GET /api/stores/`
- `GET /api/stores/{slug}/`
- `GET /api/store-reps/`
- `GET /api/store-reps/{id}/`
- `GET /api/store-reps/{id}/reviews/`
- `POST /api/store-reps/{id}/reviews/`
- `POST /api/rep-assist-confirmations/{id}/send-email/`
- `POST /api/rep-assist-confirmations/{id}/remind/`
- `POST /api/rep-assist-confirmations/{id}/respond/`

Rules:
- rep review creation is only allowed after a verified paid order with a linked assist record
- rep detail responses should include `average_rating`, `rating_count`, and recent review snippets

### 7. ERP field design

Because [nextjs_frontend/songfei/src/app/erp/products/page.tsx](nextjs_frontend/songfei/src/app/erp/products/page.tsx) is already very large, do not force all kitchen-designer settings into the existing main form.

Recommended UX:
- Keep current product creation/edit fields in the existing ERP products page.
- Add a per-product action: `Designer settings`.
- Use a dedicated route: `/erp/products/[id]/designer`

Recommended sections in that screen:
1. Enable planner product
2. Upload `.glb`
3. Dimensions in mm
4. Product role
5. Placement behavior
6. Door/drawer interaction behavior
7. Constraint templates
8. Finish/handle compatibility
9. Production/manufacturing assets
	- upload g-code files
	- upload setup sheets / manufacturing PDFs / related files
	- assign machine profile or variant when relevant
	- mark active file version
10. Staging validation preview
11. Publish controls

### 8. Frontend architecture

#### Route map
- `/register` — customer account registration
- `/cart` — active shopping cart
- `/kitchen-designer` — landing/resume page
- `/kitchen-designer/[projectId]` — main editor
- `/kitchen-designer/[projectId]/review` — final validation/review screen
- `/kitchen-designer/[projectId]/proceed` — add-to-bag / assisted-help / store options
- `/kitchen-designer/share/[token]` — read-only shared project view
- `/stores` — store directory and map
- `/store-reps/[repId]` — rep profile page with ratings/comments
- `/erp/products/[id]/designer` — planner-specific ERP editor
- `/erp/orders/[id]/production` — internal production package page

#### Feature-layer structure

		nextjs_frontend/songfei/src/
			app/
				register/page.tsx
				cart/page.tsx
				kitchen-designer/
					page.tsx
					[projectId]/page.tsx
					[projectId]/review/page.tsx
					[projectId]/proceed/page.tsx
					share/[token]/page.tsx
				stores/page.tsx
				store-reps/[repId]/page.tsx
				erp/products/[id]/designer/page.tsx
				erp/orders/[id]/production/page.tsx
			features/kitchen-designer/
				api/
					plannerApi.ts
			features/commerce/
				api/
					cartApi.ts
				components/
					AddToCartButton.tsx
					CartDrawer.tsx
					CartItemRow.tsx
				pages/
					CartScreen.tsx
			features/store-reps/
				api/
					repApi.ts
				components/
					RepCard.tsx
					RepRatingSummary.tsx
					RepReviewList.tsx
				pages/
					RepProfileScreen.tsx
			features/production/
				api/
					productionApi.ts
				components/
					ProductionAssetUploader.tsx
					ProductionPackageTable.tsx
				pages/
					ProductionOrderScreen.tsx
				state/
					plannerStore.ts
				scene/
					DesignerCanvas.tsx
					SceneLights.tsx
					SceneCamera.tsx
					ProductNode.tsx
					RoomShell.tsx
					ConstraintOverlay.tsx
				editor/
					DesignerShell.tsx
					Toolbar.tsx
					ProductCatalogPanel.tsx
					InspectorPanel.tsx
					PriceBar.tsx
					ValidationDrawer.tsx
				review/
					ReviewScreen.tsx
					DrawingPreview.tsx
				stores/
					StoreLocator.tsx
					StoreMap.tsx
				types/
					planner.ts
				utils/
					geometry.ts
					snapping.ts
					pricing.ts

#### State approach
- Use Zustand for scene/editor state.
- Keep backend snapshots serializable and distinct from UI-only transient state.
- UI-only state examples:
	- hovered node
	- selected node
	- temporary drag transform
	- open inspector tab
- persisted state examples:
	- room geometry
	- item placements
	- variant selections
	- finish selections

### 9. Frontend integration strategy with current codebase

#### API layer
Create a shared API wrapper instead of continuing to hardcode fetches per screen for the designer.

Suggested files:
- `src/lib/api.ts` — base URL, fetch wrapper, auth headers, JSON helpers
- `src/features/kitchen-designer/api/plannerApi.ts` — planner-specific calls
- `src/lib/auth.ts` — token storage, login redirect helpers, post-auth resume helpers

This is especially important because the current codebase only partially uses token auth and does not yet have a consistent authenticated fetch strategy.

Recommended implementation rule:
- all new cart, planner, production, and rep-review flows must go through the shared API/auth helpers instead of ad hoc `fetch()` calls

#### Auth and account behavior
- Continue using the existing token-based auth for the first implementation phase.
- Add a small shared `getAuthHeaders()` helper.
- Use existing `User.role` and `CustomerProfile` instead of introducing a second auth system.
- Customers may browse the store and design a kitchen anonymously.
- Authentication becomes mandatory when the user tries to:
	- add a normal product to cart
	- add a kitchen design BOM to bag/cart
	- check out
- If the user is anonymous during kitchen design, keep the working project in local browser state or local draft storage until login is completed.
- After login/register, resume the intended action and sync the cart/project with the backend account.

### 10. Concrete UI flows

#### Store product purchase flow
1. User opens a normal product detail page.
2. User clicks `Add to cart`.
3. If signed out, redirect to `/login` or `/register` with a return path.
4. After authentication, add the product to the active cart.
5. `/cart` shows all ordinary ecommerce items and any kitchen bundles.

#### ERP publish flow
1. Staff creates/edits a normal product.
2. Staff opens `Designer settings`.
3. Staff enables planner support and uploads `.glb`.
4. Staff enters dimensions, role, constraints, and motion settings.
5. Staff uploads optional production/manufacturing files such as g-code.
6. Staff runs staging validation/preview.
7. Staff publishes the planner profile.
8. Product becomes available in `/api/planner/catalog/products/`.

#### Customer design flow
1. Customer opens `/kitchen-designer`.
2. Creates or resumes a project, even if not signed in yet.
3. Builds room geometry.
4. Places planner-enabled products.
5. Sees live price updates.
6. Saves named versions.
7. Clicks `Continue` for final validation.
8. Resolves issues or moves to review.
9. Clicks `Proceed` and chooses add-to-bag, assisted help, or stores.
10. If `Add to bag` is selected while signed out, redirect to auth, then resume the action.

#### Cart flow
1. User opens `/cart`.
2. Regular catalog items can change quantity or be removed.
3. Kitchen-designer-derived items display a locked state.
4. Clicking locked quantity/remove controls shows guidance: changes must be made in the designer.
5. User can jump back to the source kitchen project to modify the BOM.

#### Rep help flow
1. Customer opens assisted-help flow.
2. Chooses a rep/store or requests random assignment.
3. A remote review or appointment is created.
4. Rep can inspect the shared design.
5. Rep can optionally duplicate into their own account for edits.
6. Rep can mark the customer's shared design as store-reviewed/certified.
7. After checkout/order completion, customer receives an email asking whether the rep helped.
8. Customer can optionally submit a rating and comment for the rep.
9. Future customers can inspect rep averages and review history on the rep profile page.

#### Paid-order production flow
1. Customer completes payment for an order containing a kitchen bundle.
2. Staff opens the internal production order page.
3. The system gathers all linked production assets for the ordered bundle items.
4. Staff reviews the manifest and downloads a single manufacturing package.
5. Staff uses the downloaded g-code and related files in the CNC/production workflow.

### 11. Drawing/output scope

#### V1 outputs
- measured floor plan
- measured elevations
- benchtop/top views
- component layouts

#### Deferred outputs
- installer pack
- manufacturing/CNC pack

The backend drawing service should therefore target planning-grade output in v1, not full production manufacturing documents.

### 12. Delivery guidance tied to the current project stage

#### First implementation slice
1. Add authenticated ecommerce cart models, endpoints, and `/cart` UI for ordinary product pages.
2. Add customer registration flow and enforce login for add-to-cart.
3. Extend `Product` with planner profile support in the separate `planner` app.
4. Add the dedicated ERP route `/erp/products/[id]/designer` for planner settings.
5. Add production/manufacturing asset upload support for planner-enabled products.
6. Install Three.js / React Three Fiber / Zustand / Leaflet.
7. Build a minimal planner that supports:
	 - room polygon
	 - published product placement
	 - hard-rule blocking
	 - soft warnings
	 - live price estimate
	 - save/load project versions
8. Add final validation screen.
9. Link `Add to bag` from the planner into the working cart system.
10. Add rep confirmation + optional rep rating/comment flow for paid assisted orders.
11. Add internal paid-order production download flow.

This gives the project a realistic vertical slice with a working store cart, authentication gating, and planner-to-cart integration instead of a purely theoretical add-to-bag contract.

---

## Draft phased implementation plan

### Phase 0 — Product and platform definition
1. Define the v1 SKU pilot assortment (target: fewer than 100 planner-enabled products).
2. Classify each SKU into planner roles: base, wall, tall, panel, benchtop, appliance, accessory.
3. Define hard-rule and soft-rule taxonomy.
4. Define the minimum metadata contract required for a product to become planner-enabled.
5. Define the customer journey from anonymous design to authenticated add-to-bag.

### Phase 1 — Commerce and account foundation
1. Add customer registration UI and login redirect/resume behavior.
2. Add `Cart`, `CartItem`, `Order`, and `OrderItem` backend models.
3. Add authenticated cart endpoints for normal ecommerce products.
4. Build `/cart` and working add-to-cart from product detail pages.
5. Define locked kitchen-bundle cart behavior and designer return links.

### Phase 2 — Backend product model extension
1. Extend the Django product model or add a tightly related planner profile.
2. Add planner-enable flag and planner-specific metadata fields.
3. Add `.glb` asset storage and validation fields.
4. Add dimensions, placement role, constraint metadata, pivot/moving-part metadata, and compatibility metadata.
5. Add production/manufacturing asset models and paid-order production package generation.
6. Add staging/publish states for planner-enabled products.
7. Add store/rep/customer attribution models for assisted design.

### Phase 3 — ERP authoring workflow
1. Add `Enable 3D kitchen designer` toggle on the ERP product page.
2. Reveal planner-specific sections only when enabled.
3. Add guided `.glb` upload with validation and preview.
4. Add interactive form controls for dimensions and role selection.
5. Add non-technical constraint authoring controls.
6. Add production/manufacturing file upload and version management.
7. Add staging preview and publish workflow.

### Phase 4 — Planner scene foundation
1. Build the React Three Fiber scene shell.
2. Implement room polygon creation/editing.
3. Add wall, door, window, pillar, plumbing, electrical, and ceiling-height constraints.
4. Implement camera controls, object selection, transform controls, and snap behavior.
5. Load planner-enabled products from the published ERP catalog.

### Phase 5 — Product placement and interaction engine
1. Place cabinets/appliances into the room.
2. Snap products to walls and neighbors.
3. Enforce hard blocking rules during placement.
4. Surface soft-rule warnings with suggested fixes.
5. Implement code-driven interactive elements such as doors and drawers using pivot metadata.
6. Keep running price estimate visible during editing.

### Phase 6 — Customer project system
1. Add customer-owned design records.
2. Add save/load and named versions.
3. Add share-by-link support.
4. Add duplicate-to-own-account flow for rep/customer collaboration.
5. Add rep-help confirmation records for commission tracking.

### Phase 7 — Final validation and review
1. Add `Continue` validation audit.
2. Return itemized issues grouped by severity and affected object.
3. Add jump-to-issue behavior.
4. Add optional 3D highlighting for problem locations.
5. Generate final review screen with:
	 - 3D design preview
	 - floor plan
	 - elevations
	 - benchtop/top views
	 - component layouts
	 - millimeter measurements

### Phase 8 — Commerce and assisted-help flows
1. Convert validated BOM into cart-compatible items.
2. Lock kitchen-designer-derived cart lines against direct quantity/removal editing.
3. Add `jump back to designer` CTA from the cart.
4. Add assisted-design flow combining remote rep help and appointment booking.
5. Add rep-certified/store-reviewed status as optional reassurance.
6. Add post-order email confirmation flow for commission attribution.
7. Add optional rep rating/comment submission after paid assisted orders.

### Phase 9 — Store experience
1. Build multi-store directory page.
2. Add Leaflet/OpenStreetMap embedded map.
3. Add store cards with hours, contact details, appointment CTA, and navigation links.
4. Connect store selection into the assisted-design flow.
5. Add rep profile pages with average ratings and detailed customer comments.

### Phase 10 — Internal production workflow
1. Build paid-order production package page for staff.
2. Generate bundle-level manufacturing manifests.
3. Support zip download of g-code and related production files.
4. Track package download status for internal operations.

### Phase 11 — Post-v1 expansions
1. Installer pack generation.
2. Manufacturing/factory pack generation.
3. Larger catalog and collection/brand support.
4. More advanced countertop/filler automation.
5. Potential live collaboration if duplication-based collaboration proves limiting.

### Assisted-design flow direction
- Single entry point for assisted help.
- Customer chooses either:
	- remote review/help from a rep
	- in-store appointment
- Customer can either choose a store/rep or let the system assign one.
- This advisory path does not replace algorithmic validation or become a mandatory approval gate.

### Store-locator direction
- Dedicated store page inspired by large retail store-directory pages.
- Support multiple store locations from the start.
- Each store card should include:
	- store name
	- address
	- hours
	- contact info
	- directions/open-map link
	- appointment CTA
- Include an embedded map alongside the store list.

---

## MVP implementation update — room setup and stage shell

This section narrows the first interactive planner milestone to the room-definition flow shown in the reference screenshots. The goal is not full kitchen planning yet. The goal is to ship a strong room-setup experience with a clear 2D-to-3D transition and a stable page shell that later cabinet-placement work can plug into.

### MVP scope lock for this slice
- Support exactly one room shape: rectangular room with independently adjustable walls.
- Start in a 2D top-down room editor under `Define your space`.
- Let the user resize the room in two ways:
	- drag a wall side directly in the floor plan
	- click a visible measurement label and enter an exact value
- Keep 4 wall measurements visible at all times in the 2D editor.
- Each of the 4 walls can be resized independently; parallel walls do not auto-sync.
- Keep the top stage header visible at all times:
	- `Define your space`
	- `Make it yours`
	- `Make it happen`
- Keep the price estimate visible in all stages, but allow its placement to change by stage.
- `Make it yours` must switch the user from the 2D editor into a 3D room view powered by Three.js / React Three Fiber.
- `Make it happen` must display placeholder elevation/image cards until cabinet placement exists, establishing the content structure now for later cabinet imagery.

### Explicitly out of scope for this slice
- Non-rectangular room shapes (rectangular only, but with independent wall adjustment).
- Doors, windows, pillars, plumbing points, and other room constraints.
- Cabinet placement logic.
- Validation engine.
- Final production drawings.
- Full cabinet elevation generation.

For the first pass, `Make it happen` will show placeholder elevation/image cards for future front, side, and top-facing views, establishing the content region now so later cabinet imagery can drop in without layout redesign.

### Experience contract

#### 1. Persistent page shell
- The main planner header always stays visible.
- The stage tabs are part of the header and behave like a wizard with clear active-state styling.
- The blue `Continue` CTA advances to the next stage.
- Clicking a stage label should allow backward navigation to any previous stage freely.
- Forward navigation (clicking a future stage or pressing `Continue`) should be allowed only after the current stage has the minimum required data (e.g., valid room dimensions).

#### 2. Stage: `Define your space`
- The subheader contains:
	- `Room shape`
	- future placeholders for `Define space`, `Elements`, `Openings`, `Search`
	- ceiling-height control
	- price estimate on the right
	- `Continue` CTA
- For the MVP, only `Room shape` is interactive.
- Clicking `Room shape` opens a shape picker with only one available option: square/rectangular room.
- Selecting that option initializes the floor plan with default dimensions.
- Recommended default room seed:
	- width: `4000 mm`
	- depth: `4000 mm`
	- ceiling height: `2500 mm`

#### 3. 2D floor-plan editor behavior
- Render a centered top-down floor plan with a clear floor fill and wall outline.
- Show 4 measurement labels, one for each wall:
	- top
	- right
	- bottom
	- left
- Each wall dimension is independent and can be adjusted separately.
- The user can drag one wall at a time.
- While dragging:
	- the active wall highlights
	- the room redraws continuously
	- the affected measurement updates live
- Dragging the top or bottom wall changes the vertical room dimension (depth).
- Dragging the left or right wall changes the horizontal room dimension (width).
- Apply minimum and maximum room-size guards so individual walls cannot collapse or become unreasonable.
- Recommended initial guardrails per wall:
	- min: `1500 mm`
	- max: `10000 mm`

#### 4. Direct measurement editing behavior
- Clicking a measurement label turns it into an inline numeric input.
- The input should accept millimeters only for the MVP.
- Pressing `Enter`, clicking `Apply`, or blurring the field commits the new dimension.
- Pressing `Escape` cancels the edit and restores the prior value.
- Invalid values should be rejected with inline validation feedback.
- Changing any label updates only that wall; no mirroring or auto-sync occurs.
- Each wall can be set independently to any value within the allowed range.

#### 5. Stage: `Make it yours`
- The user reaches this stage by:
	- clicking the `Make it yours` stage label, or
	- clicking the blue `Continue` button from `Define your space`
- This stage switches from 2D to a 3D room view.
- Use React Three Fiber to render:
	- floor plane
	- 4 walls
	- simple neutral materials
	- basic camera controls
- The room geometry must be generated directly from the width, depth, and ceiling-height values created in the 2D stage.
- The price estimate remains visible in the top-right subheader in this stage.
- For the MVP, this stage is a room-view milestone, not a cabinet-placement milestone yet.

#### 6. Stage: `Make it happen`
- This stage should reuse the persistent header.
- The price estimate moves into the right sidebar instead of staying in the horizontal subheader.
- The main content should be structured so later review artifacts can be dropped in without redesign.
- Initial page layout recommendation:
	- left/main area: 3D room preview
	- secondary content area: placeholder cards for future front/elevation images
	- right sidebar: price summary and next-step actions
- For this MVP slice, placeholder elevation/image cards are acceptable until cabinet placement exists.

### State model for the MVP slice
- `stage`: `define-space | make-it-yours | make-it-happen`
- `roomShape`: `rectangle`
- `room.widthMm`
- `room.depthMm`
- `room.heightMm`
- `ui.activeWall`: `top | right | bottom | left | null`
- `ui.editingMeasurement`: `top | right | bottom | left | null`
- `ui.dragState`
- `pricing.estimatedTotal`

This state should live in the dedicated planner store so both the 2D canvas and the 3D scene read from one source of truth.

### Frontend implementation plan

#### Slice A — planner shell and navigation
1. Build a planner page shell that includes:
	- persistent top header
	- stage tabs
	- stage-specific subheader region
	- shared price display contract
2. Add stage navigation rules and `Continue` progression.
3. Store active stage in the planner state so it survives component remounts.

#### Slice B — room shape selection
1. Add `Room shape` action in the `Define your space` subheader.
2. Open a shape chooser modal/panel with only one selectable shape.
3. On selection, initialize the room geometry with default dimensions.
4. Keep this picker architected for future additional shapes, but do not expose them yet.

#### Slice C — 2D floor plan rendering
1. Render the room in SVG or canvas-based 2D top view.
2. Draw wall edges, floor fill, and measurement guides.
3. Add 4 always-visible measurement labels.
4. Add hit areas/drag handles for each wall.

SVG is the better fit for this slice because measurement labels, guide lines, and pointer hit areas are simpler to manage than in the initial Three.js implementation.

#### Slice D — resize interactions
1. Implement pointer drag on each wall.
2. Convert pixel delta into millimeter delta using a stable editor scale.
3. Clamp room dimensions to allowed range per individual wall.
4. Update the affected wall measurement during drag; other walls remain independent.
5. Show active-wall styling during interaction.

#### Slice E — direct numeric measurement editing
1. Make each measurement label clickable.
2. Replace the label with an inline input while editing.
3. Commit valid input back into the planner store.
4. Each wall updates independently; no synchronized mirroring occurs.
5. Restore the label after successful commit or cancel.

#### Slice F — 3D room scene
1. Add a React Three Fiber scene to the `Make it yours` stage.
2. Generate geometry from the same room dimensions used by the 2D editor.
3. Add orbit controls with a constrained camera.
4. Add a simple floor material and neutral wall material.
5. Keep the 3D scene reactive so dimension edits made in stage 1 appear immediately when entering stage 2.

#### Slice G — `Make it happen` review shell
1. Build the page layout now, even if some content is placeholder.
2. Put the price summary in the right sidebar.
3. Keep the 3D preview visible.
4. Add placeholder tiles for future front-facing cabinet/elevation imagery.
5. Add CTA placeholders for future proceed flows.

### Proposed component/file breakdown

#### App routes
- `src/app/kitchen-designer/[projectId]/page.tsx`
	- stage shell and main orchestration
- `src/app/kitchen-designer/[projectId]/review/page.tsx`
	- `Make it happen` review shell if kept as a separate route

#### Suggested feature components
- `src/features/kitchen-designer/components/PlannerHeader.tsx`
- `src/features/kitchen-designer/components/PlannerSubheader.tsx`
- `src/features/kitchen-designer/components/RoomShapePicker.tsx`
- `src/features/kitchen-designer/components/FloorPlanEditor2D.tsx`
- `src/features/kitchen-designer/components/MeasurementLabel.tsx`
- `src/features/kitchen-designer/components/RoomScene3D.tsx`
- `src/features/kitchen-designer/components/PlannerPriceSummary.tsx`
- `src/features/kitchen-designer/components/PlannerReviewShell.tsx`

#### Suggested state modules
- `src/features/kitchen-designer/store/plannerStore.ts`
- `src/features/kitchen-designer/lib/roomGeometry.ts`
- `src/features/kitchen-designer/lib/measurementMath.ts`

### Acceptance criteria for this MVP slice
- User can start with a rectangular room with independently adjustable walls.
- User can drag any wall and see the dimension change live; each wall updates independently.
- User can click any measurement and type an exact value; changes affect only that wall.
- Each of the 4 walls can be set to any value independently with no auto-sync.
- The room remains rectangular at all times (4 perpendicular sides, but with independent width/depth).
- `Continue` moves the user from 2D room definition to 3D room preview.
- The same room dimensions appear correctly in the 3D view.
- The page shell preserves the 3-stage header throughout the flow.
- Price display remains present in all stages, with stage-specific placement.

### Recommended testing strategy for this slice
- Unit-test dimension math and clamping behavior per wall.
- Component-test measurement editing and independent wall updates.
- Add Playwright coverage for:
	- selecting room shape
	- dragging a wall and seeing live measurement updates
	- clicking a measurement and entering a precise dimension
	- dragging different walls independently without sync
	- pressing `Continue` and landing in the 3D stage
	- preserving room dimensions between stage changes
	- clicking stage labels to jump backward
	- confirming forward jumps are blocked without valid data

### Clarifications resolved
1. ✅ **Make it happen stage content**: Will show placeholder elevation/image cards until cabinet placement exists, establishing the content region now for future cabinet imagery.
2. ✅ **Initial room default**: Will remain `4000 mm × 4000 mm × 2500 mm`.
3. ✅ **Stage navigation**: Users can jump backward freely to any previous stage by clicking stage labels. Forward navigation (via stage labels or `Continue` button) is allowed only after valid data exists in the current stage.
4. ✅ **Room shape flexibility**: Removed square-room limitation; each wall can be elongated independently to any value within guardrails (1500–10000 mm per wall).

---

## Next step
Use the new concrete architecture above to begin implementation with the first vertical slice:

1. add the planner product profile models and migrations
2. add ERP `Designer settings` for planner-enabled products
3. install Three.js / React Three Fiber / Zustand / Leaflet
4. build the initial `/kitchen-designer/[projectId]` editor shell
5. implement final validation + review + add-to-bag contract
