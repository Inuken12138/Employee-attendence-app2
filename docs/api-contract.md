# API Contract (Current)

Base URL: http://localhost:8000
All endpoints below are prefixed with `/api/` unless noted.

## Authentication
- POST `/api/register/`
  - Body: `username`, `password`, `email`, `role`
  - Response: user data
- POST `/api/login/`
  - Body: `username`, `password`
  - Response: `{ token }`
- POST `/api/logout/`
  - Auth: token
  - Response: `{ message }`
- POST `/api/api-token-auth/`
  - Body: `username`, `password`
  - Response: `{ token }`

## Employees
- GET `/api/employees/`
- POST `/api/employees/`
- GET `/api/employees/{id}/`
- PUT/PATCH `/api/employees/{id}/`
- DELETE `/api/employees/{id}/`

Employee fields include `name`, `worker_id`, `department`, `is_active`, and `base_salary`.

`base_salary` is now a read-only convenience field that returns the current monthly salary from the employee's active compensation profile as of today. Payroll source-of-truth data lives in compensation profiles, not in the employee record.

## Inventory
- GET `/api/inventory/`
- POST `/api/inventory/` (multipart for `image`)
- GET `/api/inventory/{id}/`
- PUT/PATCH `/api/inventory/{id}/` (multipart for `image`)
- DELETE `/api/inventory/{id}/`

Inventory fields include `item_code`, `name`, `image`, `quantity`, `least_inventory_amount`, `unit`.

## Categories
- GET `/api/categories/`
  - Query params: `slug`, `parent` (`null` for root)
- POST `/api/categories/` (multipart for `image`)
- GET `/api/categories/{id}/`
- PUT/PATCH `/api/categories/{id}/` (multipart for `image`)
- DELETE `/api/categories/{id}/`

Category fields include `name`, `slug`, `image`, `parent`, `display_order`.

## Products
- GET `/api/products/`
  - Query params: `category_slug`, `include_descendants`, `slug`, `search`, `product_id`
- POST `/api/products/` (multipart for `image`)
- GET `/api/products/{id}/`
- PUT/PATCH `/api/products/{id}/` (multipart for `image`)
- DELETE `/api/products/{id}/`

Product fields include `product_id`, `name`, `price`, `description`, `category`, `image`, `colour`, `material`, `is_best_seller`, `is_new`.

## Reviews
- GET `/api/reviews/`
  - Query params: `product`, `product_slug`
- POST `/api/reviews/` (auth required)
- GET `/api/reviews/{id}/`
- PUT/PATCH `/api/reviews/{id}/`
- DELETE `/api/reviews/{id}/`

Review fields include `product`, `rating`, `title`, `body`, `verified_purchase`.

## Users
- GET `/api/users/`
- GET `/api/users/{id}/`

Users are read-only via API.

## Workplaces
- GET `/api/workplaces/`
- POST `/api/workplaces/`
- GET `/api/workplaces/{id}/`
- PUT/PATCH `/api/workplaces/{id}/`
- DELETE `/api/workplaces/{id}/`

## Attendance Records
- POST `/api/payroll/attendance-records/parse/`
  - Multipart: `file`, `year`, `month`
  - Response: `{ year, month, days_in_month, employees[] }`
- POST `/api/payroll/attendance-records/save/`
  - JSON: `{ year, month, employees[] }`
  - Final save is rejected if any shift is missing.
- POST `/api/payroll/attendance-records/save-draft/`
  - JSON: `{ year, month, employees[] }`
- GET `/api/payroll/attendance-records/?year=YYYY&month=MM`
- GET `/api/payroll/attendance-records/drafts/?year=YYYY&month=MM`

Employee payload format (save/fetch):
- `worker_id`, `employee_name`, `department`
- `days`: map of `day` -> `{ raw_logs, morning, afternoon }`
- `morning`/`afternoon`: `{ in, out, status }`

## Face Recognition
- POST `/api/face/enroll/`
  - Multipart: `employee_id`, `face_image`
- POST `/api/face/verify/`
  - Body: `employee_id`, `latitude`, `longitude`

## Media
- `MEDIA_URL` serves uploaded files under `/media/` in development.

## Admin
- `/admin/` (not under `/api/`)
