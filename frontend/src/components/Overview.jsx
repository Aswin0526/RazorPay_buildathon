import React, { useState, useEffect } from 'react';
import '../styles/Overview.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Overview = (data) => {
    console.log("Data",data.Data)
    const [shopData, setShopData] = useState(data.Data);
    const [loading, setLoading] = useState(true);
    const [feedbacks, setFeedbacks] = useState([]);
    const [avgRating, setAvgRating] = useState(0);
    const [conversionRate, setConversionRate] = useState(0);
    const [conversionMeta, setConversionMeta] = useState({ online_orders: 0, offline_orders: 0, paid_online_orders: 0 });
    const [graphData, setGraphData] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedShop, setSelectedShop] = useState(null);
    const [wishListCount, setWishListCount] = useState(null);
    const [mostWantedProducts, setMostWantedProducts] = useState([]);
    
    // Conversation Analyses state
    const [conversations, setConversations] = useState([]);
    const [convLoading, setConvLoading] = useState(false);
    const [convPagination, setConvPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [convFilters, setConvFilters] = useState({ search: '', outcome: '' });
    const [showConvDrawer, setShowConvDrawer] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState(null);

    const renderStars = (rating) => {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        const stars = [];

        // Full stars
        for (let i = 0; i < fullStars; i++) {
            stars.push(<i key={`full-${i}`} className="fa-solid fa-star" style={{ color: '#FFC107' }}></i>);
        }

        // Half star
        if (hasHalfStar) {
            stars.push(<i key="half" className="fa-solid fa-star-half-stroke" style={{ color: '#FFC107' }}></i>);
        }

        // Empty stars
        for (let i = 0; i < emptyStars; i++) {
            stars.push(<i key={`empty-${i}`} className="fa-regular fa-star" style={{ color: '#FFC107' }}></i>);
        }

        return <div style={{ display: 'flex', gap: '2px' }}>{stars}</div>;
    };

    useEffect(() => {
        if (shopData) {
            setLoading(false);   
        }
    }, []);

    useEffect(() => {
    if (!shopData) return;
    console.log("fetching avg ratings");
    const shopId = shopData.shop_id || shopData.id;
    if (!shopId) return;

    const fetchAvgRating = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getAvgRatings`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        shop_id: shopId,
                    }),
                }
            );

            const data = await response.json();
            console.log("Avg api response",data)
            console.log(data.data)
            if (data.success && data.data !== null) {
                setAvgRating(parseFloat(data.data) || 0);
                console.log("avg ratings",avgRating)
            }
        } catch (error) {
            console.error("Error fetching average rating:", error);
        }
    };

    fetchAvgRating();
    }, [shopData]);

    useEffect(() => {
        if (!shopData) return;

        const shopId = shopData.shop_id || shopData.id;
        if (!shopId) return;

        const fetchConversionRate = async () => {
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(
                    `${import.meta.env.VITE_BACKEND_URL}/api/owners/online-order-conversion-rate`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ shop_id: shopId }),
                    }
                );

                const data = await response.json();
                if (data.success && data.data) {
                    setConversionRate(Number(data.data.conversion_rate || 0));
                    setConversionMeta({
                        online_orders: Number(data.data.online_orders || 0),
                        offline_orders: Number(data.data.offline_orders || 0),
                        paid_online_orders: Number(data.data.paid_online_orders || 0),
                    });
                }
            } catch (error) {
                console.error('Error fetching conversion rate:', error);
            }
        };

        fetchConversionRate();
    }, [shopData]);

    useEffect(() => {
        if (!shopData) return;

        const shopId = shopData.shop_id || shopData.id;
        console.log("Using shopId:", shopId);

        if (!shopId) {
            console.log("No shop ID found in shopData");
            return;
        }

        const fetchFeedbacks = async () => {
            try {
                console.log("Fetching feedbacks...")
                const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getfeedbacks`,
                {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            shop_id: shopId,
                        }),
                    }
                );

                const data = await response.json();
                console.log("Feedbacks API response:", data);
                if (data.success && data.data) {
                    setFeedbacks(data.data);
                }
            } catch (error) {
                console.error("Error fetching feedbacks:", error);
            }
        };

        fetchFeedbacks();
    }, [shopData]);

    useEffect(() => {
    const fetchShopHitCount = async () => {
        try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/shop-hit-count`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
            type: data.Data.type,
            city: data.Data.shop_city,
            state: data.Data.shop_state,
            country: data.Data.shop_country
            })
        });

const result = await response.json();
        console.log("Graph Data:", result);

        if (Array.isArray(result)) {
          setGraphData(result);
        } else if (result.data && Array.isArray(result.data)) {
          setGraphData(result.data);
        }

        } catch (err) {
        console.error(err);
        }
    };

    if (data?.Data) {
        fetchShopHitCount();
    }

}, [data]);


    useEffect(() => {
    const fetchWishListCount = async () => {
        try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/wishlist-hit-count`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
            type: data.Data.type,
            city: data.Data.shop_city,
            state: data.Data.shop_state,
            country: data.Data.shop_country
            })
        });

    const result = await response.json();
        console.log("Graph Data:", result);

        if (Array.isArray(result)) {
          setWishListCount(result);
        } else if (result.data && Array.isArray(result.data)) {
          setWishListCount(result.data);
        }
        } catch (err) {
        console.error(err);
        }
    };

    if (data?.Data) {
        fetchWishListCount();
    }

}, [data]);

