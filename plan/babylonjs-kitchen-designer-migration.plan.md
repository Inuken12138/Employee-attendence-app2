# Plan: Babylon.js Migration for Kitchen Designer

Date: 2026-04-28
Status: Draft v0.1

## Goal
Replace the current Three.js + React Three Fiber planner scene with a Babylon.js-based planner runtime while preserving the existing planner product flow, planner snapshot contract, and Django API integration.

The migration should first reach feature parity with the current planner slice, then use Babylon-native features for collision, richer interaction, higher-fidelity feedback, and a touch-capable interface that works on phones as well as desktop.

The target end state is not a Babylon scene with React DOM layered on top. The target is a Babylon-powered planner runtime where the room, cabinet interactions, HUD, cabinet picker, running total, and contextual planner controls all feel like one cohesive product surface.

---

## Current frontend footprint tied to Three.js / React Three Fiber

### Dependencies
- `nextjs_frontend/songfei/package.json`
  - `three`
  - `@react-three/fiber`
  - `@react-three/drei`

### Runtime scene surfaces
- `nextjs_frontend/songfei/src/features/kitchen-designer/components/RoomScene3D.tsx`
  - Main planner room preview used in the active planner flow.
  - Creates the R3F `Canvas`, background/fog, scene camera, lights, room shell, and planner nodes.
- `nextjs_frontend/songfei/src/features/kitchen-designer/scene/DesignerCanvas.tsx`
  - Alternate R3F scene host with the same scene stack.
  - Search did not show active consumers outside this file, so it looks like a legacy or spare scene surface that should be explicitly retired or ported.

### Scene building and interaction modules
- `nextjs_frontend/songfei/src/features/kitchen-designer/scene/SceneCamera.tsx`
  - Uses `PerspectiveCamera` and `OrbitControls` from `@react-three/drei`.
  - Frames the room from planner dimensions and supports compact/full modes.
- `nextjs_frontend/songfei/src/features/kitchen-designer/scene/SceneLights.tsx`
  - Uses hemisphere, ambient, and directional lights with shadows.
- `nextjs_frontend/songfei/src/features/kitchen-designer/scene/RoomShell.tsx`
  - Builds floor, outer ground plane, walls, and baseboards from planner room dimensions.
- `nextjs_frontend/songfei/src/features/kitchen-designer/scene/ProductNode.tsx`
  - Loads `.glb` assets with `useGLTF`.
  - Falls back to box geometry if no 3D asset exists.
  - Computes asset bounds and scales imported models to planner dimensions.
  - Handles selection, deselection, move mode, rotate mode, 50 mm snapping, 140 mm wall snapping, room-bound clamping, rotation normalization, and selected-state outline.
  - Uses `Html` overlays for move/rotate controls and rotation indicator.

### Planner shell features that depend on the 3D renderer
- `nextjs_frontend/songfei/src/features/kitchen-designer/editor/DesignerShell.tsx`
  - Uses `RoomScene3D` in the `make-it-yours` stage.
  - Exposes planner state that drives scene behavior: room dimensions, nodes, stage, active catalog path, interaction mode, and project save/share flows.
- `nextjs_frontend/songfei/src/features/kitchen-designer/components/PlannerReviewShell.tsx`
  - Uses `RoomScene3D` in compact mode for the review stage.
- `nextjs_frontend/songfei/src/app/kitchen-designer/page.tsx`
  - Contains user-facing copy that explicitly mentions Three.js / React Three Fiber.

### Domain/state modules that should survive the rendering swap
- `nextjs_frontend/songfei/src/features/kitchen-designer/state/plannerStore.ts`
  - Current source of truth for room geometry, selected node, interaction mode, and placed items.
  - Should remain engine-agnostic.
- `nextjs_frontend/songfei/src/features/kitchen-designer/types/planner.ts`
  - Defines planner room, planner node, and saved snapshot types.
  - The existing saved-project schema should remain stable during the rendering migration.
- `nextjs_frontend/songfei/src/features/kitchen-designer/api/plannerApi.ts`
  - Fetches planner catalog products and project save/load/review endpoints from Django.
  - Does not depend on Three.js and should remain unchanged for the first migration pass.
- `nextjs_frontend/songfei/src/features/kitchen-designer/components/PlannerProductDrawer.tsx`
  - Adds products into the planner store.
  - Renderer should continue consuming the same node data shape.

---

## Current feature set that the Babylon version must preserve

### Room rendering
- Full room shell driven by millimeter-based planner room state.
- Two display contexts:
  - full planner scene in `make-it-yours`
  - compact preview in `make-it-happen`
- Background color and fog.
- Soft indoor light rig and shadows.

### Camera behavior
- Orbit camera.
- Compact/full framing based on room dimensions.
- Framing updates when the room dimensions change.

### Planner product rendering
- Render a planner node per store item.
- Support both:
  - imported `.glb` model rendering
  - placeholder box rendering when no model exists
- Scale imported models to stored ERP dimensions.

