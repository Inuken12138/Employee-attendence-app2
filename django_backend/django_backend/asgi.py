"""ASGI entry point for async-capable Django deployments.

If this backend is served by an ASGI server such as Uvicorn or Daphne, that
server imports ``application`` from this module. In development the team mostly
uses ``runserver``, but this file is still part of the production/deployment
surface and is useful to know during onboarding.
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_backend.settings')

application = get_asgi_application()