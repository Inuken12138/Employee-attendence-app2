# Plan: Configurable Composite Cabinets

Date: 2026-04-29
Status: Draft v0.1

## Goal
Build IKEA-style configurability as constrained composite assemblies, not monolithic cabinet GLBs.

Each planner assembly should instantiate sellable child products into named slots such as frame, countertop, sink, faucet, fronts, handles, and panels. Babylon should compose those parts, animate allowed moving parts, and enforce slot rules. Blender should author immutable child parts plus a small set of assembly helper assets and cutout variants.

The first implementation scope is one family only: base cabinet with sink, using pre-authored or variant-swapped countertop cutouts instead of unrestricted runtime mesh booleans.

## Product Direction

### Recommended mental model
- The parent cabinet is a planner assembly template or bundle, not one geometry monolith.
- Each removable, swappable, or sellable part is a separate planner leaf product and separate GLB.
- The runtime only allows changes through declared slots and compatibility rules.
- Checkout and pricing should expand the assembly to child SKUs.

### Included in v1
- Base cabinet with sink pilot family.
- Select assembly and show contextual panel.
- Open and close supported moving parts such as doors.
- Modify, style or color, remove, and re-add flows through allowed slots.
- One sink-to-countertop cutout dependency using curated countertop variants.
- BOM expansion to child SKUs.

### Excluded from v1
- Arbitrary Blender-like freeform editing.
- Generic runtime CSG across arbitrary meshes.
- Multi-sink countertops.
- Fully procedural cabinet generation.

## Phase Plan

### Phase 0: Composite contract
Define the concepts the whole system will use:
- assembly template
- slot
- child instance
- option group
- cutout dependency
- animation affordance
- BOM expansion

This contract must be stable before runtime work starts.

### Phase 1: Backend schema and authoring
Use the existing planner JSON fields to start quickly:
- `interaction_schema`
  - node kind
  - animation affordances
- `constraint_schema`
  - slot definitions
  - cardinality and remove rules
- `compatibility_schema`
  - default children
  - replacement groups
  - cutout mappings

If authoring becomes too opaque, replace the JSON pilot with normalized assembly and slot tables.

### Phase 2: Planner payloads and snapshot shape
Expose composite metadata in planner catalog payloads and evolve planner snapshots so placed nodes can carry assembly metadata and child instances while remaining backward compatible with old flat snapshots.

### Phase 3: Babylon assembly runtime
Refactor the runtime around assembly roots and child part handles:
- selected assembly info panel
- child transforms from slot anchors
- animation on child roots
- modify, replace, remove, and add slot flows

### Phase 4: Cutout pipeline
Start with curated countertop variants:
- blank countertop
- round-sink cutout variant
- square-sink cutout variant

When a sink is inserted, swap the countertop child to the matching cutout variant, then place the sink.

### Phase 5: Validation, pricing, and rollout
Update validation and BOM logic so assemblies expand to child products, then roll the same system from sink-base pilot to the rest of base cabinets before wall and tall cabinets.

## Relevant Files
- `django_backend/planner/models.py`
- `django_backend/planner/serializers.py`
- `django_backend/planner/services/bom.py`
- `django_backend/planner/services/validation.py`
- `nextjs_frontend/songfei/src/app/erp/products/[id]/designer/page.tsx`
- `nextjs_frontend/songfei/src/features/kitchen-designer/types/planner.ts`
- `nextjs_frontend/songfei/src/features/kitchen-designer/state/plannerStore.ts`
- `nextjs_frontend/songfei/src/features/kitchen-designer/babylon/createPlannerRuntime.ts`
- `nextjs_frontend/songfei/src/features/kitchen-designer/components/PlannerProductDrawer.tsx`
- `plan/babylonjs-kitchen-designer-migration.plan.md`

## Verification
1. Author one sink-base assembly template and several leaf parts in ERP.
2. Confirm catalog payload includes slots, defaults, replacements, animation affordances, and cutout rules.
3. Confirm old flat snapshots still load.
4. Confirm one sink-base assembly can open a door, replace a countertop, remove and re-add a faucet, and switch countertop cutout variant when the sink changes.
5. Confirm project BOM expands to child SKUs rather than one parent record.

## Blender Guidance
- Do not model the whole configurable sink cabinet as one final runtime GLB.
- Model the smallest independently configurable or sellable part as its own asset.
- Keep pivots and origins meaningful for runtime transforms.
- Keep one assembly reference scene in Blender for alignment, but do not rely on that as the planner source of truth.

What you should do in Blender now is model leaf parts, not one final configurable cabinet GLB. For the sink-base pilot, make separate GLBs for:

- Frame or carcass
- Door or front
- Handle
- Countertop blank
- Countertop round-cutout variant
- Countertop square-cutout variant
- Sink variants
- Faucet variants
- Any removable side or filler panels

Keep everything at real-world scale in meters, place origins and pivots where runtime transforms should happen, and keep one reference assembly scene only for alignment. For example, a door should have its origin on the hinge axis, and swappable countertop variants should share the exact same footprint and anchor position so runtime replacement is just a clean variant swap.

## Sink-Base Pilot Asset Contract

Use one stable filename rule for the pilot assets:
- Canonical public path: `/planner-assets/pilots/sink-base/{PRODUCT_CODE}.glb`
- Filename rule: exact product code plus `.glb`
- Runtime seed manifest: `nextjs_frontend/songfei/public/planner-assets/pilots/sink-base/manifest.json`

Initial pilot filenames:
- `FRAME-BASE-SINK-600.glb`
- `COUNTERTOP-BLANK-600.glb`
- `COUNTERTOP-ROUND-CUTOUT-600.glb`
- `COUNTERTOP-SQUARE-CUTOUT-600.glb`
- `DOOR-FRONT-600-WHITE.glb`
- `DOOR-FRONT-600-OAK.glb`
- `HANDLE-BAR-BLACK-160.glb`
- `SINK-ROUND-450.glb`
- `SINK-SQUARE-450.glb`
- `FAUCET-LEFT-BRUSHED.glb`
- `FAUCET-RIGHT-BRUSHED.glb`

Keep the product code identical across ERP product records, composite slot defaults and replacements, Blender export names, and the final `.glb` filenames.