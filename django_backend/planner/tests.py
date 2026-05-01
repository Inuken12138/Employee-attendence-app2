"""Planner backend tests covering ERP setup and customer project flows.

The test cases in this file double as onboarding examples: they show how a
catalog product becomes planner-ready, how projects are versioned and validated,
and how a valid design turns into locked cart rows.
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from commerce.models import CartItem
from core.models import Category, Product, User
from planner.models import KitchenDesignerProductProfile, KitchenProject, KitchenProjectDuplication, KitchenValidationRun


class PlannerProductProfileTests(APITestCase):
    """Cover ERP-side planner profile editing and publication rules."""

    def setUp(self):
        """Create one catalog product that can be converted into a planner product."""

        self.category = Category.objects.create(name='Kitchen', slug='kitchen')
        self.product = Product.objects.create(
            product_id='KIT-001',
            name='Base Cabinet 600',
            price=199.0,
            category=self.category,
        )

    def test_profile_endpoint_creates_default_profile(self):
        """Reading the profile endpoint should lazily create a blank planner profile."""

        response = self.client.get(f'/api/planner/erp/products/{self.product.id}/profile/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['product'], self.product.id)
        self.assertFalse(response.data['is_enabled'])
        self.assertEqual(KitchenDesignerProductProfile.objects.count(), 1)

    def test_profile_patch_updates_metadata(self):
        """Profile updates should persist planner metadata fields from ERP."""

        response = self.client.patch(
            f'/api/planner/erp/products/{self.product.id}/profile/',
            {
                'is_enabled': True,
                'planner_role': 'base',
                'planner_root_category': 'cabinets',
                'planner_group_category': 'base_cabinets',
                'planner_leaf_category': 'with_door',
                'width_mm': 600,
                'depth_mm': 580,
                'height_mm': 720,
                'allow_vertical_movement': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_enabled'])
        self.assertEqual(response.data['planner_role'], 'base')
        self.assertEqual(response.data['planner_leaf_category'], 'with_door')
        self.assertEqual(response.data['width_mm'], 600)
        self.assertTrue(response.data['allow_vertical_movement'])

    def test_profile_patch_accepts_assembly_composite_schema(self):
        """Assembly-style composite schemas should be accepted when structurally valid."""

        response = self.client.patch(
            f'/api/planner/erp/products/{self.product.id}/profile/',
            {
                'planner_role': 'base',
                'planner_root_category': 'cabinets',
                'planner_group_category': 'base_cabinets',
                'planner_leaf_category': 'with_door',
                'interaction_schema': {
                    'node_kind': 'assembly',
                    'animations': [
                        {
                            'part_key': 'door_left',
                            'trigger': 'open',
                            'type': 'hinge_y',
                        }
                    ],
                },
                'constraint_schema': {
                    'slots': [
                        {
                            'slot_key': 'frame',
                            'label': 'Frame',
                            'required': True,
                            'cardinality': 'single',
                        },
                        {
                            'slot_key': 'countertop',
                            'label': 'Countertop',
                            'required': True,
                            'cardinality': 'single',
                        },
                    ],
                },
                'compatibility_schema': {
                    'default_children': [
                        {'slot_key': 'frame', 'product_code': 'FRAME-600'},
                        {'slot_key': 'countertop', 'product_code': 'COUNTERTOP-600'},
                    ],
                    'replacement_groups': [
                        {'slot_key': 'countertop', 'allowed_product_codes': ['COUNTERTOP-600', 'COUNTERTOP-RED-600']},
                    ],
                    'cutout_rules': [],
                },
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['composite_schema']['node_kind'], 'assembly')
        self.assertEqual(len(response.data['composite_schema']['slots']), 2)

    def test_profile_patch_rejects_invalid_assembly_slot_schema(self):
        """Broken composite slot definitions should be rejected with serializer errors."""

        response = self.client.patch(
            f'/api/planner/erp/products/{self.product.id}/profile/',
            {
                'planner_role': 'base',
                'planner_root_category': 'cabinets',
                'planner_group_category': 'base_cabinets',
                'planner_leaf_category': 'with_door',
                'interaction_schema': {'node_kind': 'assembly'},
                'constraint_schema': {
                    'slots': [
                        {
                            'label': 'Countertop',
                        },
                    ],
                },
                'compatibility_schema': {},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('constraint_schema', response.data)

    def test_asset_validation_fails_without_glb(self):
        """Validation should fail when no GLB file has been uploaded yet."""

        response = self.client.post(f'/api/planner/erp/products/{self.product.id}/asset-validate/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'failed')
        self.assertTrue(response.data['errors'])

    def test_asset_validation_uses_glb_native_dimensions(self):
        """A valid GLB upload should allow the asset validation to pass."""

        profile = KitchenDesignerProductProfile.objects.create(
            product=self.product,
            is_enabled=True,
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
        )
        profile.glb_file.save(
            'base-cabinet.glb',
            SimpleUploadedFile('base-cabinet.glb', b'glb-data', content_type='model/gltf-binary'),
            save=True,
        )

        response = self.client.post(f'/api/planner/erp/products/{self.product.id}/asset-validate/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'passed')
        self.assertFalse(any('width, depth, and height' in warning.lower() for warning in response.data['warnings']))

    def test_stage_and_publish_after_successful_validation(self):
        """Products should stage and publish only after passing validation."""

        profile = KitchenDesignerProductProfile.objects.create(
            product=self.product,
            is_enabled=True,
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=580,
            height_mm=720,
        )
        profile.glb_file.save(
            'base-cabinet.glb',
            SimpleUploadedFile('base-cabinet.glb', b'glb-data', content_type='model/gltf-binary'),
            save=True,
        )

        validation_response = self.client.post(f'/api/planner/erp/products/{self.product.id}/asset-validate/')
        self.assertEqual(validation_response.status_code, 200)
        self.assertEqual(validation_response.data['status'], 'passed')

        stage_response = self.client.post(f'/api/planner/erp/products/{self.product.id}/stage/')
        self.assertEqual(stage_response.status_code, 200)
        self.assertEqual(stage_response.data['catalog_state'], 'staging')

        publish_response = self.client.post(f'/api/planner/erp/products/{self.product.id}/publish/')
        self.assertEqual(publish_response.status_code, 200)
        self.assertEqual(publish_response.data['catalog_state'], 'published')

    def test_published_products_appear_in_catalog_endpoint(self):
        """Published planner products should be visible in the planner catalog API."""

        KitchenDesignerProductProfile.objects.create(
            product=self.product,
            is_enabled=True,
            catalog_state='published',
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=580,
            height_mm=720,
            allow_vertical_movement=False,
            interaction_schema={'node_kind': 'assembly'},
            constraint_schema={'slots': [{'slot_key': 'frame', 'label': 'Frame'}]},
            compatibility_schema={'default_children': [{'slot_key': 'frame', 'product_code': 'FRAME-600'}]},
        )

        response = self.client.get('/api/planner/catalog/products/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.product.id)
        self.assertEqual(response.data[0]['planner_role'], 'base')
        self.assertEqual(response.data[0]['planner_group_category'], 'base_cabinets')
        self.assertFalse(response.data[0]['allow_vertical_movement'])
        self.assertEqual(response.data[0]['composite_schema']['node_kind'], 'assembly')
        self.assertEqual(response.data[0]['composite_schema']['slots'][0]['slot_key'], 'frame')

    def test_catalog_endpoint_filters_by_planner_path(self):
        """Catalog filters should narrow results by the planner taxonomy path."""

        KitchenDesignerProductProfile.objects.create(
            product=self.product,
            is_enabled=True,
            catalog_state='published',
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=580,
            height_mm=720,
        )

        response = self.client.get('/api/planner/catalog/products/?root_category=cabinets&group_category=base_cabinets&leaf_category=with_door')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['product_id'], 'KIT-001')


class PlannerProjectPersistenceTests(APITestCase):
    """Cover project creation, versioning, validation, sharing, and duplication."""

    def setUp(self):
        """Create an authenticated planner user and a second user for ownership tests."""

        self.user = User.objects.create_user(username='planner-user', password='secret123', role='customer')
        self.other_user = User.objects.create_user(username='other-user', password='secret123', role='customer')
        self.client.force_authenticate(user=self.user)

    def test_create_project_creates_initial_version(self):
        """Creating a project should also create version 1 as the initial snapshot."""

        response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Showroom remodel',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [],
                },
                'estimated_price': 1250.0,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['title'], 'Showroom remodel')
        self.assertEqual(response.data['latest_version_number'], 1)
        self.assertEqual(response.data['current_version']['version_number'], 1)
        self.assertEqual(KitchenProject.objects.count(), 1)
        self.assertEqual(KitchenProject.objects.first().versions.count(), 1)

    def test_create_version_updates_current_project_version(self):
        """Creating a new version should promote it to the project's current version."""

        create_response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Kitchen update',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [],
                },
            },
            format='json',
        )
        project_slug = create_response.data['slug']

        version_response = self.client.post(
            f'/api/planner/projects/{project_slug}/versions/',
            {
                'version_name': 'Added tall cabinet',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [{'nodeId': 'KIT-001-1', 'label': 'Tall cabinet'}],
                },
                'price_snapshot': 2499.0,
            },
            format='json',
        )

        self.assertEqual(version_response.status_code, 201)
        self.assertEqual(version_response.data['version']['version_number'], 2)
        self.assertEqual(version_response.data['project']['current_version']['version_number'], 2)

        detail_response = self.client.get(f'/api/planner/projects/{project_slug}/')
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data['current_version']['version_name'], 'Added tall cabinet')
        self.assertEqual(len(detail_response.data['current_version']['scene_snapshot']['items']), 1)

    def test_project_list_only_returns_owner_projects(self):
        """The project list endpoint should be scoped to the authenticated owner."""

        own_project = KitchenProject.objects.create(owner=self.user, title='My kitchen')
        other_project = KitchenProject.objects.create(owner=self.other_user, title='Other kitchen')

        response = self.client.get('/api/planner/projects/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['slug'], own_project.slug)
        self.assertNotEqual(response.data[0]['slug'], other_project.slug)

    def test_validate_project_persists_validation_run(self):
        """Validating a project should store a validation run in the database."""

        category = Category.objects.create(name='Validation items', slug='validation-items')
        product = Product.objects.create(product_id='VAL-001', name='Validation Cabinet', price=299.0, category=category)
        KitchenDesignerProductProfile.objects.create(
            product=product,
            is_enabled=True,
            catalog_state='published',
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=580,
            height_mm=720,
        )

        create_response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Validation project',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [
                        {
                            'nodeId': 'VAL-001-1',
                            'productId': product.id,
                            'label': 'Validation Cabinet',
                            'plannerRole': 'base',
                            'widthMm': 600,
                            'depthMm': 580,
                            'heightMm': 720,
                            'position': {'x': 0, 'y': 360, 'z': -1410},
                            'rotationY': 0,
                            'price': 299,
                        }
                    ],
                },
                'estimated_price': 299,
            },
            format='json',
        )
        project_slug = create_response.data['slug']

        response = self.client.post(f'/api/planner/projects/{project_slug}/validate/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['validation']['status'], 'passed')
        self.assertEqual(KitchenValidationRun.objects.count(), 1)

    def test_validate_project_flags_wall_attachment_rule(self):
        """Wall-mounted products should fail validation when not attached to a wall."""

        category = Category.objects.create(name='Wall items', slug='wall-items')
        product = Product.objects.create(product_id='WALL-001', name='Wall Cabinet', price=180.0, category=category)
        KitchenDesignerProductProfile.objects.create(
            product=product,
            is_enabled=True,
            catalog_state='published',
            planner_role='wall',
            planner_root_category='cabinets',
            planner_group_category='wall_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=350,
            height_mm=720,
            requires_wall_attachment=True,
        )

        create_response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Wall rule project',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [
                        {
                            'nodeId': 'WALL-001-1',
                            'productId': product.id,
                            'label': 'Wall Cabinet',
                            'plannerRole': 'wall',
                            'widthMm': 600,
                            'depthMm': 350,
                            'heightMm': 720,
                            'position': {'x': 0, 'y': 1500, 'z': 0},
                            'rotationY': 0,
                            'price': 180,
                        }
                    ],
                },
            },
            format='json',
        )
        project_slug = create_response.data['slug']

        response = self.client.post(f'/api/planner/projects/{project_slug}/validate/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['validation']['status'], 'failed')
        codes = [issue['code'] for issue in response.data['validation']['issues']]
        self.assertIn('WALL_ATTACHMENT_REQUIRED', codes)

    def test_add_to_bag_creates_locked_cart_items(self):
        """Add-to-bag should create locked cart items backed by a planner bundle."""

        category = Category.objects.create(name='Planner items', slug='planner-items')
        product = Product.objects.create(product_id='KIT-BAG', name='Bag Cabinet', price=150.0, category=category)
        KitchenDesignerProductProfile.objects.create(
            product=product,
            is_enabled=True,
            catalog_state='published',
            planner_role='base',
            planner_root_category='cabinets',
            planner_group_category='base_cabinets',
            planner_leaf_category='with_door',
            width_mm=600,
            depth_mm=580,
            height_mm=720,
        )

        create_response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Bag project',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [
                        {
                            'nodeId': 'KIT-BAG-1',
                            'productId': product.id,
                            'label': 'Bag Cabinet',
                            'plannerRole': 'base',
                            'widthMm': 600,
                            'depthMm': 580,
                            'heightMm': 720,
                            'position': {'x': 0, 'y': 360, 'z': 0},
                            'rotationY': 0,
                            'price': 150,
                        },
                        {
                            'nodeId': 'KIT-BAG-2',
                            'productId': product.id,
                            'label': 'Bag Cabinet',
                            'plannerRole': 'base',
                            'widthMm': 600,
                            'depthMm': 580,
                            'heightMm': 720,
                            'position': {'x': 650, 'y': 360, 'z': 0},
                            'rotationY': 0,
                            'price': 150,
                        },
                    ],
                },
                'estimated_price': 300,
            },
            format='json',
        )
        project_slug = create_response.data['slug']

        response = self.client.post(f'/api/planner/projects/{project_slug}/add-to-bag/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['cart']['total_quantity'], 2)
        self.assertEqual(len(response.data['cart']['items']), 1)
        item = CartItem.objects.get(pk=response.data['locked_item_ids'][0])
        self.assertTrue(item.is_quantity_locked)
        self.assertTrue(item.is_removal_locked)

    def test_share_link_and_duplicate_flow(self):
        """A shared project should be publicly readable and duplicable by the owner."""

        create_response = self.client.post(
            '/api/planner/projects/',
            {
                'title': 'Shared project',
                'scene_snapshot': {
                    'schemaVersion': 1,
                    'room': {'widthMm': 4200, 'depthMm': 3400, 'heightMm': 2400},
                    'items': [],
                },
            },
            format='json',
        )
        project_slug = create_response.data['slug']

        share_response = self.client.post(f'/api/planner/projects/{project_slug}/share-links/')
        self.assertEqual(share_response.status_code, 200)
        share_token = share_response.data['share_token']
        self.assertTrue(share_token)

        public_response = self.client.get(f'/api/planner/share/{share_token}/')
        self.assertEqual(public_response.status_code, 200)
        self.assertEqual(public_response.data['project']['slug'], project_slug)

        duplicate_response = self.client.post(f'/api/planner/projects/{project_slug}/duplicate/', {'title': 'Copied project'}, format='json')
        self.assertEqual(duplicate_response.status_code, 201)
        self.assertEqual(duplicate_response.data['project']['title'], 'Copied project')
        self.assertEqual(duplicate_response.data['version']['version_number'], 1)
        self.assertEqual(KitchenProjectDuplication.objects.count(), 1)