### Selection and manipulation
- Click a node to select it.
- Click empty scene to clear selection.
- Move mode.
- Rotate mode.
- Visual selected-state outline.
- Floating selected-node actions.
- Rotation angle indicator.

### Placement rules already implemented in code
- 50 mm movement snap.
- 140 mm wall snap threshold.
- Auto-rotate to wall orientation on snap.
- Clamp placement so nodes remain inside the room envelope.

### Planner workflow integration
- Add products from the planner drawer into the scene.
- Persist and rehydrate placed items through planner snapshots.
- Keep pricing, review shell, and saved-project flows untouched.

### Mobile and touch expectations for the Babylon version
- Open saved kitchen designs on modern mobile browsers.
- Orbit, pan, and zoom the room with touch gestures.
- Select products and use planner controls with touch-sized targets.
- Support at least a practical mobile editing workflow for selection, product insertion, move, and rotate, even if advanced workflows stay easier on desktop.
- Keep the same planner data model regardless of device.

---

## Recommended Babylon.js integration approach

### Use direct Babylon.js, not a React wrapper
Recommendation: use direct Babylon.js inside client-only React components rather than relying on a Babylon React wrapper.

Reasoning:
- The project already has a clear React shell and Zustand store.
- Babylon's strengths are its scene APIs, behaviors, gizmos, loaders, physics hooks, and inspector.
- A thin React wrapper around a Babylon scene controller will be more predictable than introducing another abstraction layer that still ends up imperative for complex scene updates.

### Use Babylon GUI as the primary planner UI layer
Recommendation: inside the planner experience, prefer Babylon GUI over React DOM overlays for the runtime HUD and interaction surfaces.

Reasoning:
- The user experience should feel like one cohesive interactive tool, not a 3D canvas with a second UI system floating above it.
- Babylon GUI keeps pointer and touch handling inside one interaction model, which matters on phones.
- Planner-specific surfaces such as running totals, cabinet selection, contextual move/rotate actions, and snap/collision feedback are part of the planner itself and fit naturally in the Babylon layer.
- This gives the planner a more game-like feel without changing the underlying store or API contracts.

Constraint:
- React should still own route-level concerns such as auth, page loading, data fetch/bootstrap, and non-planner site chrome.
- Babylon GUI should own the interactive planner HUD once the user is inside the kitchen designer flow.

### Next.js integration pattern
- Keep scene components client-only with `'use client'`.
- Use a dedicated canvas host component, for example `BabylonPlannerGame.tsx`.
- Create the Babylon `Engine` and `Scene` in `useEffect`.
- Dispose the engine on unmount.
- If hydration or bundle-splitting becomes noisy, load the scene host with `next/dynamic` and `ssr: false`.

### Mobile integration pattern
- Treat touch support as a foundation concern, not a post-parity enhancement.
- Design the planner runtime around one input controller that handles desktop pointer input and mobile gestures.
- Size planner HUD controls for touch from the first Babylon pass.
- Validate on real iPhone and Android hardware before calling parity complete.

### Django integration pattern
No Django rendering changes are required for the first pass.

Django remains responsible for:
- planner catalog product data
- `.glb` asset URLs
- project save/load/version endpoints
- review/add-to-bag/share flows

The frontend Babylon layer should consume the same planner APIs already used by `plannerApi.ts`.

---

## Proposed Babylon architecture

Create a dedicated Babylon planner runtime under the planner feature, for example:

- `src/features/kitchen-designer/babylon/BabylonPlannerGame.tsx`
  - React host component that mounts the Babylon canvas and hands off to the planner runtime.
- `src/features/kitchen-designer/babylon/createPlannerRuntime.ts`
  - Bootstrap function that creates engine, scene, camera, lights, GUI texture, and root controllers.
- `src/features/kitchen-designer/babylon/roomShell.ts`
  - Babylon implementation of the room envelope and baseboards.
- `src/features/kitchen-designer/babylon/productMeshes.ts`
  - Planner node mesh creation, fallback box creation, GLB loading, bounds normalization, and disposal.
- `src/features/kitchen-designer/babylon/cameraRig.ts`
  - ArcRotateCamera framing logic that mirrors current compact/full behavior.
- `src/features/kitchen-designer/babylon/interactionController.ts`
  - Selection, empty-space deselection, move mode, rotate mode, snapping, clamp logic, and mobile gesture mapping.
- `src/features/kitchen-designer/babylon/guiHud.ts`
  - Running total, stage/status HUD, save/share affordances, and planner messaging.
- `src/features/kitchen-designer/babylon/guiCatalog.ts`
  - Cabinet picker, category switching, and touch-friendly product insertion controls.
- `src/features/kitchen-designer/babylon/guiContextActions.ts`
  - Selected-item actions such as move, rotate, delete, and angle/status indicators.
- `src/features/kitchen-designer/babylon/sceneSync.ts`
  - Sync layer between planner store state and Babylon meshes and GUI view models.
