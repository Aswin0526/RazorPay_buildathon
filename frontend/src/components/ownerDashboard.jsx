import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const ownerDashboard = ({ Data }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/owners/dashboard/overview`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              shop_id: Data?.shop_id || Data?.id,
            }),
          }
        );

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Failed to load dashboard');
        }

        setDashboard(result.data);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError(err.message || 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (Data) fetchOverview();
  }, [Data]);

  const renderStars = (rating = 0) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={`full-${i}`} className="fa-solid fa-star" style={{ color: '#FFC107' }} />);
    }
    if (hasHalfStar) {
      stars.push(<i key="half" className="fa-solid fa-star-half-stroke" style={{ color: '#FFC107' }} />);
    }
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="fa-regular fa-star" style={{ color: '#FFC107' }} />);
    }

    return <div style={{ display: 'flex', gap: '2px' }}>{stars}</div>;
  };

  const kpis = useMemo(() => {
    if (!dashboard) return [];

    return [
      { label: 'Revenue', value: `₹${Number(dashboard.kpis?.totalRevenue || 0).toLocaleString()}` },
      { label: 'Orders', value: Number(dashboard.kpis?.totalOrders || 0).toLocaleString() },
      { label: 'Avg. Rating', value: Number(dashboard.kpis?.avgRating || 0).toFixed(1) },
      { label: 'Views', value: Number(dashboard.kpis?.totalViews || 0).toLocaleString() },
      { label: 'Wishlist', value: Number(dashboard.kpis?.wishlistCount || 0).toLocaleString() },
      { label: 'Conversations', value: Number(dashboard.kpis?.totalConversations || 0).toLocaleString() },
    ];
  }, [dashboard]);

  const shopChartData = useMemo(() => {
    if (!dashboard?.graphData?.length) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: dashboard.graphData.map((shop) => shop.shop_name),
      datasets: [
        {
          label: 'Shop Views',
          data: dashboard.graphData.map((shop) => shop.total_hits),
          backgroundColor: ['#667eea', '#764ba2', '#f39c12', '#2ecc71', '#e74c3c'],
          borderRadius: 8,
        },
      ],
    };
  }, [dashboard]);

  const wishlistChartData = useMemo(() => {
    if (!dashboard?.wishListCount?.length) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: dashboard.wishListCount.map((item) => item.product_name),
      datasets: [
        {
          label: 'Wishlist Count',
          data: dashboard.wishListCount.map((item) => item.wishlist_count),
          backgroundColor: ['#16a085', '#27ae60', '#3498db', '#9b59b6', '#e67e22'],
          borderRadius: 8,
        },
      ],
    };
  }, [dashboard]);

  const ratingChartData = useMemo(() => {
    if (!dashboard?.feedbacks?.length) {
      return { labels: ['5', '4', '3', '2', '1'], datasets: [{ data: [0, 0, 0, 0, 0] }] };
    }

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    dashboard.feedbacks.forEach((item) => {
      const value = Math.max(1, Math.min(5, Math.round(Number(item.ratings || 0))));
      counts[value] += 1;
    });

    return {
      labels: ['5★', '4★', '3★', '2★', '1★'],
      datasets: [
        {
          data: [counts[5], counts[4], counts[3], counts[2], counts[1]],
          backgroundColor: ['#22c55e', '#84cc16', '#facc15', '#f59e0b', '#ef4444'],
        },
      ],
    };
  }, [dashboard]);

  const conversationChartData = useMemo(() => {
    if (!dashboard?.conversationSummary) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: ['Completed', 'Abandoned', 'Escalated'],
      datasets: [
        {
          data: [
            Number(dashboard.conversationSummary.completed || 0),
            Number(dashboard.conversationSummary.abandoned || 0),
            Number(dashboard.conversationSummary.escalated || 0),
          ],
          backgroundColor: ['#22c55e', '#f97316', '#ef4444'],
        },
      ],
    };
  }, [dashboard]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading owner dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="error-container">
        <p>No dashboard data found.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', color: '#1f2937' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {kpis.map((item) => (
          <div
            key={item.label}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              padding: '18px 20px',
              boxShadow: '0 8px 20px rgba(15,23,42,0.05)',
            }}
          >
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{item.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '14px', fontSize: '18px' }}>Most Viewed Shops</h3>
          {dashboard.graphData?.length ? (
            <div style={{ height: '260px' }}>
              <Bar
                data={shopChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                }}
              />
            </div>
          ) : (
            <p>No shop view data available</p>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '14px', fontSize: '18px' }}>Most Wishlisted Products</h3>
          {dashboard.wishListCount?.length ? (
            <div style={{ height: '260px' }}>
              <Bar
                data={wishlistChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                }}
              />
            </div>
          ) : (
            <p>No wishlist data available</p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '14px', fontSize: '18px' }}>Ratings Distribution</h3>
          <div style={{ height: '220px' }}>
            <Doughnut
              data={ratingChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
              }}
            />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '14px', fontSize: '18px' }}>Conversation Outcome</h3>
          <div style={{ height: '220px' }}>
            <Doughnut
              data={conversationChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
              }}
            />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '14px', fontSize: '18px' }}>Conversation Stats</h3>
          <div style={{ display: 'grid', gap: '12px', fontSize: '14px' }}>
            <div><strong>Avg Duration:</strong> {Number(dashboard.conversationSummary?.avgDurationMinutes || 0).toFixed(1)} min</div>
            <div><strong>Avg Turns:</strong> {Number(dashboard.conversationSummary?.avgTurns || 0).toFixed(1)}</div>
            <div><strong>Completed:</strong> {dashboard.conversationSummary?.completed || 0}</div>
            <div><strong>Abandoned:</strong> {dashboard.conversationSummary?.abandoned || 0}</div>
            <div><strong>Escalated:</strong> {dashboard.conversationSummary?.escalated || 0}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Recent Feedback</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {dashboard.feedbacks?.length ? (
              dashboard.feedbacks.map((item, idx) => (
                <div key={`${item.created_at}-${idx}`} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{new Date(item.created_at).toLocaleDateString()}</span>
                    {renderStars(Number(item.ratings || 0))}
                  </div>
                  <div style={{ color: '#374151', lineHeight: 1.5 }}>{item.feedback || 'No comment provided'}</div>
                </div>
              ))
            ) : (
              <p>No feedback available.</p>
            )}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Most Wanted Products</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {dashboard.mostWantedProducts?.length ? (
              dashboard.mostWantedProducts.map((product) => (
                <div key={product.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', overflow: 'hidden', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {product.pic ? <img src={product.pic} alt={product.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>📦</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{product.product_name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{product.description || 'No description'}</div>
                  </div>
                  <div style={{ background: '#eef2ff', color: '#4338ca', borderRadius: '999px', padding: '6px 10px', fontWeight: 700, fontSize: '12px' }}>
                    {product.total_votes || 0}
                  </div>
                </div>
              ))
            ) : (
              <p>No most wanted products available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ownerDashboard;
