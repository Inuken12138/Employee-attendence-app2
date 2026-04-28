"""
Django URLs.py - Purpose and Relationship
Theoretical Understanding
The urls.py file acts as the URL configuration and routing system in Django applications. It maps URLs to 
their corresponding views, effectively creating the API endpoints that clients can interact with.

Relationship with Other Components:

1. Views (views.py)
   - URLs direct incoming requests to appropriate view functions/classes
   - Each URL pattern is linked to a specific view that handles the request
   - Example relationship:

    from .views import EmployeeViewSet
    router.register(r'employees', EmployeeViewSet)

2. Router (DRF)
   - Uses DRF's DefaultRouter to automatically generate URL patterns for ViewSets
   - Creates standard RESTful URLs (GET, POST, PUT, DELETE)
   - Handles both list and detail views

3. Settings (settings.py)
   - Root URL configuration is defined in settings
   - Middleware and authentication settings affect URL processing

Current Implementation
1. Router Registration
   - Registers ViewSets for core models:
        - /employees/ - Employee management
        - /inventory/ - Inventory items
        - /products/ - Product catalog
        - /users/ - User information
        
2. Authentication URLs
   - /register/ - New user registration
   - /logout/ - User logout
   - /api-token-auth/ - Token authentication
   - /login/ - User login
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DepartmentViewSet, EmployeeViewSet, InventoryItemViewSet, ProductViewSet, UserViewSet, RegisterView, LogoutView, LoginView, AttendanceRecordsParseView, AttendanceRecordsSaveView, AttendanceRecordsSaveDraftView, AttendanceRecordsFetchView, AttendanceRecordsDraftFetchView, AttendanceRecordsHistoryView, PayrollLeaveRecordsView, PayrollLeaveRecordDetailView, PayrollLeaveRecordSubmitView, PayrollLeaveRecordApproveView, PayrollLeaveRecordRejectView, PayrollLeaveRecordRecordUnapprovedView, PayrollOvertimeDecisionsView, PayrollOvertimeDecisionDetailView, PayrollAttendanceResolutionsView, PayrollAttendanceResolutionDetailView, PayrollAttendanceResolutionApproveView, PayrollAttendanceResolutionPartialApproveView, PayrollAttendanceResolutionDenyView, WorkplaceViewSet, FaceEnrollView, FaceVerifyView, CategoryViewSet, ReviewViewSet, RosterTemplateViewSet
from .payroll_views import PayrollPoliciesView, PayrollPolicyActiveView, PayrollPolicyDetailView, PayrollPolicyActivateView, PayrollPolicyArchiveView, PayrollPolicyCloneView, PayrollCompensationProfilesView, PayrollCompensationProfileDetailView, PayrollPaidRestRequestsView, PayrollPaidRestRequestDetailView, PayrollPaidRestRequestSubmitView, PayrollPaidRestRequestApproveView, PayrollPaidRestRequestRejectView, PayrollPaidRestBalancesView, PayrollAttendanceSummariesView, PayrollMonthlySummariesView, PayrollAdjustmentsView, PayrollAdjustmentDetailView, PayrollAdjustmentApproveView, ConstructionProjectsView, ConstructionProjectDetailView, ConstructionProjectAssignmentsView, ConstructionProjectAssignmentDetailView, ConstructionProjectWorkLogsView, ConstructionProjectWorkLogDetailView, ConstructionProjectSettleView, PayrollRunGenerateView, PayrollRunsView, PayrollRunDetailView, PayrollRunApproveView, PayrollRunLockView, PayrollRunCreateCorrectionView, PayrollRunDeltasView, PayrollRunReportsView, PayrollCarryForwardBalancesView, PayrollEmployeeReportPreviewView, PayrollWorkforceReportPreviewView, PayrollReportsGenerateView
from rest_framework.authtoken.views import obtain_auth_token

import logging

logger = logging.getLogger(__name__)

router = DefaultRouter()
logger.debug("Registering EmployeeViewSet at /employees/")
router.register(r'employees', EmployeeViewSet)
router.register(r'departments', DepartmentViewSet)
router.register(r'roster-templates', RosterTemplateViewSet)
print("Debug: Registering InventoryItemViewSet at /inventory/")  # Debug print
router.register(r'inventory', InventoryItemViewSet)
print("Debug: Registering ProductViewSet at /products/")  # Debug print
router.register(r'products', ProductViewSet)
print("Debug: Registering CategoryViewSet at /categories/")  # Debug print
router.register(r'categories', CategoryViewSet)
router.register(r'reviews', ReviewViewSet)
print("Debug: Registering UserViewSet at /users/")  # Debug print
router.register(r'users', UserViewSet)
router.register(r'workplaces', WorkplaceViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view()),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('api-token-auth/', obtain_auth_token),
    path('login/', LoginView.as_view(), name='login'),
   path('payroll/attendance-records/parse/', AttendanceRecordsParseView.as_view(), name='attendance-records-parse'),
   path('payroll/attendance-records/save/', AttendanceRecordsSaveView.as_view(), name='attendance-records-save'),
   path('payroll/attendance-records/save-draft/', AttendanceRecordsSaveDraftView.as_view(), name='attendance-records-save-draft'),
   path('payroll/attendance-records/history/', AttendanceRecordsHistoryView.as_view(), name='attendance-records-history'),
   path('payroll/attendance-records/', AttendanceRecordsFetchView.as_view(), name='attendance-records-fetch'),
   path('payroll/attendance-records/drafts/', AttendanceRecordsDraftFetchView.as_view(), name='attendance-records-draft-fetch'),
   path('payroll/leaves/', PayrollLeaveRecordsView.as_view(), name='payroll-leaves'),
   path('payroll/leaves/<int:pk>/', PayrollLeaveRecordDetailView.as_view(), name='payroll-leave-detail'),
   path('payroll/leaves/<int:pk>/submit/', PayrollLeaveRecordSubmitView.as_view(), name='payroll-leave-submit'),
   path('payroll/leaves/<int:pk>/approve/', PayrollLeaveRecordApproveView.as_view(), name='payroll-leave-approve'),
   path('payroll/leaves/<int:pk>/reject/', PayrollLeaveRecordRejectView.as_view(), name='payroll-leave-reject'),
   path('payroll/leaves/<int:pk>/record-unapproved/', PayrollLeaveRecordRecordUnapprovedView.as_view(), name='payroll-leave-record-unapproved'),
   path('payroll/overtime-decisions/', PayrollOvertimeDecisionsView.as_view(), name='payroll-overtime-decisions'),
   path('payroll/overtime-decisions/<int:pk>/', PayrollOvertimeDecisionDetailView.as_view(), name='payroll-overtime-decision-detail'),
   path('payroll/attendance-resolutions/', PayrollAttendanceResolutionsView.as_view(), name='payroll-attendance-resolutions'),
   path('payroll/attendance-resolutions/<int:pk>/', PayrollAttendanceResolutionDetailView.as_view(), name='payroll-attendance-resolution-detail'),
   path('payroll/attendance-resolutions/<int:pk>/approve-ot/', PayrollAttendanceResolutionApproveView.as_view(), name='payroll-attendance-resolution-approve-ot'),
   path('payroll/attendance-resolutions/<int:pk>/partial-approve-ot/', PayrollAttendanceResolutionPartialApproveView.as_view(), name='payroll-attendance-resolution-partial-approve-ot'),
   path('payroll/attendance-resolutions/<int:pk>/deny-ot/', PayrollAttendanceResolutionDenyView.as_view(), name='payroll-attendance-resolution-deny-ot'),
   path('payroll/policies/', PayrollPoliciesView.as_view(), name='payroll-policies'),
   path('payroll/policies/active/', PayrollPolicyActiveView.as_view(), name='payroll-policy-active'),
   path('payroll/policies/<int:pk>/', PayrollPolicyDetailView.as_view(), name='payroll-policy-detail'),
   path('payroll/policies/<int:pk>/activate/', PayrollPolicyActivateView.as_view(), name='payroll-policy-activate'),
   path('payroll/policies/<int:pk>/archive/', PayrollPolicyArchiveView.as_view(), name='payroll-policy-archive'),
   path('payroll/policies/<int:pk>/clone/', PayrollPolicyCloneView.as_view(), name='payroll-policy-clone'),
   path('payroll/compensation-profiles/', PayrollCompensationProfilesView.as_view(), name='payroll-compensation-profiles'),
   path('payroll/compensation-profiles/<int:pk>/', PayrollCompensationProfileDetailView.as_view(), name='payroll-compensation-profile-detail'),
   path('payroll/paid-rest/', PayrollPaidRestRequestsView.as_view(), name='payroll-paid-rest'),
   path('payroll/paid-rest/<int:pk>/', PayrollPaidRestRequestDetailView.as_view(), name='payroll-paid-rest-detail'),
   path('payroll/paid-rest/<int:pk>/submit/', PayrollPaidRestRequestSubmitView.as_view(), name='payroll-paid-rest-submit'),
   path('payroll/paid-rest/<int:pk>/approve/', PayrollPaidRestRequestApproveView.as_view(), name='payroll-paid-rest-approve'),
   path('payroll/paid-rest/<int:pk>/reject/', PayrollPaidRestRequestRejectView.as_view(), name='payroll-paid-rest-reject'),
   path('payroll/paid-rest-balances/', PayrollPaidRestBalancesView.as_view(), name='payroll-paid-rest-balances'),
   path('payroll/attendance-summary/', PayrollAttendanceSummariesView.as_view(), name='payroll-attendance-summary'),
   path('payroll/attendance-summaries/', PayrollAttendanceSummariesView.as_view(), name='payroll-attendance-summaries'),
   path('payroll/monthly-summaries/', PayrollMonthlySummariesView.as_view(), name='payroll-monthly-summaries'),
   path('payroll/adjustments/', PayrollAdjustmentsView.as_view(), name='payroll-adjustments'),
   path('payroll/adjustments/<int:pk>/', PayrollAdjustmentDetailView.as_view(), name='payroll-adjustment-detail'),
   path('payroll/adjustments/<int:pk>/approve/', PayrollAdjustmentApproveView.as_view(), name='payroll-adjustment-approve'),
   path('payroll/projects/', ConstructionProjectsView.as_view(), name='payroll-projects'),
   path('payroll/projects/<int:pk>/', ConstructionProjectDetailView.as_view(), name='payroll-project-detail'),
   path('payroll/projects/<int:project_id>/assignments/', ConstructionProjectAssignmentsView.as_view(), name='payroll-project-assignments'),
   path('payroll/project-assignments/<int:pk>/', ConstructionProjectAssignmentDetailView.as_view(), name='payroll-project-assignment-detail'),
   path('payroll/projects/<int:project_id>/work-logs/', ConstructionProjectWorkLogsView.as_view(), name='payroll-project-work-logs'),
   path('payroll/project-work-logs/<int:pk>/', ConstructionProjectWorkLogDetailView.as_view(), name='payroll-project-work-log-detail'),
   path('payroll/projects/<int:pk>/settle/', ConstructionProjectSettleView.as_view(), name='payroll-project-settle'),
   path('payroll/runs/generate/', PayrollRunGenerateView.as_view(), name='payroll-run-generate'),
   path('payroll/runs/', PayrollRunsView.as_view(), name='payroll-runs'),
   path('payroll/runs/<int:pk>/', PayrollRunDetailView.as_view(), name='payroll-run-detail'),
   path('payroll/runs/<int:pk>/approve/', PayrollRunApproveView.as_view(), name='payroll-run-approve'),
   path('payroll/runs/<int:pk>/lock/', PayrollRunLockView.as_view(), name='payroll-run-lock'),
   path('payroll/runs/<int:pk>/create-correction/', PayrollRunCreateCorrectionView.as_view(), name='payroll-run-create-correction'),
   path('payroll/runs/<int:pk>/deltas/', PayrollRunDeltasView.as_view(), name='payroll-run-deltas'),
   path('payroll/runs/<int:pk>/reports/', PayrollRunReportsView.as_view(), name='payroll-run-reports'),
   path('payroll/carry-forward-balances/', PayrollCarryForwardBalancesView.as_view(), name='payroll-carry-forward-balances'),
   path('payroll/reports/employee/', PayrollEmployeeReportPreviewView.as_view(), name='payroll-report-employee-preview'),
   path('payroll/reports/workforce/', PayrollWorkforceReportPreviewView.as_view(), name='payroll-report-workforce-preview'),
   path('payroll/reports/generate/', PayrollReportsGenerateView.as_view(), name='payroll-report-generate'),
   path('projects/', ConstructionProjectsView.as_view(), name='projects'),
   path('projects/<int:project_id>/assignments/', ConstructionProjectAssignmentsView.as_view(), name='project-assignments'),
   path('projects/<int:project_id>/worklogs/', ConstructionProjectWorkLogsView.as_view(), name='project-worklogs'),
   path('projects/<int:pk>/settle-bonus/', ConstructionProjectSettleView.as_view(), name='project-settle-bonus'),
   path('face/enroll/', FaceEnrollView.as_view(), name='face-enroll'),
   path('face/verify/', FaceVerifyView.as_view(), name='face-verify'),
    
]