- `src/features/kitchen-designer/babylon/deviceProfile.ts`
  - Device capability checks and mobile/desktop tuning for touch targets, DPR, shadows, and effects.

This keeps Babylon-specific code out of the domain store while making the planner runtime, input handling, and planner HUD feel like one coherent system.

---

## Feature-by-feature adaptation map

| Current Three / R3F feature | Current implementation | Babylon.js equivalent | Migration notes |
| --- | --- | --- | --- |
| Scene host | `Canvas` from `@react-three/fiber` | `<canvas>` + `Engine` + `Scene` | Move scene lifecycle into a client-only host component. |
| Background and fog | `color`, `fog` attachments | `scene.clearColor`, `scene.fogMode`, `scene.fogColor`, `scene.fogStart`, `scene.fogEnd` | Keep visual parity first. |
| Camera | `PerspectiveCamera` + `OrbitControls` | `ArcRotateCamera` + `attachControl` | Reuse current framing math from `SceneCamera.tsx`. |
| Lights | hemisphere + ambient + directional lights | `HemisphericLight`, `DirectionalLight`, optional fill light | Use `ShadowGenerator` for the main directional light. |
| Room shell | R3F meshes with plane/box geometry | `MeshBuilder.CreateGround`, `CreateBox` | Preserve mm-to-scene conversion and dimensions. |
| GLB loading | `useGLTF` | `SceneLoader.ImportMeshAsync` or asset containers | Add mesh cache to avoid repeated loads. |
| Model bounds normalization | `Box3().setFromObject` | `getHierarchyBoundingVectors` / `BoundingInfo` | Preserve scaling to ERP width/depth/height. |
| Placeholder mesh | `boxGeometry` fallback | `MeshBuilder.CreateBox` | Preserve current color/state behavior. |
| Selection outline | `Edges` helper | Babylon `HighlightLayer`, bounding box renderer, or duplicate line mesh | Pick one consistent highlight mechanism early. |
| Planner HUD and contextual controls | `Html` from `@react-three/drei` and React DOM panels | Babylon GUI `AdvancedDynamicTexture`, GUI controls, and mesh-linked UI anchors | Prefer Babylon GUI so planner UI, touch input, and scene interaction stay in one system. |
| Move and rotate affordances | Manual drag-to-move and drag-to-rotate with overlays | Babylon drag-based move/rotate + Havok collision + smart snapping | Traditional drag-drop like IKEA Pax Planner; no gizmos or mode toggles. |
| Pointer ray-plane movement | R3F pointer events + `Plane` intersection | Babylon scene picking + gizmo or ground/drag plane math | Keep custom snap logic in shared utilities. |
| Pointer capture | DOM pointer capture through R3F event target | Babylon pointer observables + gizmo internals | Centralize world and GUI pointer handling in one controller. |
| Collision detection | None or post-placement validation | Havok physics engine + real-time feedback | Collision detection informs placement validity in Phase 3. |
| Empty-space deselect | `onPointerMissed` | scene pointer observable + pick result check | Required for selection parity. |
| Node iteration | React maps nodes to components | scene sync creates/updates mesh registry keyed by `nodeId` | Prefer stable mesh registry over full scene rebuilds. |
| Running total / purchase summary | React DOM text and derived store state | Babylon GUI HUD text blocks and totals panel | Keep the calculation in shared state, but render it inside Babylon during planner use. |
| Cabinet list / insertion UI | React DOM drawer | Babylon GUI panel, radial picker, or collapsible touch tray | Treat cabinet selection as part of the planner runtime rather than outside chrome. |
| Desktop viewport control (3-button mouse) | browser-default or OrbitControls overlay | Left-drag to rotate, Right-drag to pan, Middle-wheel to zoom | Arc-ball orbit control pattern; matches CAD/3D modeling standards. |
| Mobile camera gestures | browser-default touch behavior | Two-finger orbit, single-finger pan, pinch to zoom | Simplified touch-friendly viewport navigation. |
| Cabinet placement constraints | Manual snapping, no per-object rules | Base cabinets: XZ plane only (floor level) / Wall cabinets: XYZ (vertical movement allowed) | Controlled via ERP product config; ensures realistic placement. |

---

## Migration principles

1. Keep planner domain state engine-agnostic.
2. Keep the persisted snapshot schema unchanged during the renderer swap.
3. Keep pricing, product metadata, and planner calculations in shared state even if Babylon renders the HUD.
4. Treat touch and mobile ergonomics as parity requirements, not optional polish.
5. Migrate all planner-session UI into Babylon GUI; do not leave hybrid DOM-canvas surfaces for planner use.
6. Reach parity before adding Babylon-only upgrades that change planner business behavior.
7. Isolate Babylon lifecycle code from general React UI code.
8. Preserve `.glb` ingestion and Django endpoints as-is unless a concrete asset metadata gap appears.
9. Prefer one planner interaction system over split DOM-versus-canvas UX.
10. Treat collision detection and feedback as a core parity concern, not a polish enhancement.

---

