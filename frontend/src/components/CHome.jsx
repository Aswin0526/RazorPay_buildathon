import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/CHome.css';

function CHome({ custData }) {
  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');
  const custId = custData?.customer_id || ''
  const defaultCity = custData?.customer_city || '';
  const defaultState = custData?.customer_state || '';
  const defaultCountry = custData?.customer_country || '';

  const [filterCountry, setFilterCountry] = useState(defaultCountry);
  const [filterState, setFilterState] = useState(defaultState);
  const [filterCity, setFilterCity] = useState(defaultCity);
  const [filterType, setFilterType] = useState('All');

  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  const shopTypes = [
    { value: 'All', label: 'All Types' },
    { value: 'grocery', label: 'Grocery' },
    { value: 'bookstore', label: 'Bookstore' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'electronics', label: 'Electronics' },
    { value: 'cosmetics', label: 'Cosmetics' }
  ];

  const resetToDefault = () => {
    setFilterCountry(defaultCountry);
    setFilterState(defaultState);
    setFilterCity(defaultCity);
    setFilterType('All');
  };

  const handleShopClick = async (shopId, shopType, shopName) => {
    try{
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/addShopPoint`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              shopId: shopId,
              shopType: shopType,
              shopName: shopName,
              custId: custId
            }),
          }
        );

        const data = await response.json();

        if (data.message) {
          navigate('/shop-detail', {
            state: {
              shopId,
              shopType,
              shopName,
              custId
            }
          });
        } else {
          setError(data.message || 'Failed to navigate to shop Page');
        }

    }catch(e){
      console.error(e);
    }
  };

  // Fetch shop data based on filters
  useEffect(() => {
    if (!token) return;

    const fetchShopData = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/getShopInLoc`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              HCountry: filterCountry, 
              HState: filterState, 
              HCity: filterCity,
              type: filterType
            }),
          }
        );

        const data = await response.json();
        if (data.success) {
          setShops(data.data);
        }
      } catch (error) {
        console.error("Error fetching shops:", error);
      } finally {
        setLoading(false);
      }
    };

    // Debounce the API call for text inputs
    const timeoutId = setTimeout(() => {
      fetchShopData();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [token, filterCountry, filterState, filterCity, filterType]);

  if (loading) {
    return (
      <div className="chome-container">
        <div className="chome-loading-container">
          <div className="chome-loading-spinner"></div>
          <p className="chome-loading-text">Loading shops...</p>
        </div>
      </div>
    );
  }

  if (!shops.length) {
    return (
      <div className="chome-container">
        <div className="chome-filter-section">
          <h2 className="chome-filter-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            Filter Shops
          </h2>
          <div className="chome-filter-grid">
            <div className="chome-filter-group">
              <label className="chome-filter-label">Country</label>
              <input
                type="text"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                placeholder="Enter country"
                className="chome-filter-input"
              />
            </div>
            <div className="chome-filter-group">
              <label className="chome-filter-label">State</label>
              <input
                type="text"
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                placeholder="Enter state"
                className="chome-filter-input"
              />
            </div>
            <div className="chome-filter-group">
              <label className="chome-filter-label">City</label>
              <input
                type="text"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                placeholder="Enter city"
                className="chome-filter-input"
              />
            </div>
            <div className="chome-filter-group">
              <label className="chome-filter-label">Shop Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="chome-filter-select"
              >
                {shopTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="chome-button-container">
            <button
              onClick={resetToDefault}
              className="chome-reset-button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
              Reset to My Location
            </button>
          </div>
        </div>
        <div className="chome-empty-state">
          <div className="chome-empty-icon">🔍</div>
          <h3 className="chome-empty-title">No shops found</h3>
          <p className="chome-empty-text">
            Try adjusting your filters or search in a different location
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chome-container">
      <div className="chome-filter-section">
        <h2 className="chome-filter-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          Filter Shops
        </h2>
        <div className="chome-filter-grid">
          <div className="chome-filter-group">
            <label className="chome-filter-label">Country</label>
            <input
              type="text"
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              placeholder="Enter country"
              className="chome-filter-input"
            />
          </div>
          <div className="chome-filter-group">
            <label className="chome-filter-label">State</label>
            <input
              type="text"
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              placeholder="Enter state"
              className="chome-filter-input"
            />
          </div>
          <div className="chome-filter-group">
            <label className="chome-filter-label">City</label>
            <input
              type="text"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              placeholder="Enter city"
              className="chome-filter-input"
            />
          </div>
          <div className="chome-filter-group">
            <label className="chome-filter-label">Shop Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="chome-filter-select"
            >
              {shopTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="chome-button-container">
          <button
            onClick={resetToDefault}
            className="chome-reset-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Reset to My Location
          </button>
        </div>
      </div>

      <div className="chome-info-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        Showing {shops.length} shop{shops.length !== 1 ? 's' : ''} in your area
      </div>

      <div className="chome-shop-grid">
        {shops.map((shop) => (
          <div
            className="chome-shop-card"
            key={shop.shop_id}
            onClick={() => handleShopClick(shop.shop_id, shop.type, shop.shop_name)}
          >
            <div className="chome-shop-logo">
              {shop.logo ? (
                <img
                  src={`data:image/png;base64,${shop.logo}`}
                  alt={`${shop.shop_name} Logo`}
                  className="chome-shop-logo-img"
                />
              ) : (
                <div className="chome-logo-fallback">
                  {shop.shop_name?.charAt(0) || 'S'}
                </div>
              )}
            </div>

            <div className="chome-shop-details">
              <h3 className="chome-shop-name">{shop.shop_name}</h3>
              <span className="chome-shop-type">{shop.type}</span>
              <div className="chome-shop-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                {shop.shop_city}, {shop.shop_state}
              </div>
              <p className="chome-shop-pincode">📍 Pincode: {shop.shop_pincode}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CHome;

