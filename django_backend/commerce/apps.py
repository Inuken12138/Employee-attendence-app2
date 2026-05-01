"""Commerce app configuration.

The commerce app owns persistent shopping-cart and order data. Django imports
this config during startup so the app can be registered in ``INSTALLED_APPS``.
"""

from django.apps import AppConfig


class CommerceConfig(AppConfig):
    """Tell Django how to register the commerce app."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'commerce'
