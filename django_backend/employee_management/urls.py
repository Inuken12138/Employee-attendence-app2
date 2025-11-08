from django.urls import path
from . import views

app_name = 'employee_management'

urlpatterns = [
    path('', views.employee_list, name='employee-list'),
    path('<int:pk>/', views.employee_detail, name='employee-detail'),

    # path('departments/', views.department_list, name='department-list'),
    # path('attendance/', views.attendance_list, name='attendance-list'),
]