"""HTTP API for planner product setup, project persistence, and review flows.

This module is the main request/response surface of the planner app. It covers
ERP product preparation, the published planner catalog, customer project saves,
validation runs, project sharing, duplication, and the conversion of a project
into locked cart lines.
"""

from django.shortcuts import get_object_or_404
from django.db.models import Max
from copy import deepcopy
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Product
from planner.models import (
    KitchenCartBundle,
    KitchenDesignerProductProfile,
    KitchenProject,
    KitchenProjectDuplication,
    KitchenProjectVersion,
    KitchenValidationRun,
    KitchenProductionAsset,
)
from planner.serializers import (
    KitchenCartBundleSerializer,
    KitchenDesignerAssetValidationSerializer,
    KitchenDesignerProductProfileSerializer,
    KitchenProjectDuplicationSerializer,
    KitchenProjectSerializer,
    KitchenProjectVersionSerializer,
    KitchenValidationRunSerializer,
    KitchenProductionAssetSerializer,
    PlannerCatalogProductSerializer,
)
from planner.services.asset_validation import validate_designer_profile
from planner.services.bom import build_project_bom
from planner.services.validation import validate_project_version
from planner.taxonomy import planner_path_is_complete


class PlannerProductProfileDetailView(APIView):
    """Read and update the planner profile attached to a catalog product."""

    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_profile(self, product_id):
        """Return the existing planner profile for a product or create a blank one."""

        product = get_object_or_404(Product, pk=product_id)
        profile, _ = KitchenDesignerProductProfile.objects.get_or_create(product=product)
        return profile

    def get(self, request, product_id):
        """Fetch the planner profile so ERP screens can render the current settings."""

        profile = self._get_profile(product_id)
        serializer = KitchenDesignerProductProfileSerializer(profile, context={'request': request})
        return Response(serializer.data)

    def patch(self, request, product_id):
        """Partially update planner metadata, asset references, and schemas."""

        profile = self._get_profile(product_id)
        serializer = KitchenDesignerProductProfileSerializer(
            profile,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user if request.user.is_authenticated else None)
        return Response(serializer.data)


