"""
URL configuration for django_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/

Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')

Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')

Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

"""
Django Project URLs vs App URLs

Project URLs (urls.py)
This is the root URL configuration for the entire Django project. It acts as the main routing table that directs 
traffic to different apps within your project.

Current Implementation
    urlpatterns = [
        path('admin/', admin.site.urls),    # Routes to Django admin interface
        path('api/', include('core.urls')),  # Routes to core app's URLs
    ]

Core URLs (urls.py)
The core app's URL configuration handles specific routes within that app. It defines endpoints for your API views 
and viewsets.

Key Differences
1. Scope
- Project URLs: Global routing, manages top-level URL patterns
- Core URLs: App-specific routing, handles API endpoint details

2. Hierarchy
- Project URLs: Root level, prefixes all app URLs
- Core URLs: Secondary level, defines endpoints under api/

3. Purpose
- Project URLs:
  - Directs traffic to different apps
  - Manages admin interface routing
  - Handles project-wide URL patterns

- Core URLs:
  - Defines specific API endpoints
  - Manages ViewSet routing
  - Handles authentication URLs

Example Flow
When a request comes to http://yourdomain.com/api/employees/:

1. Project URLs sees /api/ and forwards to core.urls
2. Core URLs handles /employees/ and routes to appropriate ViewSet

Current Structure

yourdomain.com/                  # Root
├── admin/                       # Django admin interface
└── api/                        # Your API (managed by core.urls)
    ├── employees/              # Employee endpoints
    ├── inventory/              # Inventory endpoints
    ├── products/               # Product endpoints
    ├── users/                  # User endpoints
    └── auth/                   # Authentication endpoints

This separation allows for better organization and scalability as you add more apps to your project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/employees/', include('erp.employee_management.urls')), 
]