## Phased implementation plan

### Phase 0 - Foundation, collision, and guardrails
Scope:
- Add Babylon dependencies:
  - `@babylonjs/core`
  - `@babylonjs/loaders`
  - `@babylonjs/gui`
  - `@babylonjs/havok` for collision detection and physics
- Set up basic Havok instance and physics engine integration.
- Introduce a planner-runtime seam so the planner shell can swap from the current R3F scene host to Babylon without changing planner business logic.
- Move shared math that should survive the engine swap into engine-neutral helpers if needed.
- Define the input model for desktop (pointer, drag, gizmo) and mobile (touch, gesture) before scene parity work starts.
- Plan the complete UI migration scope: cabinet picker, totals, stage actions, contextual controls all into Babylon GUI.

Deliverables:
- Babylon packages installed, including Havok.
- Havok physics engine initialized and ready for planner collision setup.
- New planner runtime scaffold renders a blank Babylon scene with Babylon GUI in Next.js without SSR problems.
- Planner shell can point to either runtime behind one component boundary.
- Device profile or capability layer exists for mobile-safe defaults.
- Interaction mapping plan finalized: drag-based move/rotate with collision-aware snapping, IKEA-style viewport controls.

Validation:
- `npm run build` passes.
- No hydration/runtime errors when opening the kitchen designer route.
- Basic runtime opens on a phone browser without input or layout breakage.

### Phase 1 - Static scene and HUD foundation
Scope:
- Port `RoomScene3D` to Babylon runtime host.
- Port camera framing behavior from `SceneCamera.tsx`.
- Port light rig from `SceneLights.tsx`.
- Port room shell from `RoomShell.tsx`.
- Support compact and full rendering modes.
- Stand up Babylon GUI root structure for planner HUD zones.
- Place a running total/status panel inside the Babylon GUI layer.

Deliverables:
- Room geometry and camera respond to planner room changes.
- Compact review preview works.
- Babylon HUD renders inside the planner runtime and survives resize.

Validation:
- Change room wall measurements in the 2D editor and confirm the Babylon room updates immediately.
- Confirm compact and full views both frame the room correctly.
- Resize across desktop and phone widths and confirm HUD anchors remain usable.

### Phase 2 - Planner node rendering and complete UI migration
Scope:
- Port planner node rendering from `ProductNode.tsx`.
- Render fallback boxes for products without `.glb`.
- Load `.glb` assets from existing Django-provided URLs.
- Normalize model bounds and scale them to planner dimensions.
- Build a mesh registry keyed by `nodeId`.
- **Migrate ALL planner-session UI into Babylon GUI**:
  - Cabinet or module picker for product insertion.
  - Running total and price summary.
  - Stage badges or mode indicators.
  - Save, share, and back affordances.
  - Help text or planner messaging.
  - All other existing planner-session DOM surfaces.

Deliverables:
- Add products from the Babylon planner UI and see them appear in the Babylon scene.
- Snapshot rehydration restores existing nodes correctly.
- Users can choose cabinet types from within the Babylon planner runtime.

Validation:
- Add at least one placeholder product and one GLB-backed product.
- Reload from a saved snapshot and verify mesh positions and dimensions.
- Confirm product insertion and price summary remain in sync with store state.

### Phase 3 - Interaction parity with action buttons and collision
Scope:
- Port selection and empty-space deselection.
- Implement selection-first interaction model with context-dependent action buttons:
  - Left-click on cabinet to select it and display contour highlight.
  - Cursor changes to hand-icon on hover over interactive objects; object brightens or changes contrast.
  - Action buttons appear after selection (2 or 3 buttons depending on `allow_vertical_movement` flag from ERP):
    - **Always**: Move button (drag cabinet on XZ plane or XYZ depending on cabinet type)
    - **Always**: Rotate button (rotate cabinet around vertical axis)
    - **If `allow_vertical_movement` == true**: Vertical movement button (drag cabinet up/down in Y axis)
  - Left-click empty space to deselect and hide buttons.
- Implement button-driven drag behavior:
  - After clicking Move button, user left-clicks and drags the cabinet to move it.
  - After clicking Rotate button, user left-clicks and drags horizontally to rotate.
  - After clicking Vertical button (if available), user left-clicks and drags vertically to lift/lower.
- Implement movement constraints per cabinet type:
  - Base cabinets: constrain movement to XZ plane (floor level), no vertical lift.
  - Wall cabinets: allow XYZ movement (controlled by `allow_vertical_movement` flag from ERP).
- Port 50 mm snapping, 140 mm wall snapping, room clamping, and wall-facing auto-rotation.
- Preserve current interaction mode state in `plannerStore.ts`.
- Implement IKEA-style viewport control (independent of selection state):
  - Left-click + drag (on empty space or while holding modifier): rotate view (arc-ball orbit).
  - Right-click + drag: pan view.
  - Middle mouse wheel: zoom in/out.
  - Note: Viewport controls always work, even when a cabinet is selected and buttons are visible.
  - Simplified touch equivalent: two-finger drag to orbit, single-finger pan, pinch to zoom.
