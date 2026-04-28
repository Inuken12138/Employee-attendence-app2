# Payroll-First Analytics Plan

Date: 2026-04-19

## 1. Goal

Add a payroll-first analytics capability to the app that lets management view trusted KPIs from the existing operational database, then drill into payroll and attendance details without rebuilding business logic in the BI layer.

The first release should focus on:

- payroll cost trends
- attendance compliance
- overtime and leave impact
- department-level staffing and cost reporting
- project labor and bonus efficiency

The analytics stack should prefer free and open-source components by default.

## 2. Why Payroll First

Payroll already has the strongest reporting surface in the repository:

- attendance is pre-summarized by month
- payroll runs are frozen and auditable
- employee and workforce report previews already exist
- monthly summaries already persist totals that management cares about

That makes payroll the lowest-risk domain for an analytics rollout because the warehouse can validate itself against the current month-end payroll workflow.

## 3. Non-Goals For v1

Do not start with these areas:

- full planner or kitchen-designer analytics
- facial recognition telemetry analytics
- real-time streaming dashboards
- enterprise-wide data science tooling
- replacing the operational Django database

These can be added later, after payroll and attendance are stable in the warehouse.

## 4. Recommended Open-Source Stack

Use the simplest stack that can still grow:

- PostgreSQL for the operational app and initial analytics warehouse
- MinIO for raw and curated file storage
- Parquet as the file format for raw and curated snapshots
- dbt-core for transformations and tested marts
- DuckDB for local validation, ad hoc analysis, and fast prototype queries
- cron or systemd timers for refresh jobs in v1
- Apache Superset or Metabase for dashboards

This keeps recurring cost close to zero while the analytics scope is still modest.

## 5. Source Of Truth And Data Flow

Keep the current Django database as the operational source of truth.

Recommended flow:

1. Extract payroll, attendance, adjustments, projects, orders, inventory, and reference dimensions from PostgreSQL.
2. Land immutable snapshots in MinIO as Parquet.
3. Transform raw snapshots into curated warehouse marts.
4. Expose the curated marts to dashboards and export endpoints.
5. Reconcile warehouse totals against payroll runs and monthly summaries.

The analytics pipeline should read directly from the database, not from the existing REST API, because the API is optimized for the app UI rather than ETL throughput.

## 6. Domain Scope For Phase 1

### A. Payroll and Attendance

This is the first and most important domain.

Key metrics:

- gross payable amount
- total deductions
- approved overtime minutes and cost
- late minutes
- absence minutes
- leave minutes
- full-attendance eligibility
- payroll headcount
- department payroll totals

Source tables and outputs should align with the current payroll summaries and locked run artifacts.

### B. Projects

Add project labor analytics only after payroll is stable.

Key metrics:

- project labor spend
- bonus pool remaining
- project settlement amount
- employee share of project bonus

### C. Commerce And Inventory

These are second-wave analytics domains.

Key metrics:

- order count
- revenue
- average order value
- product and category mix
- restock risk
- low-stock items

## 7. Warehouse Model

Use a small star schema rather than copying operational tables one-to-one.

Dimensions:

- dim_date
- dim_employee
- dim_department
- dim_payroll_policy_version
- dim_product
- dim_category
- dim_project
- dim_customer

Facts:

- fact_attendance_day
- fact_payroll_month
- fact_payroll_adjustment
- fact_project_labor
- fact_order_item
- fact_inventory_snapshot
- fact_review

Important modeling rule:

- payroll policy and compensation profile data must be treated as versioned and effective-dated dimensions
- category and product attribution should be snapshotted at transaction time
- money must use decimal precision, never floating point

## 8. Proposed Backend Shape

Add a new Django app named analytics.

Suggested responsibilities:

- extraction and refresh management commands
- warehouse reconciliation helpers
- analytics serializers and query views
- export endpoints for CSV or Excel
- metadata for BI embeds or deep links

Suggested API family:

- /api/analytics/overview/
- /api/analytics/payroll/
- /api/analytics/attendance/
- /api/analytics/projects/
- /api/analytics/commerce/
- /api/analytics/inventory/
- /api/analytics/refresh-status/
- /api/analytics/exports/

