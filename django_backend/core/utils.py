import re
from datetime import date, datetime, timedelta


WEEKDAY_LABELS = (
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
)

_TIME_VALUE_PATTERN = re.compile(r'^(\d{1,2}):(\d{1,2})$')


def normalize_worker_id(value):
    return str(value or '').strip()


def normalize_employee_name(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).casefold()


def normalize_clock_time(value):
    match = _TIME_VALUE_PATTERN.match(str(value or '').strip())
    if not match:
        return ''

    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return ''

    return f'{hour:02d}:{minute:02d}'


def parse_attendance_date_range(value):
    matches = re.findall(r'\d{4}-\d{1,2}-\d{1,2}', str(value or ''))
    if len(matches) < 2:
        return None, None

    try:
        start_date = date.fromisoformat(matches[0])
        end_date = date.fromisoformat(matches[1])
    except ValueError:
        return None, None

    return start_date, end_date


def parse_sheet_generated_at(value):
    match = re.search(r'\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2}:\d{2})?', str(value or ''))
    if not match:
        return None

    token = match.group(0)
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            parsed = datetime.strptime(token, fmt)
        except ValueError:
            continue

        return parsed.strftime('%Y-%m-%d %H:%M:%S') if ' ' in fmt else parsed.date().isoformat()

    return None


def build_roster_schedule_lookup(raw_schedule, cycle_length_weeks):
    return {
        (entry['week_index'], entry['day_of_week']): entry
        for entry in validate_roster_schedule(raw_schedule, cycle_length_weeks)
    }


def resolve_roster_day(schedule_lookup, cycle_length_weeks, effective_start_date, target_date):
    if not schedule_lookup or not effective_start_date or not target_date or cycle_length_weeks < 1:
        return None

    effective_week_start = effective_start_date - timedelta(days=effective_start_date.weekday())
    target_week_start = target_date - timedelta(days=target_date.weekday())
    week_delta = (target_week_start - effective_week_start).days // 7
    cycle_week_index = (week_delta % cycle_length_weeks) + 1
    day_of_week = target_date.weekday()

    entry = schedule_lookup.get((cycle_week_index, day_of_week))
    if entry is None:
        return None

    return {
        'week_index': cycle_week_index,
        'day_of_week': day_of_week,
        'weekday_label': WEEKDAY_LABELS[day_of_week],
        'is_working': bool(entry['is_working']),
        'morning_in': entry['morning_in'],
        'morning_out': entry['morning_out'],
        'afternoon_in': entry['afternoon_in'],
        'afternoon_out': entry['afternoon_out'],
    }


def build_default_roster_schedule(cycle_length_weeks):
    schedule = []
    for week_index in range(1, cycle_length_weeks + 1):
        for day_of_week in range(7):
            schedule.append({
                'week_index': week_index,
                'day_of_week': day_of_week,
                'is_working': False,
                'morning_in': '',
                'morning_out': '',
                'afternoon_in': '',
                'afternoon_out': '',
            })
    return schedule


def validate_roster_schedule(raw_schedule, cycle_length_weeks):
    if cycle_length_weeks < 1 or cycle_length_weeks > 4:
        raise ValueError('Cycle length must be between 1 and 4 weeks.')

    schedule = {
        (entry['week_index'], entry['day_of_week']): entry
        for entry in build_default_roster_schedule(cycle_length_weeks)
    }

    if raw_schedule is None:
        raw_schedule = []
    if not isinstance(raw_schedule, list):
        raise ValueError('Schedule must be a list of day entries.')

    seen = set()
    for entry in raw_schedule:
        if not isinstance(entry, dict):
            raise ValueError('Each schedule entry must be an object.')

        try:
            week_index = int(entry.get('week_index'))
            day_of_week = int(entry.get('day_of_week'))
        except (TypeError, ValueError):
            raise ValueError('Each schedule entry needs a valid week and weekday.')

        if week_index < 1 or week_index > cycle_length_weeks:
            raise ValueError('Week index is outside the selected cycle length.')
        if day_of_week < 0 or day_of_week > 6:
            raise ValueError('Day of week must be between 0 (Monday) and 6 (Sunday).')
        if (week_index, day_of_week) in seen:
            raise ValueError('Each week/day combination can appear only once in a roster.')
        seen.add((week_index, day_of_week))

        is_working = bool(entry.get('is_working'))
        normalized_entry = {
            'week_index': week_index,
            'day_of_week': day_of_week,
            'is_working': is_working,
            'morning_in': '',
            'morning_out': '',
            'afternoon_in': '',
            'afternoon_out': '',
        }

        if is_working:
            normalized_entry['morning_in'] = normalize_clock_time(entry.get('morning_in'))
            normalized_entry['morning_out'] = normalize_clock_time(entry.get('morning_out'))
            normalized_entry['afternoon_in'] = normalize_clock_time(entry.get('afternoon_in'))
            normalized_entry['afternoon_out'] = normalize_clock_time(entry.get('afternoon_out'))
            if not all(
                [
                    normalized_entry['morning_in'],
                    normalized_entry['morning_out'],
                    normalized_entry['afternoon_in'],
                    normalized_entry['afternoon_out'],
                ]
            ):
                raise ValueError('Working days require morning and afternoon start/end times.')

        schedule[(week_index, day_of_week)] = normalized_entry

    return [
        schedule[(week_index, day_of_week)]
        for week_index in range(1, cycle_length_weeks + 1)
        for day_of_week in range(7)
    ]


def summarize_roster_schedule(raw_schedule, cycle_length_weeks):
    schedule = validate_roster_schedule(raw_schedule, cycle_length_weeks)
    summary_lines = []

    for week_index in range(1, cycle_length_weeks + 1):
        week_entries = [entry for entry in schedule if entry['week_index'] == week_index]
        working_entries = [entry for entry in week_entries if entry['is_working']]
        if not working_entries:
            summary_lines.append(f'Week {week_index}: off all week')
            continue

        day_label = _compress_weekday_labels([entry['day_of_week'] for entry in working_entries])
        time_blocks = {
            (
                entry['morning_in'],
                entry['morning_out'],
                entry['afternoon_in'],
                entry['afternoon_out'],
            )
            for entry in working_entries
        }
        if len(time_blocks) == 1:
            morning_in, morning_out, afternoon_in, afternoon_out = next(iter(time_blocks))
            time_label = f'{morning_in}-{morning_out} / {afternoon_in}-{afternoon_out}'
        else:
            time_label = 'custom hours'

        summary_lines.append(f'Week {week_index}: {day_label} · {time_label}')

    return summary_lines


def _compress_weekday_labels(day_numbers):
    ordered = sorted(set(day_numbers))
    if not ordered:
        return 'No work days'

    ranges = []
    range_start = ordered[0]
    previous = ordered[0]
    for day_number in ordered[1:]:
        if day_number == previous + 1:
            previous = day_number
            continue

        ranges.append(_format_weekday_range(range_start, previous))
        range_start = day_number
        previous = day_number

    ranges.append(_format_weekday_range(range_start, previous))
    return ', '.join(ranges)


def _format_weekday_range(start_day, end_day):
    start_label = WEEKDAY_LABELS[start_day][:3]
    end_label = WEEKDAY_LABELS[end_day][:3]
    if start_day == end_day:
        return start_label
    return f'{start_label}-{end_label}'