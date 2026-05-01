/**
 * Renders the storefront landing page.
 *
 * This is the public entry point for the shopping experience. It introduces the
 * brand, highlights a few primary navigation paths, and mounts the category
 * slider so shoppers can immediately start browsing.
 */
import Link from 'next/link';
import CategorySlider from './components/CategorySlider';

/** Shows the home-page hero content and the category discovery section. */
export default function HomePage() {
  return (
    <>
      <div className="hero">
        <div>
          <div className="kicker">Songfei Store</div>
          <h1 className="hero-title">Welcome to Songfei Store</h1>
          <p className="hero-copy">
            Discover quality products for your home and business. Browse our curated selection and find exactly what you need.
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" href="/cat/products-products">Browse All Products</Link>
            <Link className="btn btn-outline" href="/products">Search Products</Link>
            <Link className="btn btn-outline" href="/kitchen-designer">Open Kitchen Designer</Link>
          </div>
        </div>
        <div className="card card-glass">
          <div className="pill">Featured</div>
          <h2 className="section-title" style={{ marginTop: '1rem' }}>New Arrivals</h2>
          <div className="grid-2" style={{ marginTop: '1.6rem' }}>
            <div className="stat">
              <span className="stat-value">New</span>
              <span className="stat-label">Products</span>
            </div>
            <div className="stat">
              <span className="stat-value">Best</span>
              <span className="stat-label">Sellers</span>
            </div>
          </div>
          <div className="divider" />
          <p className="muted">
            Explore our hand-picked essentials. The ERP experience remains available at /erp for internal operations, and the new planner prototype now lives at /kitchen-designer.
          </p>
        </div>
      </div>
      <CategorySlider />
    </>
  );
}