- Add Havok-based collision detection and feedback:
  - Detect cabinet-to-cabinet and cabinet-to-wall collisions during drag.
  - Visual feedback (highlight, shake, or opacity change) when placement invalid.
  - Smart snapping: auto-align cabinet to walls or adjacent cabinets when proximity threshold met.
  - Prevent placement of invalid transforms; do not allow object to overlap walls or other cabinets.

Deliverables:
- Selection-first interaction with explicit action buttons (no hidden mode toggles or mode buttons).
- Clear visual feedback: cursor changes, hover brightening, selection contour, action buttons.
- Collision-aware placement prevents overlaps and provides visual feedback.
- Smart snapping aligns cabinets smoothly to walls and adjacent cabinets.
- Movement constraints enforced: base cabinets stay on floor, wall cabinets respect `allow_vertical_movement` flag.
- Viewport controls remain independent and always accessible, even with selected objects.
- IKEA-style viewport navigation on desktop and mobile.

Validation:
- Manual parity check for desktop interaction:
  - Hover over cabinet: cursor changes to hand, object brightens
  - Left-click cabinet: selection contour appears, 2 or 3 action buttons appear (depending on flag)
  - Click Move button, then left-drag cabinet: smooth movement with collision prevention
  - Drag near wall or adjacent cabinet: smart snap engages
  - Click Rotate button, then left-drag horizontally: cabinet rotates
  - Click Vertical button (if available), then left-drag vertically: cabinet moves up/down (wall cabinets only)
  - Left-click empty space: object deselects, contour and buttons disappear
  - While object is selected, right-drag viewport: pan the view (object stays selected)
  - While object is selected, left-drag viewport (not on object): rotate view smoothly (object stays selected)
  - While object is selected, middle-wheel: zoom in and out (object stays selected)
  - Base cabinet: Vertical button does not appear; vertical drag ignored
  - Wall cabinet with flag enabled: Vertical button appears; can drag vertically
- Manual mobile check for:
  - Tap cabinet: selection highlights, buttons appear
  - Tap Move button, then single-finger drag: move cabinet (with collision feedback)
  - Tap Rotate button, then single-finger drag: rotate cabinet
  - Tap Vertical button (if available), then drag vertically: lift/lower cabinet
  - Two-finger drag (not on selected object): orbit view
  - Single-finger pan: pan view
  - Pinch gesture: zoom in/out
  - Tap empty space: deselect and hide buttons

### Phase 4 - Polish action buttons, viewport controls, and collision feedback
Scope:
- All planner-session UI already lives in Babylon (from Phase 2), so polish the cohesion and feel.
- Polish action button affordances: 
  - Action buttons animate in smoothly when object is selected.
  - Buttons are large enough and well-spaced for touch targets.
  - Button labels or icons clearly indicate Move, Rotate, Vertical movement.
  - Buttons update color or state to reflect current interaction mode (e.g., Move button highlights when active).
  - Buttons fade out or hide smoothly when object is deselected.
- Add drag feedback animations: preview destination while dragging, smooth snap-to-grid animations, highlight selected cabinet.
- Enhance collision feedback: dim overlapping cabinets, show "placement invalid" indicator, allow user to preview final position before release.
- Add motion and transitions: smooth camera arc during orbit, ease-in on snap alignment, subtle shadow or glow during drag.
- Ensure viewport control feels natural and responsive (low latency on orbit/pan/zoom) even while object is selected and buttons are visible.
- Tune Havok collision checks and snapping thresholds for real-world performance on desktop and mobile.

Deliverables:
- Action buttons feel responsive and visually integrated with the selected cabinet.
- Drag-based move/rotate and viewport controls feel smooth and responsive.
- Collision feedback is immediate and prevents invalid placements.
- Smart snapping engages smoothly without jarring jumps.
- Cabinet selection, action buttons, and planner HUD feel unified and responsive.
- Selection state does not interfere with viewport control.

Validation:
- Selected-object action buttons stay anchored and visible as the camera moves.
- Mobile and desktop users can complete the same basic placement loop: select → click action → drag.
- Collision detection does not introduce noticeable latency or jitter on test devices.
- Viewport control is responsive when object is selected (no lag or input blocking).

### Phase 5 - Shell integration and text cleanup
Scope:
- Replace scene usage in:
  - `DesignerShell.tsx`
  - `PlannerReviewShell.tsx`
- Update customer-facing copy in `app/kitchen-designer/page.tsx` to remove Three.js / React Three Fiber references.
- Keep `DesignerCanvas.tsx` in place; do not delete yet (in case niche use cases exist).
- Reduce planner-specific React DOM chrome so the active planner flow primarily lives inside Babylon once the route is loaded.

Deliverables:
- Planner flow uses Babylon scene end-to-end.
- Landing page text reflects Babylon-based renderer or becomes engine-neutral.
- Planner route behaves more like a full-screen interactive tool than a page with layered widgets.

