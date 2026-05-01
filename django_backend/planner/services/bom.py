"""Bill-of-material generation for a saved planner project version.

The planner stores scene items as JSON snapshots. This helper converts that raw
item list into aggregated purchase lines that can be reviewed and later copied
into the commerce cart.
"""

from core.models import Product


def build_project_bom(project_version):
    """Aggregate placed planner items into cart-friendly BOM lines and a total."""

    snapshot = project_version.scene_snapshot or {}
    items = snapshot.get('items') or []
    product_ids = [item.get('productId') for item in items if item.get('productId')]
    products = {
        product.id: product
        for product in Product.objects.filter(id__in=product_ids).only('id', 'product_id', 'name', 'price', 'slug')
    }

    aggregated = {}
    for item in items:
        product_id = item.get('productId')
        if not product_id or product_id not in products:
            continue

        product = products[product_id]
        if product_id not in aggregated:
            aggregated[product_id] = {
                'product': {
                    'id': product.id,
                    'product_id': product.product_id,
                    'name': product.name,
                    'slug': product.slug,
                },
                'quantity': 0,
                'unit_price': float(product.price),
                'line_total': 0,
                'source_node_ids': [],
            }

        aggregated[product_id]['quantity'] += 1
        aggregated[product_id]['line_total'] = round(aggregated[product_id]['quantity'] * aggregated[product_id]['unit_price'], 2)
        if item.get('nodeId'):
            aggregated[product_id]['source_node_ids'].append(item['nodeId'])

    bom_lines = list(aggregated.values())
    bom_total = round(sum(line['line_total'] for line in bom_lines), 2)
    return bom_lines, bom_total