// Fetch most wanted products based on shop type and location
useEffect(() => {
    const fetchMostWantedProducts = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/most-wanted-products`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: data.Data.type,
                    city: data.Data.shop_city,
                    state: data.Data.shop_state,
                    country: data.Data.shop_country
                })
            });

            const result = await response.json();
            console.log("Most Wanted Products:", result);

            if (result.success && Array.isArray(result.data)) {
                setMostWantedProducts(result.data);
            }
        } catch (err) {
            console.error("Error fetching most wanted products:", err);
        }
    };

    if (data?.Data) {
        fetchMostWantedProducts();
    }

}, [data]);

// Fetch conversation analyses
useEffect(() => {
    const fetchConversationAnalyses = async () => {
        if (!shopData) return;
        
        const shopId = shopData.shop_id || shopData.id;
        if (!shopId) return;

        setConvLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/conversation-analyses`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        shop_id: shopId,
                        search: convFilters.search,
                        outcome: convFilters.outcome,
                        page: convPagination.page,
                        limit: convPagination.limit
                    }),
                }
            );

            const result = await response.json();
            console.log("Conversation Analyses:", result);
            
            if (result.success && result.data) {
                setConversations(result.data.conversations || []);
                setConvPagination(prev => ({
                    ...prev,
                    total: result.data.pagination?.total || 0,
                    totalPages: result.data.pagination?.totalPages || 0
                }));
            }
        } catch (err) {
            console.error("Error fetching conversation analyses:", err);
        } finally {
            setConvLoading(false);
        }
    };

    fetchConversationAnalyses();
}, [shopData, convFilters, convPagination.page]);

// Handle filter changes
const handleConvFilterChange = (e) => {
    const { name, value } = e.target;
    setConvFilters(prev => ({ ...prev, [name]: value }));
    setConvPagination(prev => ({ ...prev, page: 1 }));
};

const handleConvFilterReset = () => {
    setConvFilters({ search: '', outcome: '' });
    setConvPagination(prev => ({ ...prev, page: 1 }));
};

const handleConvPageChange = (newPage) => {
    setConvPagination(prev => ({ ...prev, page: newPage }));
};

const handleConvCardClick = (conv) => {
    setSelectedConversation(conv);
    setShowConvDrawer(true);
};

const handleCloseConvDrawer = () => {
    setShowConvDrawer(false);
    setSelectedConversation(null);
};