Validation:
- Walk full planner flow from landing page to room edit to product placement to review shell.
- Confirm the flow remains usable on phone-sized screens.

### Phase 6 - Dependency removal and cleanup
Scope:
- Remove `three`, `@react-three/fiber`, and `@react-three/drei` once no active imports remain.
- Delete or archive other obsolete scene modules from the Three.js era.
- Confirm `DesignerCanvas.tsx` has no consumers, then remove or archive it.
- Remove stale copy and comments referring to Three.js.

Deliverables:
- No live Three/R3F code paths remain.
- `DesignerCanvas.tsx` and related scene infrastructure retired.
- Dependency tree reflects Babylon-only rendering.

Validation:
- Search the frontend for lingering Three/R3F imports.
- Confirm no consumers call `DesignerCanvas.tsx`.
- Build and smoke test after dependency removal.

### Phase 7 - Advanced collision, physics, and game-like polish after parity
Scope:
- Extend Havok-based collision to support clearance zones, cabinet-to-cabinet proximity warnings, or physics-based snapping.
- Add richer feedback such as highlight layers, particles, sound cues, or haptic feedback for collisions.
- Introduce cabinet shadow projections, ambient occlusion, or advanced lighting for game-like presence.
- Consider inventory-based packing optimization or automatic placement suggestions.
- Add more game-like affordances only after the practical planner loop is stable on desktop and mobile.

Deliverables:
- Babylon migration becomes a functional upgrade, not only a renderer swap.

---

## Validation matrix for the migration

### Functional validation
- Room dimensions update both 2D and 3D views consistently.
- Planner UI insertion adds nodes correctly.
- Selected state changes correctly.
- Movement and rotation update the store correctly.
- Save/load round-trip preserves node transforms.
- Review shell still renders current room and items.
- Running totals and planner UI remain in sync with store state.

### Technical validation
- `npm run build`
- Targeted manual smoke test of:
  - `/kitchen-designer`
  - `/kitchen-designer/[projectId]`
  - review route linked from the planner shell
- Search-based check for removed Three/R3F imports at the end of migration.
- Manual mobile smoke test on at least one iPhone-class browser and one Android-class browser.

### Visual validation
- Camera framing matches prior compact/full experience closely enough.
- GLB orientation and scale remain correct.
- Selected-item controls remain legible and correctly positioned.
- Babylon GUI remains readable and touchable on small screens.

---

## ERP Product Configuration Extension

To support movement constraints per cabinet type, add a new checkbox field to the ERP product design settings:

- **Field name**: `allow_vertical_movement` (boolean, default: false)
- **UI label**: "Allow Vertical Movement in 3D Designer"
- **Applies to**: All products that can be placed in the kitchen designer.
- **Behavior**:
  - When `false`: Cabinet is constrained to XZ plane (floor level). Base cabinets, island bases, and plinths use this.
  - When `true`: Cabinet can move in XYZ (including vertical). Wall cabinets, open shelving, and upper cabinets use this.
- **API integration**:
  - Include `allow_vertical_movement` in the planner catalog API response.
  - Babylon interaction controller reads this flag and enforces constraints during drag.
- **Validation**:
  - Planner snapping logic checks this flag before allowing vertical movement.
  - Movement outside constraints is silently clamped; user sees drag stop at constraint boundary.

---

## Selected Cabinet Action Buttons Design

When a user selects a cabinet, a set of action buttons appear to drive all interactions. This design eliminates the ambiguity between drag-to-move and viewport orbit by making interaction modes explicit and intentional.

### Selection Affordances

- **Hover state**: When the cursor moves over a cabinet or interactive object:
  - Cursor changes from arrow icon to hand-icon (or pointing finger on touch).
  - Object brightens, increases contrast, or adds a highlight tint to signal interactivity.
  - No buttons appear yet; this is purely a hover affordance.

- **Selection state**: When user left-clicks a cabinet:
  - Cabinet becomes "selected" and displays a contour outline or highlight.
  - Selection contour remains visible until user clicks empty space or selects a different cabinet.
  - Action buttons appear anchored to the selected cabinet or in a HUD zone (e.g., bottom-center or side panel).

### Action Buttons (2 or 3 depending on ERP configuration)

All selected cabinets display at least:
1. **Move button** (icon: four-directional arrow or hand-move icon)
   - After clicking: Enter "move mode"
   - User then left-clicks and drags the cabinet to move it on the XZ plane (or XYZ if allowed).
   - Snapping, collision detection, and constraints apply during drag.

2. **Rotate button** (icon: curved arrow or rotation symbol)
   - After clicking: Enter "rotate mode"
   - User then left-clicks and drags horizontally to rotate the cabinet around the vertical (Y) axis.
   - Snapping to wall angles (e.g., 0°, 90°, 180°, 270°) applies during rotation.

