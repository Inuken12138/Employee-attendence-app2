# Attendance Modernization Plan (Factory + Offsite)

Date: 2026-02-07

## 1) Industry approaches for innovative time tracking (factory context)
This section summarizes common approaches used by major attendance/time-tracking platforms and modern workforce systems.

### A. Multi-signal time validation ("defense in depth")
Most leading platforms do not rely on a single signal. They combine:
- **Device identity** (registered mobile device or kiosk)
- **Location** (geofence + GPS + Wi-Fi/BLE corroboration)
- **Biometrics** (face match, liveness detection)
- **Schedule rules** (shift windows, breaks, tolerances)
- **Anomaly detection** (suspicious patterns, repeated late/early punches)

### B. Geofencing + Wi‑Fi + BLE beacons
- Geofencing is widely used, but **GPS alone is noisy** indoors or near large structures.
- Many platforms use **Wi‑Fi SSID/BSSID** or **BLE beacons** to confirm on‑site presence.
- Result: clock‑ins are valid only if **geofence + Wi‑Fi or BLE** match.

### C. Kiosk mode with biometrics
- Factory environments often use a **shared kiosk** (tablet/terminal) with:
  - face recognition
  - QR or NFC badge
  - PIN fallback
- It reduces mobile dependency and supports stable on‑site flows.

### D. Remote worker verification
- Remote/offsite work uses:
  - **mobile geofence**
  - **periodic location ping** (e.g., every 2–3 hours)
  - **photo/face re‑check** (with liveness)
  - **task confirmation** (simple “still on site” prompts)

### E. Compliance & audit trails
- Leading platforms emphasize **auditability**:
  - immutable punch logs
  - punch edits with manager approval
  - reason codes for manual entries
  - device + IP + location snapshots per punch

### F. Productivity add‑ons (optional)
- Some platforms offer time‑on‑task via app usage or project timers.
- For a factory, these are less useful; better to focus on **presence + shift compliance**.

---

## 2) Recommendations for your hybrid on‑site + off‑site system
You already have `Workplace` and `EmployeeFaceProfile` in `models.py`. Below are practical additions and refinements.

### A. Attendance capture channels
1) **On‑site kiosk** (primary for factory)
   - Fixed tablet/terminal at entry.
   - Face verification + optional PIN.
   - Reliable network, lower phone dependency.

2) **Mobile app** (required for off‑site)
   - Geofence + face match.
   - Device registration (pair user to device, one device at a time).

3) **Fallback manual correction**
   - Manager‑approved edits with reason code.

### B. Geofence + indoor confirmation
- Keep geofencing for all sites.
- Add at least one **secondary signal**:
  - **Wi‑Fi SSID/BSSID** match (cheap and reliable).
  - **BLE beacon** in factory entrances or break areas.
- On‑site punches should require **geofence + Wi‑Fi/BLE** to reduce spoofing.

### C. Liveness + face match
- Face recognition should include **liveness checks** (blink/turn head/texture checks).
- Re‑verify for off‑site punches and for periodic location checks (optional low friction).

### D. Periodic location checks (your idea) — refined
- Good idea, but keep it **lightweight** to avoid battery drain and privacy issues.
- Recommended pattern:
  - **Randomized window** every 2–3 hours (prevents gaming).
  - If the worker fails two consecutive pings, flag for supervisor review.
  - Do **not** require a full selfie every time; alternate:
    - Location ping only
    - Quick selfie check 1–2 times per day

### E. Shift + break enforcement
- Configure the system for your rules:
  - Clock‑in at 08:00
  - Lunch break 12:00–13:00
  - Clock‑out at 17:00
  - Monday–Saturday
- Allow grace windows (e.g., ±10 minutes) to reduce false violations.

### F. Off‑site guardrails
- For construction sites, create **temporary Workplaces** with:
  - GPS polygon or radius
  - optional supervisor QR code or BLE beacon for first‑day validation
- Require **supervisor acknowledgment** if no geofence is active.

### G. Anti‑spoofing safeguards (practical)
- **Location + Wi‑Fi/BLE** together
- **Device binding** (one registered phone per employee)
- **Photo EXIF + device ID** checks (reject missing metadata)
- **Speed checks** (reject impossible movement between sites)

---

## 3) Data model extensions (backend)
Suggested additions to align with the plan (names are suggestions):

### A. Core attendance
- `AttendanceEvent`
  - employee
  - timestamp
  - type (`clock_in`, `clock_out`, `break_out`, `break_in`)
  - source (`kiosk`, `mobile`)
  - device_id
  - gps_lat, gps_lng, gps_accuracy
  - wifi_ssid, wifi_bssid
  - beacon_id (optional)
  - face_match_score
  - liveness_score
  - status (`accepted`, `rejected`, `flagged`)
  - reason_code

### B. Device registration
- `EmployeeDevice`
  - employee
  - device_id
  - platform
  - last_seen_at
  - is_active

### C. Geofence/worksite metadata
- Extend `Workplace`
  - geometry_type (`radius` or `polygon`)
  - polygon_points (JSON) for construction sites
  - wifi_whitelist (list of SSID/BSSID)
  - beacon_ids (list)

### D. Location checks
- `LocationCheck`
  - employee
  - requested_at
  - responded_at
  - gps_lat/lng/accuracy
  - status (`pass`, `fail`, `missed`)

### E. Audit trail
- `AttendanceEditRequest`
  - employee
  - original_event
  - requested_by
  - approved_by
  - reason
  - status

---

## 4) Workflow design

### On‑site (factory)
1. Worker uses kiosk face check to clock in at 08:00.
2. System verifies:
   - face match + liveness
   - geofence + Wi‑Fi/BLE
3. Lunch: clock out at 12:00, clock in at 13:00.
4. End shift: clock out at 17:00.

### Off‑site (construction)
1. Worker clocks in via mobile app.
2. System verifies:
   - geofence
   - face match (with liveness)
   - device binding
3. Random location checks every 2–3 hours.
4. Missed checks -> flagged for supervisor.

---

## 5) Implementation phases

### Phase 1 — Foundation (2–4 weeks)
- Implement `AttendanceEvent` and `EmployeeDevice`.
- Mobile punch flow with geofence + device binding.
- Kiosk basic flow for factory.

### Phase 2 — Reliability (2–3 weeks)
- Add Wi‑Fi/BLE verification.
- Add liveness scoring.
- Add audit trail + manager approval.

### Phase 3 — Off‑site enforcement (2–3 weeks)
- Add periodic location checks.
- Add supervisor review dashboard.

---

## 6) Suggestions tailored to your concern ("selfie behind the wall")
To reduce spoofing while keeping operations smooth:
- Require **geofence + Wi‑Fi/BLE** for on‑site.
- Introduce **randomized location checks** during the day.
- Use **occasional selfie re‑checks** for off‑site.
- Enforce **device registration** and reject unknown devices.

---

## 7) Next steps
- Confirm which signals you want to enforce on‑site vs off‑site.
- Decide whether kiosk hardware will be used.
- Decide how strict you want “missed check” handling to be.
- If you want, I can draft the data models and API endpoints next.
