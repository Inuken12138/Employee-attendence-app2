from django.contrib import admin
from .models import User, Employee, InventoryItem, Product

admin.site.register(User)
admin.site.register(Employee)
admin.site.register(InventoryItem)
admin.site.register(Product)
