"""Core app configuration.

This registers the repository's main business app with Django so the models,
API views, and migrations become part of the project runtime.
"""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Tell Django how to load the core app."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