class PlannerProductAssetValidateView(APIView):
    """Run planner asset validation for one product profile."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, product_id):
        """Validate the profile and return the persisted validation result."""

        product = get_object_or_404(Product, pk=product_id)
        profile, _ = KitchenDesignerProductProfile.objects.get_or_create(product=product)
        validation = validate_designer_profile(
            profile,
            validated_by=request.user if request.user.is_authenticated else None,
        )
        serializer = KitchenDesignerAssetValidationSerializer(validation)
        return Response(serializer.data)


class PlannerProductCatalogStateView(APIView):
    """Move planner products through staging, publishing, and unpublishing."""

    permission_classes = [permissions.AllowAny]

    def _get_profile(self, product_id):
        """Load or create the planner profile for the requested product."""

        product = get_object_or_404(Product, pk=product_id)
        profile, _ = KitchenDesignerProductProfile.objects.get_or_create(product=product)
        return profile

    def _serialize_profile(self, request, profile):
        """Return the standard serialized profile payload used by this view."""

        return KitchenDesignerProductProfileSerializer(profile, context={'request': request}).data

    def _latest_validation_passed(self, profile):
        """Check whether the most recent asset validation succeeded."""

        latest = profile.asset_validations.order_by('-validated_at').first()
        return latest and latest.status == 'passed'

    def post(self, request, product_id, action):
        """Handle the requested catalog-state transition after business checks."""

        profile = self._get_profile(product_id)

        if action == 'stage':
            if not profile.is_enabled:
                return Response({'detail': 'Enable planner support before staging this product.'}, status=status.HTTP_400_BAD_REQUEST)
            if not planner_path_is_complete(
                profile.planner_root_category,
                profile.planner_group_category,
                profile.planner_leaf_category,
            ):
                return Response({'detail': 'Select a complete planner category path before staging this product.'}, status=status.HTTP_400_BAD_REQUEST)
            if not profile.glb_file:
                return Response({'detail': 'Upload a .glb asset before staging this product.'}, status=status.HTTP_400_BAD_REQUEST)
            if not self._latest_validation_passed(profile):
                validation = validate_designer_profile(
                    profile,
                    validated_by=request.user if request.user.is_authenticated else None,
                )
                if validation.status != 'passed':
                    serializer = KitchenDesignerAssetValidationSerializer(validation)
                    return Response(
                        {
                            'detail': 'Fix validation errors before moving to staging.',
                            'validation': serializer.data,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            profile.catalog_state = KitchenDesignerProductProfile.CatalogState.STAGING
            profile.updated_by = request.user if request.user.is_authenticated else None
            profile.save(update_fields=['catalog_state', 'updated_by', 'updated_at'])
            return Response(self._serialize_profile(request, profile))

        if action == 'publish':
            if profile.catalog_state != KitchenDesignerProductProfile.CatalogState.STAGING:
                return Response({'detail': 'Move the product to staging before publishing.'}, status=status.HTTP_400_BAD_REQUEST)
            if not self._latest_validation_passed(profile):
                return Response({'detail': 'Run a passing asset validation before publishing.'}, status=status.HTTP_400_BAD_REQUEST)
            profile.catalog_state = KitchenDesignerProductProfile.CatalogState.PUBLISHED
            profile.updated_by = request.user if request.user.is_authenticated else None
            profile.save(update_fields=['catalog_state', 'updated_by', 'updated_at'])
            return Response(self._serialize_profile(request, profile))

        if action == 'unpublish':
            profile.catalog_state = KitchenDesignerProductProfile.CatalogState.ARCHIVED
            profile.updated_by = request.user if request.user.is_authenticated else None
            profile.save(update_fields=['catalog_state', 'updated_by', 'updated_at'])
            return Response(self._serialize_profile(request, profile))

        return Response({'detail': 'Unsupported catalog action.'}, status=status.HTTP_404_NOT_FOUND)


class PlannerProductProductionAssetListCreateView(APIView):
    """List and upload manufacturing assets for a planner profile."""

    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_profile(self, product_id):
        """Load or create the planner profile whose assets are being managed."""

        product = get_object_or_404(Product, pk=product_id)
        profile, _ = KitchenDesignerProductProfile.objects.get_or_create(product=product)
        return profile

    def get(self, request, product_id):
        """Return every production asset currently attached to the profile."""

        profile = self._get_profile(product_id)
        serializer = KitchenProductionAssetSerializer(profile.production_assets.all(), many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, product_id):
        """Validate and attach a new production asset to the planner profile."""

        profile = self._get_profile(product_id)
        serializer = KitchenProductionAssetSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(designer_profile=profile)
        if not profile.has_production_assets:
            profile.has_production_assets = True
            profile.save(update_fields=['has_production_assets', 'updated_at'])
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PlannerProductionAssetDetailView(APIView):
    """Delete a single production asset by id."""

    permission_classes = [permissions.AllowAny]

    def delete(self, request, asset_id):
        """Remove the asset and update the profile flag when none remain."""

        asset = get_object_or_404(KitchenProductionAsset, pk=asset_id)
        profile = asset.designer_profile
        asset.delete()
        if not profile.production_assets.exists() and profile.has_production_assets:
            profile.has_production_assets = False
            profile.save(update_fields=['has_production_assets', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlannerCatalogProductListView(APIView):
    """Return the published planner catalog visible inside the designer UI."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        """List published planner products with optional taxonomy filtering."""

        queryset = Product.objects.select_related('kitchen_designer_profile').filter(
            kitchen_designer_profile__is_enabled=True,
            kitchen_designer_profile__catalog_state=KitchenDesignerProductProfile.CatalogState.PUBLISHED,
        ).order_by('name')

        root_category = request.query_params.get('root_category')
        group_category = request.query_params.get('group_category')
        leaf_category = request.query_params.get('leaf_category')

        if root_category:
            queryset = queryset.filter(kitchen_designer_profile__planner_root_category=root_category)
        if group_category:
            queryset = queryset.filter(kitchen_designer_profile__planner_group_category=group_category)
        if leaf_category:
            queryset = queryset.filter(kitchen_designer_profile__planner_leaf_category=leaf_category)

        serializer = PlannerCatalogProductSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PlannerCatalogProductDetailView(APIView):
    """Return one published planner catalog product."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, product_id):
        """Fetch a single published planner product by primary key."""

        product = get_object_or_404(
            Product.objects.select_related('kitchen_designer_profile').filter(
                kitchen_designer_profile__is_enabled=True,
                kitchen_designer_profile__catalog_state=KitchenDesignerProductProfile.CatalogState.PUBLISHED,
            ),
            pk=product_id,
        )
        serializer = PlannerCatalogProductSerializer(product, context={'request': request})
        return Response(serializer.data)