If `allow_vertical_movement == true`:
3. **Vertical movement button** (icon: up-down arrows or lift symbol)
   - After clicking: Enter "vertical mode"
   - User then left-clicks and drags vertically (up/down) to move the cabinet in the Y axis.
   - Only available for wall cabinets, open shelving, and other products tagged as "vertically movable."
   - Base cabinets do not show this button.

### Button Interaction Flow

1. User hovers cabinet → cursor changes, object brightens.
2. User left-clicks cabinet → selection contour + buttons appear.
3. User clicks desired button (Move/Rotate/Vertical) → button highlights or changes state.
4. User left-clicks and drags → cabinet moves/rotates/lifts according to the active mode.
5. User releases → placement finalizes; collision checks prevent invalid placement.
6. User clicks empty space → selection clears, contour and buttons disappear.

### Viewport Control Independence

- Viewport control (orbit, pan, zoom) is **always available**, even when a cabinet is selected and buttons are visible.
- If user wants to rotate the view while a cabinet is selected:
  - Right-click + drag to pan (always available).
  - Left-click + drag on **empty space** (not on the cabinet) to orbit. Babylon's scene controller prioritizes empty-space interactions.
  - Middle-wheel to zoom (always available).
- The selected cabinet **remains selected** and buttons **remain visible** during viewport navigation.
- This ensures users can adjust their view without accidentally deselecting or losing focus on the cabinet they are working with.

### Touch Interaction Equivalent

On mobile/touch devices:
- Hover not applicable; all selection is via tap.
- Tap cabinet → selection + buttons appear.
- Tap button to enter mode, then single-finger drag to move/rotate/lift.
- Two-finger drag to orbit view (independent of selection).
- Pinch to zoom.
- Single-finger drag on empty space to pan.
- Tap empty space to deselect.

---

## Viewport Navigation Pattern (IKEA Pax Planner Style)

The planner should use the standard 3-button mouse + arc-ball orbit pattern:

**Desktop (3-button mouse + keyboard)**:
- **Left-click + drag**: Rotate the view (arc-ball orbit around scene center).
  - Horizontal drag: yaw rotation around the up-axis.
  - Vertical drag: pitch rotation around the side-axis.
  - Pattern matches: Blender, Maya, most CAD software, and IKEA Pax Planner.
- **Right-click + drag**: Pan the view (translate camera laterally).
  - All directions supported.
  - Useful for repositioning the view without changing angle.
- **Middle mouse wheel**: Zoom in and out.
  - Scroll up: zoom closer.
  - Scroll down: zoom farther.
  - Smooth and responsive.

**Mobile (touch)**:
- **Single-finger drag on empty space**: Pan the view (same as right-click drag).
- **Two-finger drag**: Orbit the view (same as left-click drag).
  - Use the centroid of the two touches and compare delta to orbit.
- **Pinch gesture**: Zoom in and out (same as middle wheel).
  - Standard pinch-to-zoom on modern browsers.

**Interaction precedence**:
1. If pointer is over a cabinet (mesh pick), enable drag-move-rotate for that cabinet.
2. If pointer is in empty space, enable viewport control (orbit/pan/zoom).
3. If a cabinet is selected and user drags it, viewport control is disabled during the drag.

---

## Risks and mitigations

### Risk: Next.js client/SSR issues with Babylon
Mitigation:
- Keep Babylon scene host client-only.
- Use dynamic import with `ssr: false` if needed.

### Risk: Loss of React-style declarative scene ergonomics
Mitigation:
- Use a dedicated scene sync layer and mesh registry so React state changes stay predictable.

### Risk: Overlay controls are harder without `Html`
Mitigation:
- Use Babylon GUI for planner-specific HUD and controls, and keep the initial control set focused so the first pass does not try to rebuild every site-level UI pattern inside the engine.

### Risk: Babylon GUI can become harder to maintain than React DOM if overused
Mitigation:
- Restrict Babylon GUI to planner runtime surfaces.
- Keep routing, auth, and non-planner site chrome in React.
- Keep data derivation in shared state and render it in Babylon rather than re-implementing planner logic inside GUI widgets.

### Risk: Mobile performance or touch ergonomics may be weaker than desktop
Mitigation:
- Introduce device profiles early.
- Tune DPR, shadows, and effects for phones.
- Validate touch workflows on real devices before closing parity phases.

### Risk: GLB orientation or pivot mismatches become more visible
Mitigation:
- Add explicit import normalization utilities and, if necessary later, ERP-side orientation metadata.

### Risk: Bundle size regression
Mitigation:
- Import Babylon modules carefully and defer optional physics until parity is complete.
- Consider lazy-loading Havok or deferring advanced physics visualization to Phase 7.

### Risk: Drag-and-drop + viewport orbit may conflict (user confusion on which mode is active)
Resolution (via design, not just mitigation):
- **Selection-first interaction model**: User must explicitly click a cabinet to select it first; action buttons appear only after selection.
- **Viewport control never blocked**: User can always use middle-scroll, left-click, right-click for viewport orbit/pan/zoom, even when a cabinet is selected.
- **Clear visual affordances**: 
  - Cursor changes from arrow to hand-icon on hover over any interactive object.
  - Object brightens or increases contrast on hover to signal interactivity.
  - Selected object shows contour outline.
  - Action buttons appear as a distinct UI panel anchored near the selected object or in a fixed HUD zone.
