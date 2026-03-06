import Link from 'next/link';

import DesignerShell from '@/features/kitchen-designer/editor/DesignerShell';

export default async function KitchenDesignerProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div className="pill">Project workspace</div>
          <h1 className="section-title" style={{ marginTop: '0.9rem' }}>Kitchen project {projectId}</h1>
          <p className="muted" style={{ marginTop: '0.4rem' }}>
            Prototype editor shell backed by published planner catalog products.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link className="btn btn-outline" href="/kitchen-designer">
            Back to landing
          </Link>
          <Link className="btn btn-outline" href="/erp/products">
            ERP catalog
          </Link>
        </div>
      </div>

      <DesignerShell projectId={projectId} />
    </div>
  );
}