class PlannerProjectListCreateView(APIView):
    """List the current user's projects or create a new project with version 1."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Return the authenticated user's planner projects."""

        projects = KitchenProject.objects.filter(owner=request.user).select_related('current_version').order_by('-updated_at', '-created_at')
        serializer = KitchenProjectSerializer(projects, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a project and immediately persist its initial scene snapshot."""

        project_data = {
            'title': request.data.get('title'),
            'status': request.data.get('status'),
            'estimated_price': request.data.get('estimated_price'),
            'share_mode': request.data.get('share_mode'),
        }
        serializer = KitchenProjectSerializer(
            data={key: value for key, value in project_data.items() if value is not None},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        project = serializer.save(owner=request.user)

        scene_snapshot = request.data.get('scene_snapshot') or {}
        if not isinstance(scene_snapshot, dict):
            scene_snapshot = {}

        estimated_price = serializer.validated_data.get('estimated_price') or request.data.get('estimated_price') or 0
        try:
            estimated_price = float(estimated_price)
        except (TypeError, ValueError):
            estimated_price = 0

        initial_version = KitchenProjectVersion.objects.create(
            project=project,
            version_name=request.data.get('version_name') or 'Initial version',
            created_by=request.user,
            version_number=1,
            scene_snapshot=scene_snapshot,
            price_snapshot=estimated_price,
            validation_summary=request.data.get('validation_summary') or {},
        )
        project.current_version = initial_version
        project.estimated_price = estimated_price
        project.save(update_fields=['current_version', 'estimated_price', 'updated_at', 'share_token'])

        return Response(KitchenProjectSerializer(project).data, status=status.HTTP_201_CREATED)


class PlannerProjectDetailView(APIView):
    """Read or partially update a single project owned by the current user."""

    permission_classes = [permissions.IsAuthenticated]

    def _get_project(self, request, project_slug):
        """Fetch one project and ensure the requester owns it."""

        return get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug, owner=request.user)

    def get(self, request, project_slug):
        """Return the project's current state and active version metadata."""

        project = self._get_project(request, project_slug)
        serializer = KitchenProjectSerializer(project)
        return Response(serializer.data)

    def patch(self, request, project_slug):
        """Update editable project metadata such as title or share mode."""

        project = self._get_project(request, project_slug)
        serializer = KitchenProjectSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_project = serializer.save()
        if updated_project.share_mode == KitchenProject.ShareMode.VIEW_LINK and not updated_project.share_token:
            updated_project.ensure_share_token()
            updated_project.save(update_fields=['share_token', 'updated_at'])
        return Response(KitchenProjectSerializer(updated_project).data)


class PlannerProjectVersionListCreateView(APIView):
    """List all project versions or create a new saved snapshot."""

    permission_classes = [permissions.IsAuthenticated]

    def _get_project(self, request, project_slug):
        """Fetch one owned project together with its current version."""

        return get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug, owner=request.user)

    def get(self, request, project_slug):
        """Return the full saved-version history for the project."""

        project = self._get_project(request, project_slug)
        versions = project.versions.select_related('created_by', 'source_version').order_by('-version_number', '-created_at')
        serializer = KitchenProjectVersionSerializer(versions, many=True)
        return Response(serializer.data)

    def post(self, request, project_slug):
        """Create the next numbered project version and make it current."""

        project = self._get_project(request, project_slug)
        next_version_number = (project.versions.aggregate(max_version=Max('version_number'))['max_version'] or 0) + 1

        scene_snapshot = request.data.get('scene_snapshot') or {}
        if not isinstance(scene_snapshot, dict):
            scene_snapshot = {}

        price_snapshot = request.data.get('price_snapshot', project.estimated_price)
        try:
            price_snapshot = float(price_snapshot)
        except (TypeError, ValueError):
            price_snapshot = project.estimated_price

        source_version = None
        source_version_id = request.data.get('source_version_id')
        if source_version_id:
            source_version = get_object_or_404(project.versions, pk=source_version_id)

        version = KitchenProjectVersion.objects.create(
            project=project,
            version_name=request.data.get('version_name') or f'Version {next_version_number}',
            created_by=request.user,
            version_number=next_version_number,
            scene_snapshot=scene_snapshot,
            price_snapshot=price_snapshot,
            validation_summary=request.data.get('validation_summary') or {},
            source_version=source_version,
            is_auto_snapshot=bool(request.data.get('is_auto_snapshot', False)),
        )
        project.current_version = version
        project.estimated_price = price_snapshot
        project.save(update_fields=['current_version', 'estimated_price', 'updated_at'])

        return Response(
            {
                'project': KitchenProjectSerializer(project).data,
                'version': KitchenProjectVersionSerializer(version).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PlannerProjectValidationView(APIView):
    """Run scene validation for the current version of a project."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_slug):
        """Validate the current version and return project plus validation payloads."""

        project = get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug, owner=request.user)
        if not project.current_version:
            return Response({'detail': 'Project has no saved version to validate yet.'}, status=status.HTTP_400_BAD_REQUEST)

        validation = validate_project_version(project.current_version)
        return Response(
            {
                'project': KitchenProjectSerializer(project).data,
                'current_version': KitchenProjectVersionSerializer(project.current_version).data,
                'validation': KitchenValidationRunSerializer(validation).data,
            }
        )


class PlannerProjectReviewView(APIView):
    """Return the project review payload used before add-to-bag or checkout."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_slug):
        """Combine project data, latest validation, and BOM summary in one response."""

        project = get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug, owner=request.user)
        if not project.current_version:
            return Response({'detail': 'Project has no saved version to review yet.'}, status=status.HTTP_400_BAD_REQUEST)

        latest_validation = project.current_version.validation_runs.order_by('-completed_at').first()
        bom_lines, bom_total = build_project_bom(project.current_version)

        return Response(
            {
                'project': KitchenProjectSerializer(project).data,
                'current_version': KitchenProjectVersionSerializer(project.current_version).data,
                'latest_validation': KitchenValidationRunSerializer(latest_validation).data if latest_validation else None,
                'summary': {
                    'item_count': sum(line['quantity'] for line in bom_lines),
                    'distinct_product_count': len(bom_lines),
                    'estimated_total': bom_total,
                    'can_proceed': bool(latest_validation and latest_validation.status == KitchenValidationRun.Status.PASSED),
                    'bom_lines': bom_lines,
                },
            }
        )


class PlannerProjectAddToBagView(APIView):
    """Convert a validated planner project into locked cart items."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, project_slug):
        """Validate the project, replace older bundles, and add a fresh bundle to cart."""

        if not request.user.is_authenticated:
            return Response(
                {
                    'detail': 'Sign in before adding a kitchen design to the cart.',
                    'code': 'LOGIN_REQUIRED',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        project = get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug, owner=request.user)
        if not project.current_version:
            return Response({'detail': 'Project has no saved version to add to the cart yet.'}, status=status.HTTP_400_BAD_REQUEST)

        latest_validation = project.current_version.validation_runs.order_by('-completed_at').first()
        if not latest_validation or latest_validation.status != KitchenValidationRun.Status.PASSED:
            latest_validation = validate_project_version(project.current_version)

        if latest_validation.status != KitchenValidationRun.Status.PASSED:
            return Response(
                {
                    'detail': 'Resolve validation issues before adding this kitchen design to the cart.',
                    'validation': KitchenValidationRunSerializer(latest_validation).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        bom_lines, bom_total = build_project_bom(project.current_version)
        if not bom_lines:
            return Response({'detail': 'This project does not contain any products yet.'}, status=status.HTTP_400_BAD_REQUEST)

        from commerce.models import Cart, CartItem
        from commerce.serializers import CartSerializer

        cart, _ = Cart.objects.get_or_create(user=request.user, defaults={'status': Cart.Status.ACTIVE})
        if cart.status != Cart.Status.ACTIVE:
            cart.status = Cart.Status.ACTIVE
            cart.save(update_fields=['status', 'updated_at'])

        existing_bundle_ids = list(
            CartItem.objects.filter(cart=cart, kitchen_bundle__project=project).values_list('kitchen_bundle_id', flat=True).distinct()
        )
        if existing_bundle_ids:
            CartItem.objects.filter(cart=cart, kitchen_bundle_id__in=existing_bundle_ids).delete()
            KitchenCartBundle.objects.filter(id__in=existing_bundle_ids).update(status=KitchenCartBundle.Status.SUPERSEDED)

        bundle = KitchenCartBundle.objects.create(
            project=project,
            project_version=project.current_version,
            bundle_total=bom_total,
        )

        created_item_ids = []
        for line in bom_lines:
            item = CartItem.objects.create(
                cart=cart,
                product_id=line['product']['id'],
                quantity=line['quantity'],
                unit_price=line['unit_price'],
                source_type=CartItem.SourceType.KITCHEN_BUNDLE,
                kitchen_bundle=bundle,
                is_quantity_locked=True,
                is_removal_locked=True,
                metadata={
                    'source_project_slug': project.slug,
                    'source_project_version': project.current_version.version_number,
                    'source_node_ids': line['source_node_ids'],
                },
            )
            created_item_ids.append(item.id)

        bundle_data = KitchenCartBundleSerializer(bundle).data
        cart_data = CartSerializer(cart, context={'request': request}).data

        return Response(
            {
                'bundle': bundle_data,
                'cart': cart_data,
                'locked_item_ids': created_item_ids,
            },
            status=status.HTTP_201_CREATED,
        )


class PlannerProjectShareLinkView(APIView):
    """Enable link sharing for a project and return the share token."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_slug):
        """Switch the project to share-link mode and expose the public path."""

        project = get_object_or_404(KitchenProject, slug=project_slug, owner=request.user)
        project.share_mode = KitchenProject.ShareMode.VIEW_LINK
        project.ensure_share_token()
        project.save(update_fields=['share_mode', 'share_token', 'updated_at'])
        return Response(
            {
                'project': KitchenProjectSerializer(project).data,
                'share_token': project.share_token,
                'share_path': f'/kitchen-designer/share/{project.share_token}',
            }
        )


class PlannerSharedProjectView(APIView):
    """Public read-only endpoint for a project shared by token."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, share_token):
        """Return the shared project, its current version, and latest validation."""

        project = get_object_or_404(
            KitchenProject.objects.select_related('current_version', 'owner'),
            share_token=share_token,
            share_mode=KitchenProject.ShareMode.VIEW_LINK,
        )
        latest_validation = project.current_version.validation_runs.order_by('-completed_at').first() if project.current_version else None
        return Response(
            {
                'project': KitchenProjectSerializer(project).data,
                'current_version': KitchenProjectVersionSerializer(project.current_version).data if project.current_version else None,
                'latest_validation': KitchenValidationRunSerializer(latest_validation).data if latest_validation else None,
            }
        )


class PlannerProjectDuplicateView(APIView):
    """Copy an existing project into a new project owned by the requester."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_slug):
        """Duplicate the source project snapshot and record an audit trail."""

        source_project = get_object_or_404(KitchenProject.objects.select_related('current_version'), slug=project_slug)

        if source_project.owner != request.user and source_project.share_mode != KitchenProject.ShareMode.VIEW_LINK:
            return Response({'detail': 'This project is not available for duplication.'}, status=status.HTTP_403_FORBIDDEN)

        source_version = source_project.current_version
        if not source_version:
            return Response({'detail': 'The source project has no saved version to duplicate.'}, status=status.HTTP_400_BAD_REQUEST)

        duplicate_project = KitchenProject.objects.create(
            owner=request.user,
            title=request.data.get('title') or f'{source_project.title} copy',
            status=KitchenProject.Status.DRAFT,
            estimated_price=source_project.estimated_price,
        )
        duplicate_version = KitchenProjectVersion.objects.create(
            project=duplicate_project,
            version_name=request.data.get('version_name') or 'Duplicated version',
            created_by=request.user,
            version_number=1,
            scene_snapshot=deepcopy(source_version.scene_snapshot),
            price_snapshot=source_version.price_snapshot,
            validation_summary=deepcopy(source_version.validation_summary),
            source_version=source_version,
        )
        duplicate_project.current_version = duplicate_version
        duplicate_project.save(update_fields=['current_version', 'updated_at'])

        duplication = KitchenProjectDuplication.objects.create(
            source_project=source_project,
            source_version=source_version,
            duplicated_project=duplicate_project,
            duplicated_by=request.user,
            reason=request.data.get('reason') or KitchenProjectDuplication.Reason.CUSTOMER_COPY,
        )

        return Response(
            {
                'project': KitchenProjectSerializer(duplicate_project).data,
                'version': KitchenProjectVersionSerializer(duplicate_version).data,
                'duplication': KitchenProjectDuplicationSerializer(duplication).data,
            },
            status=status.HTTP_201_CREATED,
        )