The first release can be read-only.

## 9. Frontend Shape

Add a management-facing analytics page in the Next.js app.

Recommended UI behavior:

- a top-level analytics entry point for management
- a payroll-first landing page with cards and trend charts
- filters for month, department, employee, and project
- drill-through links back to Salary Studio for payroll details
- optional embedded dashboards when a BI tool is selected

Salary Studio should remain the detailed payroll workspace. Analytics should complement it, not replace it.

## 10. Refresh Strategy

Start with a simple batch refresh.

Recommended sequence:

1. nightly or manual refresh for payroll and attendance
2. monthly backfill for historical validation
3. incremental refresh once the warehouse is trusted

Suggested orchestration order:

- v1: cron or systemd timers
- v2: Airbyte OSS or Meltano only if external ingestion becomes important
- v3: stronger orchestration only if the refresh graph becomes large enough to justify it

## 11. Data Quality And Reconciliation

Every warehouse refresh should produce validation output.

Checks to include:

- payroll monthly totals match locked payroll runs
- attendance totals match attendance monthly summaries
- project labor totals match the settled project amounts
- order totals match commerce order headers and items
- inventory snapshots are internally consistent

Also record:

- refresh timestamp
- row counts
- duplicate detection
- missing key counts
- mismatch flags

If the warehouse cannot reconcile, the dashboard should show a data freshness warning instead of silently presenting stale numbers.

## 12. BI Presentation Choice

Recommended default:

- Apache Superset or Metabase for internal dashboards

Use Tableau or Power BI only as downstream presentation layers if management already depends on them.

Why pay for Power BI:

- private sharing and collaboration
- scheduled refresh
- row-level security
- browser and mobile delivery
- Microsoft 365 integration

Why pay for Tableau:

- managed private dashboards
- enterprise sharing and subscriptions
- governance features
- existing Tableau user base in leadership

Why pay for managed platforms like Databricks or cloud analytics services:

- you want the vendor to own uptime, scaling, and platform maintenance
- multi-engine lakehouse features are needed
- governance and compliance costs are lower than self-hosting
- data volume or concurrency exceeds what a small self-managed stack can reasonably support

For the current app, those paid platforms are optional, not the default.

## 13. Implementation Phases

### Phase 1: Payroll Foundation

- define warehouse KPIs and reconciliation rules
- create analytics app skeleton
- add refresh command scaffolding
- land payroll and attendance snapshots
- build first payroll marts
- expose read-only payroll analytics endpoints
- wire a simple management page in the frontend

### Phase 2: Warehouse Expansion

- add project, commerce, and inventory facts
- add data-quality checks and refresh status APIs
- build department and executive dashboards
- add CSV or Excel export endpoints

### Phase 3: BI Integration

- connect Superset or Metabase first
- optionally connect Power BI or Tableau
- expose deep links from the app into the BI layer
- lock down access by role

### Phase 4: Operational Hardening

- backfill historical months
- validate against locked payroll periods
- add incremental refresh
- add monitoring and alerting for refresh failures
- document the analytics contracts

## 14. First Dashboards

The first set of dashboards should answer management questions directly:

- executive payroll overview
- monthly payroll trend
- attendance compliance by department
- overtime and leave impact
- staffing and headcount changes
- project labor efficiency
- inventory risk summary
- sales and order performance

## 15. Risks

Main risks to manage:

- payroll rules drift between the operational app and analytics marts
- effective-dated compensation or policy changes causing historical mismatches
- data quality issues from missing worker IDs or incomplete attendance records
- category or product changes breaking historical commerce attribution
- too much scope too early

The best mitigation is to keep payroll as the first domain and validate every metric against existing monthly summaries and locked runs.

## 16. Acceptance Criteria For v1

The first release is acceptable when:

- payroll monthly totals reconcile with the current payroll workflow
- attendance metrics match the existing attendance summaries
- management can view payroll trends and department summaries in one place
- the analytics layer uses open-source components by default
- a BI tool can consume the curated warehouse without querying the transactional tables directly
- the system makes it clear when data is stale or not reconciled
