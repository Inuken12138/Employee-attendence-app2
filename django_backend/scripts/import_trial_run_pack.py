#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, parse, request


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = ROOT_DIR / 'docs' / 'trial-run-bulk-import'


def normalize_text(value: Any) -> str:
    return str(value or '').strip()


def optional_text(value: Any) -> str | None:
    normalized = normalize_text(value)
    return normalized or None


def parse_bool(value: Any, default: bool = False) -> bool:
    normalized = normalize_text(value).lower()
    if not normalized:
        return default
    return normalized in {'1', 'true', 'yes', 'y', 'on'}


def parse_int(value: Any, field_name: str) -> int:
    normalized = normalize_text(value)
    if not normalized:
        raise ValueError(f'{field_name} is required.')
    try:
        return int(normalized)
    except ValueError as exc:
        raise ValueError(f'{field_name} must be an integer.') from exc


def require_value(row: dict[str, str], field_name: str, context: str) -> str:
    value = normalize_text(row.get(field_name))
    if not value:
        raise ValueError(f'{context}: {field_name} is required.')
    return value


def load_csv_rows(file_path: Path, required_columns: tuple[str, ...]) -> list[dict[str, str]]:
    if not file_path.exists():
        return []

    with file_path.open('r', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            return []

        missing_columns = [column for column in required_columns if column not in reader.fieldnames]
        if missing_columns:
            raise ValueError(f'{file_path.name}: missing required columns: {", ".join(missing_columns)}')

        rows: list[dict[str, str]] = []
        for line_number, raw_row in enumerate(reader, start=2):
            row = {key: normalize_text(value) for key, value in raw_row.items()}
            first_value = next((value for value in row.values() if value), '')
            if not first_value:
                continue
            if first_value.startswith('#'):
                continue

            row['__line__'] = str(line_number)
            rows.append(row)

    return rows


def flatten_error_message(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        return '; '.join(flatten_error_message(item) for item in payload)
    if isinstance(payload, dict):
        if 'error' in payload:
            return flatten_error_message(payload['error'])
        parts = []
        for key, value in payload.items():
            parts.append(f'{key}: {flatten_error_message(value)}')
        return '; '.join(parts)
    return str(payload)


class ApiError(RuntimeError):
    pass


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.headers = {
            'Accept': 'application/json',
        }
        if token:
            self.headers['Authorization'] = f'Token {token}'

    def _build_url(self, path: str, query: dict[str, Any] | None = None) -> str:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if query:
            encoded = parse.urlencode({key: value for key, value in query.items() if value is not None})
            if encoded:
                url = f'{url}?{encoded}'
        return url

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None, query: dict[str, Any] | None = None) -> Any:
        data = None
        headers = dict(self.headers)
        if payload is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(payload).encode('utf-8')

        req = request.Request(self._build_url(path, query=query), data=data, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                body = response.read().decode('utf-8')
                return json.loads(body) if body else None
        except error.HTTPError as exc:
            body = exc.read().decode('utf-8', errors='replace')
            try:
                payload = json.loads(body) if body else {}
            except json.JSONDecodeError:
                payload = body or exc.reason
            raise ApiError(f'{method} {path} failed: {flatten_error_message(payload)}') from exc
        except error.URLError as exc:
            raise ApiError(f'Could not reach {self.base_url}: {exc.reason}') from exc

    def get_records(self, path: str, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        payload = self.request('GET', path, query=query)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get('records'), list):
            return payload['records']
        raise ApiError(f'Unexpected list payload from {path}.')

    def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.request('POST', path, payload=payload)
        if not isinstance(response, dict):
            raise ApiError(f'Unexpected object payload from POST {path}.')
        return response

    def patch(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.request('PATCH', path, payload=payload)
        if not isinstance(response, dict):
            raise ApiError(f'Unexpected object payload from PATCH {path}.')
        return response


@dataclass
class SyncStats:
    created: int = 0
    updated: int = 0
    skipped: int = 0


def build_policy_lookup(records: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, Any]]:
    lookup = {}
    for record in records:
        lookup[(normalize_text(record.get('policy_code')), int(record.get('version_number') or 1))] = record
    return lookup


def build_employee_lookup(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup = {}
    for record in records:
        worker_id = normalize_text(record.get('worker_id'))
        if worker_id:
            lookup[worker_id] = record
    return lookup


def build_profile_lookup(records: list[dict[str, Any]]) -> dict[tuple[int, str], dict[str, Any]]:
    lookup = {}
    for record in records:
        employee_id = record.get('employee')
        effective_from = normalize_text(record.get('effective_from'))
        if employee_id and effective_from:
            lookup[(int(employee_id), effective_from)] = record
    return lookup


def build_adjustment_lookup(records: list[dict[str, Any]]) -> dict[tuple[int, int, int, str, str], dict[str, Any]]:
    lookup = {}
    for record in records:
        key = (
            int(record['employee']),
            int(record['year']),
            int(record['month']),
            normalize_text(record.get('adjustment_type')),
            normalize_text(record.get('notes')),
        )
        lookup[key] = record
    return lookup


def sync_policies(client: ApiClient, rows: list[dict[str, str]], errors: list[str]) -> dict[tuple[str, int], dict[str, Any]]:
    stats = SyncStats()
    policy_lookup = build_policy_lookup(client.get_records('/payroll/policies/'))

    for row in rows:
        context = f"payroll_policies.csv line {row['__line__']}"
        try:
            policy_code = require_value(row, 'policy_code', context)
            version_number = int(optional_text(row.get('version_number')) or '1')
            payload = {
                'policy_code': policy_code,
                'name': require_value(row, 'name', context),
                'version_number': version_number,
                'effective_from': require_value(row, 'effective_from', context),
                'effective_to': optional_text(row.get('effective_to')),
                'rice_allowance_amount': optional_text(row.get('rice_allowance_amount')) or '0',
                'social_security_allowance_amount': optional_text(row.get('social_security_allowance_amount')) or '0',
                'full_attendance_bonus_amount': optional_text(row.get('full_attendance_bonus_amount')) or '0',
                'labor_pool_percent': optional_text(row.get('labor_pool_percent')) or '0.10',
                'normal_work_hours_per_day': optional_text(row.get('normal_work_hours_per_day')) or '8',
                'salary_days_per_month': parse_int(optional_text(row.get('salary_days_per_month')) or '30', 'salary_days_per_month'),
                'overtime_multiplier': optional_text(row.get('overtime_multiplier')) or '2.00',
                'late_grace_minutes': parse_int(row['late_grace_minutes'], 'late_grace_minutes') if optional_text(row.get('late_grace_minutes')) else None,
                'rounding_unit_amount': parse_int(optional_text(row.get('rounding_unit_amount')) or '1000', 'rounding_unit_amount'),
                'rounding_rule': optional_text(row.get('rounding_rule')) or 'nearest_thousand',
                'unapproved_absence_incident_threshold': parse_int(
                    optional_text(row.get('unapproved_absence_incident_threshold')) or '2',
                    'unapproved_absence_incident_threshold',
                ),
                'status': optional_text(row.get('status')) or 'draft',
                'currency': optional_text(row.get('currency')) or 'LAK',
                'is_active': parse_bool(row.get('is_active')),
            }

            existing = policy_lookup.get((policy_code, version_number))
            if existing:
                saved = client.patch(f"/payroll/policies/{existing['id']}/", payload)
                stats.updated += 1
                print(f'Updated payroll policy {policy_code} v{version_number}.')
            else:
                saved = client.post('/payroll/policies/', payload)
                stats.created += 1
                print(f'Created payroll policy {policy_code} v{version_number}.')

            policy_lookup[(policy_code, version_number)] = saved
        except Exception as exc:
            errors.append(f'{context}: {exc}')

    print(f'Payroll policies: {stats.created} created, {stats.updated} updated, {stats.skipped} skipped.')
    return policy_lookup


def sync_employees(client: ApiClient, rows: list[dict[str, str]], errors: list[str]) -> dict[str, dict[str, Any]]:
    stats = SyncStats()
    employee_lookup = build_employee_lookup(client.get_records('/employees/'))

    for row in rows:
        context = f"employees.csv line {row['__line__']}"
        try:
            worker_id = require_value(row, 'worker_id', context)
            payload = {
                'worker_id': worker_id,
                'name': require_value(row, 'name', context),
                'base_salary': require_value(row, 'base_salary', context),
                'is_active': parse_bool(row.get('is_active'), default=True),
            }

            existing = employee_lookup.get(worker_id)
            if existing:
                saved = client.patch(f"/employees/{existing['id']}/", payload)
                stats.updated += 1
                print(f'Updated employee {worker_id}.')
            else:
                saved = client.post('/employees/', payload)
                stats.created += 1
                print(f'Created employee {worker_id}.')

            employee_lookup[worker_id] = saved
        except Exception as exc:
            errors.append(f'{context}: {exc}')

    print(f'Employees: {stats.created} created, {stats.updated} updated, {stats.skipped} skipped.')
    return employee_lookup


def sync_compensation_profiles(
    client: ApiClient,
    rows: list[dict[str, str]],
    employee_lookup: dict[str, dict[str, Any]],
    policy_lookup: dict[tuple[str, int], dict[str, Any]],
    errors: list[str],
) -> None:
    stats = SyncStats()
    profile_lookup = build_profile_lookup(client.get_records('/payroll/compensation-profiles/'))

    for row in rows:
        context = f"compensation_profiles.csv line {row['__line__']}"
        try:
            worker_id = require_value(row, 'worker_id', context)
            employee_record = employee_lookup.get(worker_id)
            if employee_record is None:
                raise ValueError(f'Employee {worker_id} does not exist yet.')

            policy_id = None
            policy_code = optional_text(row.get('payroll_policy_code'))
            if policy_code:
                policy_version = int(optional_text(row.get('payroll_policy_version')) or '1')
                policy_record = policy_lookup.get((policy_code, policy_version))
                if policy_record is None:
                    raise ValueError(f'Payroll policy {policy_code} v{policy_version} was not found.')
                policy_id = policy_record['id']

            payload = {
                'employee': employee_record['id'],
                'monthly_salary': require_value(row, 'monthly_salary', context),
                'rice_allowance_amount': optional_text(row.get('rice_allowance_amount')),
                'social_security_allowance_amount': optional_text(row.get('social_security_allowance_amount')),
                'eligible_for_social_security': parse_bool(row.get('eligible_for_social_security'), default=True),
                'trial_period_end_date': optional_text(row.get('trial_period_end_date')),
                'payroll_policy': policy_id,
                'effective_from': require_value(row, 'effective_from', context),
                'effective_to': optional_text(row.get('effective_to')),
            }

            lookup_key = (int(employee_record['id']), payload['effective_from'])
            existing = profile_lookup.get(lookup_key)
            if existing:
                client.patch(f"/payroll/compensation-profiles/{existing['id']}/", payload)
                stats.updated += 1
                print(f'Updated compensation profile for {worker_id} starting {payload["effective_from"]}.')
            else:
                saved = client.post('/payroll/compensation-profiles/', payload)
                profile_lookup[lookup_key] = saved
                stats.created += 1
                print(f'Created compensation profile for {worker_id} starting {payload["effective_from"]}.')
        except Exception as exc:
            errors.append(f'{context}: {exc}')

    print(f'Compensation profiles: {stats.created} created, {stats.updated} updated, {stats.skipped} skipped.')


def sync_adjustments(
    client: ApiClient,
    rows: list[dict[str, str]],
    employee_lookup: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    stats = SyncStats()
    adjustment_cache: dict[tuple[int, int], dict[tuple[int, int, int, str, str], dict[str, Any]]] = {}

    for row in rows:
        context = f"payroll_adjustments.csv line {row['__line__']}"
        try:
            worker_id = require_value(row, 'worker_id', context)
            employee_record = employee_lookup.get(worker_id)
            if employee_record is None:
                raise ValueError(f'Employee {worker_id} does not exist yet.')

            year = parse_int(row.get('year'), 'year')
            month = parse_int(row.get('month'), 'month')
            cache_key = (year, month)
            if cache_key not in adjustment_cache:
                adjustment_cache[cache_key] = build_adjustment_lookup(
                    client.get_records('/payroll/adjustments/', query={'year': year, 'month': month})
                )

            notes = optional_text(row.get('notes')) or ''
            lookup_key = (
                int(employee_record['id']),
                year,
                month,
                require_value(row, 'adjustment_type', context),
                notes,
            )
            payload = {
                'employee': employee_record['id'],
                'year': year,
                'month': month,
                'adjustment_type': lookup_key[3],
                'amount': require_value(row, 'amount', context),
                'approval_status': optional_text(row.get('approval_status')) or 'pending',
                'notes': notes,
            }

            existing = adjustment_cache[cache_key].get(lookup_key)
            if existing:
                saved = client.patch(f"/payroll/adjustments/{existing['id']}/", payload)
                adjustment_cache[cache_key][lookup_key] = saved
                stats.updated += 1
                print(f'Updated payroll adjustment for {worker_id} ({year}-{month:02d}, {lookup_key[3]}).')
            else:
                saved = client.post('/payroll/adjustments/', payload)
                adjustment_cache[cache_key][lookup_key] = saved
                stats.created += 1
                print(f'Created payroll adjustment for {worker_id} ({year}-{month:02d}, {lookup_key[3]}).')
        except Exception as exc:
            errors.append(f'{context}: {exc}')

    print(f'Payroll adjustments: {stats.created} created, {stats.updated} updated, {stats.skipped} skipped.')


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Bulk import trial-run payroll seed data through the existing backend APIs.',
    )
    parser.add_argument(
        '--input-dir',
        default=str(DEFAULT_INPUT_DIR),
        help='Directory that contains the CSV template pack.',
    )
    parser.add_argument(
        '--api-base',
        default='http://localhost:8000/api',
        help='Base API URL, usually the Django backend under /api.',
    )
    parser.add_argument(
        '--token',
        default=None,
        help='Optional DRF auth token if the API is protected.',
    )
    parser.add_argument(
        '--timeout',
        type=int,
        default=30,
        help='HTTP timeout in seconds.',
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).expanduser().resolve()
    if not input_dir.exists():
        print(f'Input directory does not exist: {input_dir}', file=sys.stderr)
        return 1

    try:
        policy_rows = load_csv_rows(
            input_dir / 'payroll_policies.csv',
            ('policy_code', 'name', 'effective_from'),
        )
        employee_rows = load_csv_rows(
            input_dir / 'employees.csv',
            ('worker_id', 'name', 'base_salary'),
        )
        compensation_rows = load_csv_rows(
            input_dir / 'compensation_profiles.csv',
            ('worker_id', 'monthly_salary', 'effective_from'),
        )
        adjustment_rows = load_csv_rows(
            input_dir / 'payroll_adjustments.csv',
            ('worker_id', 'year', 'month', 'adjustment_type', 'amount'),
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    client = ApiClient(base_url=args.api_base, token=args.token, timeout=args.timeout)
    errors: list[str] = []

    print(f'Using input pack: {input_dir}')
    print(f'Using API base: {args.api_base}')

    try:
        policy_lookup = sync_policies(client, policy_rows, errors)
        employee_lookup = sync_employees(client, employee_rows, errors)
        sync_compensation_profiles(client, compensation_rows, employee_lookup, policy_lookup, errors)
        sync_adjustments(client, adjustment_rows, employee_lookup, errors)
    except ApiError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if errors:
        print('\nCompleted with row errors:', file=sys.stderr)
        for row_error in errors:
            print(f'- {row_error}', file=sys.stderr)
        return 1

    print('\nImport completed successfully.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())