- **No mode confusion**: Selection and viewport control are independent; selecting an object does not change mouse input handling for the viewport.

### Risk: Smart snapping may be too aggressive or too lenient
Mitigation:
- Tune snapping thresholds early: test 50 mm wall snap, 25 mm cabinet-to-cabinet snap with real users.
- Allow user to disable snapping temporarily (e.g., hold Alt key to free-drag without snap).
- Provide visual snap preview before placement engages (e.g., show grid lines or alignment indicators).

### Risk: Movement constraints (base vs. wall cabinets) may confuse users or cause UX edge cases
Mitigation:
- Show visual constraint feedback: if user drags a base cabinet upward, highlight the constraint boundary and prevent lift.
- On-hover tooltip or tutorial: explain why a cabinet won't lift or won't move vertically.
- ERP admin UI should clearly label the `allow_vertical_movement` flag so product managers understand which cabinets get which constraint.

### Risk: Collision detection may slow down interaction or introduce jitter
Mitigation:
- Test Havok performance on real mobile devices in Phase 3.
- Consider spatial indexing or culling to avoid checking every cabinet pair.
- Tune collision checks to run during drag, not per-frame; finalize placement on release.
- Use simplified collision shapes (boxes) for performance, not full mesh geometry.

### Risk: Migration expands into a redesign
Mitigation:
- Hold feature scope to parity first.
- Keep advanced collision visualization and gamification upgrades in Phase 7.

---

## Resolved decisions

1. **Move/rotate interaction**: Use selection-first model with explicit action buttons (Move, Rotate, Vertical) rather than gizmos or hidden mode toggles.
   - User selects cabinet first (left-click); contour + 2–3 action buttons appear.
   - User clicks desired action button (Move, Rotate, or Vertical if allowed), then drags.
   - No gizmos, no hidden modes, no drag-ambiguity with viewport orbit.
   - Clear visual affordances: hand-icon cursor, hover brightening, selection contour, action buttons.
   - Viewport controls (left/right/middle-mouse) remain always accessible, even when cabinet is selected.
   - Familiar UX to users who have used simple tools or IKEA planners.
   - Better touchscreen support: buttons are large, single-finger drag already understood by users.

2. **Planner UI migration scope**: Migrate ALL existing planner-session UI into Babylon GUI in Phase 2.
   - Cabinet picker, running total, stage badges, contextual actions, and messages all move into Babylon.
   - No hybrid DOM-canvas UI for planner sessions after Phase 2 is complete.

3. **Viewport control pattern**: Use 3-button mouse arc-ball orbit + IKEA Pax Planner navigation.
   - Left-drag: orbit (rotate view).
   - Right-drag: pan.
   - Middle-wheel: zoom.
   - Matches CAD/3D software standards; familiar to power users.
   - Touch equivalent: two-finger orbit, single-finger pan, pinch zoom.

4. **Movement constraints per cabinet type**: Base cabinets XZ-only; wall cabinets XYZ (gated by ERP flag).
   - Add `allow_vertical_movement` boolean to ERP product settings.
   - Babylon interaction controller enforces constraints during drag; user sees drag stop at boundary.
   - Enables realistic kitchen layouts without mode toggles or user confusion.

5. **Havok collision in Phase 0**: Include `@babylonjs/havok` package and basic collision setup from the start.
   - Collision detection informs placement validity during drag (prevents overlaps).
   - Smart snapping uses collision detection to align cabinets at proximity thresholds.
   - Advanced clearance visualization and physics can extend into Phase 7, but collision checks belong in core Phase 3.

---

## Recommended execution order

1. Install Babylon core/loaders/gui and create a client-only Babylon planner runtime.
2. Stand up the room shell, camera, lights, and base HUD anchors.
3. Port planner node rendering, GLB scaling, and cabinet insertion UI.
4. Port selection, move, rotate, snap, and touch/mobile input behavior.
5. Complete Babylon GUI migration for contextual controls and planner HUD.
6. Swap `RoomScene3D` consumers to Babylon.
7. Remove Three/R3F dependencies.
8. Add Babylon-native collision and game-like enhancements only after parity is stable on desktop and mobile.

---

## Expected outcome

After the migration, the planner should still:
- use the same Django planner APIs
- use the same planner snapshot format
- use the same product catalog and `.glb` asset flow
- support the same room-definition and cabinet-placement slice

But the rendering layer will be positioned to support stronger collision handling, richer interaction controls, and more game-like feedback using Babylon-native tooling.

The planner experience should also be positioned to run as a unified Babylon-driven tool on desktop and mobile, with the room, cabinet selection, running totals, and contextual controls feeling like one interactive system instead of a split between canvas and DOM.