// Prepare top 5 data for bar graph
    const topFiveShops = [...graphData]
      .sort((a, b) => parseInt(b.total_hits || 0) - parseInt(a.total_hits || 0))
      .slice(0, 5);

    // Prepare top 5 wishlist data for bar graph
    const topFiveWishlist = wishListCount 
      ? [...wishListCount]
          .sort((a, b) => parseInt(b.wishlist_count || 0) - parseInt(a.wishlist_count || 0))
          .slice(0, 5)
      : [];

    // Different colors for each bar
    const barColors = [
      'rgba(102, 126, 234, 0.85)',
      'rgba(118, 75, 162, 0.85)',
      'rgba(255, 99, 132, 0.85)',
      'rgba(75, 192, 192, 0.85)',
      'rgba(255, 159, 64, 0.85)',
    ];

    const barBorderColors = [
      'rgba(102, 126, 234, 1)',
      'rgba(118, 75, 162, 1)',
      'rgba(255, 99, 132, 1)',
      'rgba(75, 192, 192, 1)',
      'rgba(255, 159, 64, 1)',
    ];

    const chartData = {
      labels: topFiveShops.map(shop => shop.shop_name),
      datasets: [
        {
          label: 'Total Hits',
          data: topFiveShops.map(shop => parseInt(shop.total_hits || 0)),
          backgroundColor: barColors.slice(0, topFiveShops.length),
          borderColor: barBorderColors.slice(0, topFiveShops.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };

    // Wishlist chart data
    const wishlistChartData = {
      labels: topFiveWishlist.map(item => item.product_name),
      datasets: [
        {
          label: 'Wishlist Count',
          data: topFiveWishlist.map(item => parseInt(item.wishlist_count || 0)),
          backgroundColor: barColors.slice(0, topFiveWishlist.length),
          borderColor: barBorderColors.slice(0, topFiveWishlist.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: 'Most viewed shop',
          font: {
            size: 16,
            weight: 'bold',
          },
          color: '#333',
          padding: {
            bottom: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#666',
            font: {
              size: 12,
            },
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Views',
            color: '#666',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            color: '#666',
            font: {
              size: 12,
            },
            callback: function(value) {
              return Math.round(value);
            },
            stepSize: 1,
          },
        },
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const shop = topFiveShops[index];
          setSelectedShop(shop);
          setShowModal(true);
        }
      },
    };

    const wishlistChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: 'Most Wishlisted Products',
          font: {
            size: 16,
            weight: 'bold',
          },
          color: '#333',
          padding: {
            bottom: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#666',
            font: {
              size: 12,
            },
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Wishlist Count',
            color: '#666',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            color: '#666',
            font: {
              size: 12,
            },
            callback: function(value) {
              return Math.round(value);
            },
            stepSize: 1,
          },
        },
      },
    };

    const handleCloseModal = () => {
      setShowModal(false);
      setSelectedShop(null);
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading shop data...</p>
            </div>
        );
    }

    if (!shopData) {
        return (
            <div className="error-container">
                <p>No shop data found. Please login again.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Main Content */}
            <main className="main">
                <div className="content-grid">
                    {/* Left Column - Ratings & Feedback (40% width) */}
                    <div className="left-column">
                        {/* Ratings Section */}
                        <section className="section ratings-section">
                            <h2 className="section-title">Ratings & Reviews</h2>
                            <div className="ratings-container">
                                <div className="rating-overview">
                                    <div className="rating-big">{avgRating || 0}</div>
                                    <div className="rating-stars">{renderStars(avgRating || 0)}</div>
                                    <p className="rating-total">{feedbacks.length} reviews</p>
                                </div>
                                <div className="rating-breakdown">
                                    {[5, 4, 3, 2, 1].map((stars) => {
                                        const count = feedbacks.filter(f => Math.floor(f.ratings || 0) === stars).length;
                                        const percentage = feedbacks.length > 0 ? Math.round((count / feedbacks.length) * 100) : 0;
                                        return (
                                            <div key={stars} className="rating-row">
                                                <span className="rating-stars-text">{stars} ⭐</span>
                                                <div className="rating-bar">
                                                    <div
                                                        className="rating-fill"
                                                        style={{
                                                            width: `${percentage}%`,
                                                        }}
                                                    ></div>
                                                </div>
                                                <span className="rating-count">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* <div className="conversion-card" style={{
                                    marginTop: '18px',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #e8f5ff 0%, #eef2ff 100%)',
                                    border: '1px solid rgba(102, 126, 234, 0.18)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    flexWrap: 'wrap'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                                            Online conversion rate
                                        </div>
                                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#1f2937', marginTop: '4px' }}>
                                            {conversionRate.toFixed(2)}%
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', color: '#374151', fontSize: '13px' }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                            {conversionMeta.paid_online_orders} paid online
                                        </div>
                                        <div>
                                            {conversionMeta.online_orders} online • {conversionMeta.offline_orders} offline
                                        </div>
                                    </div>
                                </div> */}
                            </div>
                        </section>

                        {/* Feedback Section */}
                        <section className="section feedback-section">
                            <h2 className="section-title">Recent Feedback</h2>
                            <div className="feedback-container">
                                <div className="feedback-wrapper">
                                    {feedbacks.length === 0 ? (
                                        <p className="no-feedback">No feedbacks yet</p>
                                    ) : (
                                        <>
                                            {/* Duplicate feedbacks for seamless scrolling */}
                                            {[...feedbacks, ...feedbacks, ...feedbacks].map((feedback, index) => (
                                                <div key={index} className="feedback-card">
                                                    <div className="feedback-header">
                                                        <span className="feedback-date">
                                                            {feedback.created_at ? new Date(feedback.created_at).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="feedback-stars">
                                                        {'⭐'.repeat(parseInt(feedback.ratings) || 0)}
                                                    </div>
                                                    <p className="feedback-comment">{feedback.feedback || 'No comment'}</p>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

{/* Right Column - Analysis (60% width, full height) */}
                    <div className="right-column">
                        <section className="section analysis-section">
                            <h2 className="section-title">Analysis</h2>
                            
                            {/* Shop Views Chart */}
                            <div className="chart-container">
                                {graphData.length === 0 ? (
                                    <p className="no-data">No graph data available</p>
                                ) : (
                                    <Bar data={chartData} options={chartOptions} />
                                )}
                            </div>
                            <p className="chart-hint">Click on a bar to view all shop data</p>

                            {/* Wishlist Chart */}
                            <div className="chart-container" style={{ marginTop: '30px' }}>
                                {!wishListCount || wishListCount.length === 0 ? (
                                    <p className="no-data">No wishlist data available</p>
                                ) : (
                                    <Bar data={wishlistChartData} options={wishlistChartOptions} />
                                )}
                            </div>
                            <p className="chart-hint">Most wishlisted products</p>

                            {/* Most Wanted Products Section */}
                            <div className="most-wanted-section" style={{ marginTop: '30px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>
                                    🔥 Most Wanted Products (Last 1 Month)
                                </h3>
                                {mostWantedProducts.length === 0 ? (
                                    <p className="no-data">No products found</p>
                                ) : (
                                    <div className="most-wanted-list">
                                        {mostWantedProducts.map((product, index) => (
                                            <div key={product.id} className="most-wanted-item" style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px',
                                                background: '#f8f9fa',
                                                borderRadius: '8px',
                                                marginBottom: '10px',
                                                gap: '12px'
                                            }}>
                                                <div style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    flexShrink: 0,
                                                    background: '#e9ecef'
                                                }}>
                                                    {product.pic ? (
                                                        <img 
                                                            src={product.pic} 
                                                            alt={product.product_name}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <div style={{ 
                                                            width: '100%', 
                                                            height: '100%', 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center',
                                                            fontSize: '20px'
                                                        }}>📦</div>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ 
                                                        fontWeight: '600', 
                                                        color: '#333',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {product.product_name}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                                        {product.description || 'No description'}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '6px 12px',
                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                    borderRadius: '20px',
                                                    color: '#fff',
                                                    fontWeight: '600',
                                                    fontSize: '14px',
                                                    flexShrink: 0
                                                }}>
                                                    🔥 {product.total_votes || 0}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* AI Conversations Section */}
                            <div className="ov-conv-section" style={{ marginTop: '30px' }}>
                                    <div className="ov-conv-header">
                                        <h3 className="ov-conv-title">🤖 AI Conversations Analysis</h3>
                                        <span className="ov-conv-total">{convPagination.total} conversations</span>
                                    </div>

                                    {/* Filters */}
                                    <div className="ov-filters">
                                        <input
                                            type="text"
                                            name="search"
                                            placeholder="🔍 Search summaries..."
                                            className="ov-filter-input ov-filter-search"
                                            value={convFilters.search}
                                            onChange={handleConvFilterChange}
                                        />
                                        <select
                                            name="outcome"
                                            className="ov-filter-input"
                                            value={convFilters.outcome}
                                            onChange={handleConvFilterChange}
                                        >
                                            <option value="">🎯 All Outcomes</option>
                                            <option value="completed">✅ Completed</option>
                                            <option value="abandoned">❌ Abandoned</option>
                                            <option value="escalated">📞 Escalated</option>
                                        </select>
                                        <button className="ov-filter-reset" onClick={handleConvFilterReset}>
                                            ➜ Reset
                                        </button>
                                    </div>

                                    {/* KPI Cards */}
                                    <div className="ov-kpi-grid">
                                        <div className="ov-kpi-card total-convs">
                                            <span className="ov-kpi-icon">💬</span>
                                            <div>
                                                <div className="ov-kpi-value">{convPagination.total}</div>
                                                <div className="ov-kpi-label">Total Conversations</div>
                                            </div>
                                        </div>
                                        <div className="ov-kpi-card avg-duration">
                                            <span className="ov-kpi-icon">⏱️</span>
                                            <div>
                                                <div className="ov-kpi-value">
                                                    {conversations.length > 0 
                                                        ? Math.round(conversations.reduce((acc, c) => acc + (parseFloat(c.duration_minutes) || 0), 0) / conversations.length * 10) / 10
                                                        : 0}
                                                </div>
                                                <div className="ov-kpi-label">Avg Duration (min)</div>
                                            </div>
                                        </div>
                                        <div className="ov-kpi-card avg-turns">
                                            <span className="ov-kpi-icon">🔄</span>
                                            <div>
                                                <div className="ov-kpi-value">
                                                    {conversations.length > 0 
                                                        ? Math.round(conversations.reduce((acc, c) => acc + (parseInt(c.turn_count) || 0), 0) / conversations.length)
                                                        : 0}
                                                </div>
                                                <div className="ov-kpi-label">Avg Turns</div>
                                            </div>
                                        </div>
                                        <div className="ov-kpi-card completed">
                                            <span className="ov-kpi-icon">✅</span>
                                            <div>
                                                <div className="ov-kpi-value">
                                                    {conversations.filter(c => c.outcome === 'completed').length}
                                                </div>
                                                <div className="ov-kpi-label">Completed</div>
                                            </div>
                                        </div>
                                    </div>

                                {/* Conversation List */}
                                <div className="ov-conv-list">
                                    {convLoading ? (
                                        <div className="ov-conv-loading">
                                            <span className="loading-spinner" style={{ width: '20px', height: '20px' }}></span>
                                            Loading conversations...
                                        </div>
                                    ) : conversations.length === 0 ? (
                                        <p className="no-data">No conversation analyses found</p>
                                    ) : (
                                        conversations.map((conv) => (
                                            <div 
                                                key={conv.id} 
                                                className="ov-conv-card"
                                                onClick={() => handleConvCardClick(conv)}
                                            >
                                                <div className="ov-conv-card-top">
                                                    <span className={`ov-badge ov-outcome-${conv.outcome || 'unknown'}`}>
                                                        {conv.outcome || 'Unknown'}
                                                    </span>
                                                    <span className="ov-stage-pill">{conv.final_stage || 'N/A'}</span>
                                                    <span className="ov-sentiment-pill">
                                                        {conv.sentiment_arc || 'N/A'}
                                                    </span>
                                                    <span className="ov-conv-meta" style={{ marginLeft: 'auto' }}>
                                                        {conv.created_at ? new Date(conv.created_at).toLocaleDateString() : 'N/A'}
                                                    </span>
                                                </div>
                                                <p className="ov-conv-summary">{conv.summary || 'No summary available'}</p>
                                                <div className="ov-conv-meta" style={{ marginTop: '8px' }}>
                                                    <span>⏱️ {conv.duration_minutes || 0} min</span>
                                                    <span style={{ marginLeft: '12px' }}>🔄 {conv.turn_count || 0} turns</span>
                                                    {conv.products_discussed && conv.products_discussed.length > 0 && (
                                                        <span style={{ marginLeft: '12px' }}>📦 {conv.products_discussed.length} products</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Pagination */}
                                {convPagination.totalPages > 1 && (
                                    <div className="ov-pagination">
                                        <button 
                                            className="ov-page-btn"
                                            disabled={convPagination.page === 1}
                                            onClick={() => handleConvPageChange(convPagination.page - 1)}
                                        >
                                            Previous
                                        </button>
                                        <span className="ov-page-info">
                                            Page {convPagination.page} of {convPagination.totalPages}
                                        </span>
                                        <button 
                                            className="ov-page-btn"
                                            disabled={convPagination.page >= convPagination.totalPages}
                                            onClick={() => handleConvPageChange(convPagination.page + 1)}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Modal for full data view */}
                    {showModal && (
                        <div className="modal-overlay" onClick={handleCloseModal}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Shop Details - {selectedShop?.shop_name}</h3>
                                    <button className="modal-close" onClick={handleCloseModal}>
                                        <i className="fa-solid fa-times"></i>
                                    </button>
                                </div>
                                <div className="modal-body">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Shop Name</th>
                                                <th>Total Hits</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {graphData.map((shop, index) => (
                                                <tr key={index} className={shop.shop_name === selectedShop?.shop_name ? 'highlighted' : ''}>
                                                    <td>{shop.shop_name}</td>
                                                    <td>{shop.total_hits}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Conversation Analysis Detail Dialog ── */}
                    {showConvDrawer && selectedConversation && (
                        <div className="ca-overlay" onClick={handleCloseConvDrawer}>
                            <div className="ca-dialog" onClick={e => e.stopPropagation()}>
                                {/* Header */}
                                <div className="ca-dialog-header">
                                    <div className="ca-dialog-title-row">
                                        <span className={`ov-badge ov-outcome-${selectedConversation.outcome?.toLowerCase() || 'unknown'}`}>
                                            {selectedConversation.outcome || 'Unknown'}
                                        </span>
                                        <h3 className="ca-dialog-title">Conversation Analysis</h3>
                                        <span className="ca-dialog-date">
                                            {selectedConversation.created_at
                                                ? new Date(selectedConversation.created_at).toLocaleString()
                                                : 'N/A'}
                                        </span>
                                    </div>
                                    <button className="ca-dialog-close" onClick={handleCloseConvDrawer}>✕</button>
                                </div>

                                <div className="ca-dialog-body">
                                    {/* Metrics row */}
                                    <div className="ca-metrics-row">
                                        <div className="ca-metric-chip">⏱️ {selectedConversation.duration_minutes || 0} min</div>
                                        <div className="ca-metric-chip">🔄 {selectedConversation.turn_count || 0} turns</div>
                                        <div className="ca-metric-chip">📌 {selectedConversation.final_stage || 'N/A'}</div>
                                        <div className="ca-metric-chip">😊 {selectedConversation.sentiment_arc || 'N/A'}</div>
                                        {selectedConversation.images_shared > 0 && (
                                            <div className="ca-metric-chip">🖼️ {selectedConversation.images_shared} images</div>
                                        )}
                                    </div>

                                    {/* Payment status */}
                                    {(() => {
                                        const ps = selectedConversation.payment_status || {};
                                        if (ps.initiated || ps.completed) return (
                                            <div className={`ca-payment-banner ${ps.completed ? 'paid' : 'pending'}`}>
                                                {ps.completed
                                                    ? `✅ Payment completed — ₹${Number(ps.amount || 0).toLocaleString()}`
                                                    : `⏳ Payment initiated — ₹${Number(ps.amount || 0).toLocaleString()} (not completed)`
                                                }
                                            </div>
                                        );
                                        return null;
                                    })()}

                                    {/* Summary */}
                                    <div className="ca-section">
                                        <h4 className="ca-section-title">📝 Summary</h4>
                                        <p className="ca-section-text">{selectedConversation.summary || 'No summary available.'}</p>
                                    </div>

                                    {/* Customer intent */}
                                    <div className="ca-section">
                                        <h4 className="ca-section-title">🎯 Customer Intent</h4>
                                        <p className="ca-section-text">{selectedConversation.customer_intent || '—'}</p>
                                    </div>

                                    {/* Products discussed */}
                                    {(() => {
                                        const prods = Array.isArray(selectedConversation.products_discussed)
                                            ? selectedConversation.products_discussed
                                            : [];
                                        if (!prods.length) return null;
                                        return (
                                            <div className="ca-section">
                                                <h4 className="ca-section-title">📦 Products Discussed</h4>
                                                <div className="ca-tag-list">
                                                    {prods.map((p, i) => <span key={i} className="ca-tag">{p}</span>)}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Key insights */}
                                    {(() => {
                                        const insights = Array.isArray(selectedConversation.key_insights)
                                            ? selectedConversation.key_insights
                                            : [];
                                        if (!insights.length) return null;
                                        return (
                                            <div className="ca-section">
                                                <h4 className="ca-section-title">💡 Key Insights</h4>
                                                <ul className="ca-list">
                                                    {insights.map((ins, i) => <li key={i}>{ins}</li>)}
                                                </ul>
                                            </div>
                                        );
                                    })()}

                                    {/* Missed opportunities */}
                                    {(() => {
                                        const missed = Array.isArray(selectedConversation.missed_opportunities)
                                            ? selectedConversation.missed_opportunities
                                            : [];
                                        if (!missed.length) return null;
                                        return (
                                            <div className="ca-section">
                                                <h4 className="ca-section-title">⚠️ Missed Opportunities</h4>
                                                <ul className="ca-list ca-list-warn">
                                                    {missed.map((m, i) => <li key={i}>{m}</li>)}
                                                </ul>
                                            </div>
                                        );
                                    })()}

                                    {/* Recommended follow-up */}
                                    {selectedConversation.recommended_followup && (
                                        <div className="ca-section">
                                            <h4 className="ca-section-title">🤝 Recommended Follow-up</h4>
                                            <p className="ca-section-text ca-followup">{selectedConversation.recommended_followup}</p>
                                        </div>
                                    )}

                                    {/* Stage progression */}
                                    {(() => {
                                        const stages = Array.isArray(selectedConversation.stages_reached)
                                            ? selectedConversation.stages_reached
                                            : [];
                                        if (!stages.length) return null;
                                        return (
                                            <div className="ca-section">
                                                <h4 className="ca-section-title">🗺️ Stage Progression</h4>
                                                <div className="ca-stages">
                                                    {stages.map((s, i) => (
                                                        <span key={i} className="ca-stage-step">
                                                            {s}{i < stages.length - 1 ? ' →' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Conversation breakdown */}
                                    {(() => {
                                        const breakdown = Array.isArray(selectedConversation.conversation_breakdown)
                                            ? selectedConversation.conversation_breakdown
                                            : [];
                                        const transcript = Array.isArray(selectedConversation.conversation_transcript)
                                            ? selectedConversation.conversation_transcript
                                            : [];
                                        const items = breakdown.length ? breakdown : transcript;
                                        if (!items.length) return null;
                                        return (
                                            <div className="ca-section">
                                                <h4 className="ca-section-title">💬 Conversation Breakdown</h4>
                                                <div className="ca-transcript">
                                                    {items.map((item, i) => {
                                                        // Support both breakdown format {turn, customer, intent, stage}
                                                        // and raw transcript format {content, response, stage}
                                                        const userMsg  = item.customer || item.content || '';
                                                        const botMsg   = item.response || '';
                                                        const stage    = item.stage || '';
                                                        const intent   = item.intent || '';
                                                        return (
                                                            <div key={i} className="ca-turn">
                                                                <div className="ca-turn-meta">
                                                                    Turn {item.turn || i + 1}
                                                                    {stage && <span className="ca-turn-stage">{stage}</span>}
                                                                    {intent && <span className="ca-turn-intent">{intent}</span>}
                                                                </div>
                                                                {userMsg && (
                                                                    <div className="ca-turn-user">
                                                                        <span className="ca-turn-label">👤</span>
                                                                        <span>{userMsg}</span>
                                                                    </div>
                                                                )}
                                                                {botMsg && (
                                                                    <div className="ca-turn-bot">
                                                                        <span className="ca-turn-label">🤖</span>
                                                                        <span>{botMsg}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    )
}

export default Overview;
