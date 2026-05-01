#!/usr/bin/env python3
"""Entry point for Django management commands used by local developers.

This file is the shell-facing doorway into the backend. Commands like
``runserver``, ``migrate``, ``createsuperuser``, and ``test`` all start here,
then Django bootstraps the project using ``django_backend.settings``.
"""
import os
import sys


def main():
    """Load project settings and delegate the command to Django.

    Django's management framework expects the settings module to be configured
    before it can resolve apps, models, and database connections. This helper
    does that setup once, then hands the full command-line argument list to
    ``execute_from_command_line``.
    """
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_backend.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
