"""Planner app configuration.

Registering this app lets Django load the kitchen-planner models, APIs, and
admin screens during project startup.
"""

from django.apps import AppConfig


class PlannerConfig(AppConfig):
    """Tell Django how to register the planner app."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'planner'
