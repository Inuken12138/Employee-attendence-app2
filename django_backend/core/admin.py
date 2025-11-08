"""
Django Admin Configuration
-------------------------
This script registers models with Django's built-in admin interface, allowing for easy
management of database records through a web interface.

Current registered models:
- User: Custom user model for authentication
- Employee: Employee records management
- InventoryItem: Inventory tracking
- Product: Product catalog management

How to extend this configuration:
1. Basic Registration:
   To register additional models, simply add:
   admin.site.register(NewModel)

2. Custom Admin Classes:
   For more control over how models are displayed/managed:

   @admin.register(NewModel)
   class NewModelAdmin(admin.ModelAdmin):
       list_display = ['field1', 'field2']  # Fields to show in list view
       search_fields = ['field1']           # Fields to search
       list_filter = ['field1']             # Add filtering options
       ordering = ['field1']                # Default ordering

3. Inline Admin Classes:
   For related models that should be edited together:

   class RelatedModelInline(admin.TabularInline):
       model = RelatedModel

   @admin.register(MainModel)
   class MainModelAdmin(admin.ModelAdmin):
       inlines = [RelatedModelInline]
"""

from django.contrib import admin
from .models import User, InventoryItem, Product


# Register your models here.
admin.site.register(User)
admin.site.register(InventoryItem)
admin.site.register(Product)
