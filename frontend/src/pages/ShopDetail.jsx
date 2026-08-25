import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TextChat from './TextChat';
import '../styles//ShopDetail.css';
import Voice from '../components/Voice';

function ShopDetail() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { shopId, shopType, shopName, custId } = state || {};
  const token = localStorage.getItem('access_token');
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avgRating, setAvgRating] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [shopImages, setShopImages] = useState({});
  const [products, setProducts] = useState([]);
  const [columns, setColumns] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [wishlist, setWishlist] = useState(new Set());
  const [wishlistLoading, setWishlistLoading] = useState({});
  const [notification, setNotification] = useState(null);

  const [mapDialogVisible, setMapDialogVisible] = useState(false);
  const [currentMapProduct, setCurrentMapProduct] = useState(null);
  const [currentMapStep, setCurrentMapStep] = useState(1);
  const [mapDirections, setMapDirections] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);

  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [userFeedback, setUserFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showChat, setShowChat] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showTextChat, setShowTextChat] = useState(false);

  const [formData, setFormData] = useState({
    shopName: '',
    shopId: '',
    city: '',
    state: '',
    country: '',
    productType: '',
  });

  const handleChatClose = () => {
    setShowChat(false);
  };

  const handleVoiceOpen = () => {
    setShowChat(false);
    setShowVoice(true);
  };

  const handleVoiceClose = () => {
    setShowVoice(false);
  };

  const handleStarClick = (rating) => {
    setUserRating(rating);
    console.log('Star clicked - Rating:', rating);
  };

  const handleFeedbackSubmit = async () => {
    console.log('Feedback submitted:', {
      rating: userRating,
      feedback: userFeedback || 'No comment provided'
    });
    try {
      console.log("inside feedback");
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/customers/addfeedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customer_id: custId,
            shopId: shopId,
            rating: userRating,
            feedback: userFeedback
          }),
        }
      );
      const data = await response.json();
      if (!data.success) {
        setError(data.message || "Failed to provide feedback");
      }
    } catch (err) {
      console.error("error:", err);
      setError("Error");
    }
    setUserRating(0);
    setUserFeedback('');
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchWishlist = async () => {
    if (!custId) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/customers/getWishList`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ cust_id: custId }),
        }
      );
      const data = await response.json();
      if (data.success && data.data) {
        const wishlistIds = new Set(data.data.map(item => item.productId));
        setWishlist(wishlistIds);
      }
    } catch (err) {
      console.error("Error fetching wishlist:", err);
    }
  };

  const handleToggleWishlist = async (product) => {
    const productId = product.id;
    console.log(productId);
    const isInWishlist = wishlist.has(productId);

    setWishlistLoading(prev => ({ ...prev, [productId]: true }));

    if (isInWishlist) {
      setWishlist(prev => {
        const newWishlist = new Set(prev);
        newWishlist.delete(productId);
        return newWishlist;
      });
    } else {
      setWishlist(prev => new Set([...prev, productId]));
    }

    try {
      const endpoint = isInWishlist ? '/api/customers/removeWishList' : '/api/customers/addWishList';
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cust_id: custId,
            productId: productId,
            shopId: shopId,
            type: shopType,
            product_name: product.product_name
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        showNotification(
          isInWishlist ? 'Removed from wishlist' : 'Added to wishlist',
          'success'
        );
      } else {
        // Revert on failure
        if (isInWishlist) {
          setWishlist(prev => new Set([...prev, productId]));
        } else {
          setWishlist(prev => {
            const newWishlist = new Set(prev);
            newWishlist.delete(productId);
            return newWishlist;
          });
        }
        showNotification(data.message || 'Failed to update wishlist', 'error');
      }
    } catch (err) {
      // Revert on error
      if (isInWishlist) {
        setWishlist(prev => new Set([...prev, productId]));
      } else {
        setWishlist(prev => {
          const newWishlist = new Set(prev);
          newWishlist.delete(productId);
          return newWishlist;
        });
      }
      console.error("Wishlist error:", err);
      showNotification('Error updating wishlist', 'error');
    } finally {
      setWishlistLoading(prev => ({ ...prev, [productId]: false }));
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [custId]);


  const normalizedShopName = shopName
    ? shopName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
    : '';

  const tableName = shopId && shopType && shopName ? `${shopType}_${shopId}_${normalizedShopName}` : '';
  console.log(tableName);

  const fetchProducts = async () => {
    if (!tableName) return;

    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ table_name: tableName, shop_type: shopType }),
      });

      const data = await response.json();
      console.log(data);
      if (data.success) {
        setProducts(data.data?.products || []);
        setColumns(data.data?.columns || []);
      } else {
        setError(data.message || 'Failed to fetch products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Error fetching products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tableName) {
      fetchProducts();
    }
  }, [tableName]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter(product =>
      Object.values(product).some(value =>
        String(value || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [products, searchTerm]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const displayColumns = useMemo(() => {
    return columns.filter(col => {
      const excluded = ['id', 'created_at', 'updated_at', 'image1', 'image2', 'image3', 'image4', 'image5'];
      return !excluded.includes(col.column_name?.toLowerCase());
    });
  }, [columns]);


  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={`full-${i}`} className="fa-solid fa-star" style={{ color: '#FFC107' }}></i>);
    }

    if (hasHalfStar) {
      stars.push(<i key="half" className="fa-solid fa-star-half-stroke" style={{ color: '#FFC107' }}></i>);
    }

    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="fa-regular fa-star" style={{ color: '#FFC107' }}></i>);
    }

    return <div className="rating-stars">{stars}</div>;
  };

  useEffect(() => {
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
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        if (data.success && data.data !== null) {
          setAvgRating(parseFloat(data.data) || 0);
        }
      } catch (error) {
        console.error("Error fetching average rating:", error);
      }
    };

    fetchAvgRating();
  }, [shopId]);

  const handleOpenMap = async (product) => {
    try {
      setCurrentMapProduct(product);
      setMapDialogVisible(true);
      setCurrentMapStep(1);
      setMapLoading(true);
      setMapDirections(null);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-product-directions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ product_id: product.id, shop_id: shopId })
      });

      const result = await response.json();
      if (result.success && result.data) {
        setMapDirections(result.data);
      } else {
        setMapDirections(null);
      }
    } catch (err) {
      console.error("Error fetching map directions:", err);
      setMapDirections(null);
    } finally {
      setMapLoading(false);
    }
  };

  // Fetch feedbacks
  useEffect(() => {
    if (!shopId) return;

    const fetchFeedbacks = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/owners/getfeedbacks`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        console.log("get feedback data", data);
        if (data.success && data.data) {
          setFeedbacks(data.data);
        }
      } catch (error) {
        console.error("Error fetching feedbacks:", error);
      }
    };

    fetchFeedbacks();
  }, [shopId]);

  // Fetch shop images
  useEffect(() => {
    if (!shopId) return;

    const fetchShopImages = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-shop-images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ shop_id: shopId }),
        });
        const result = await response.json();
        if (result.success) {
          setShopImages(result.data);
        }
      } catch (err) {
        console.error('Error fetching shop images:', err);
      }
    };
    fetchShopImages();
  }, [shopId]);

  useEffect(() => {
    if (!shopId) {
      setError('No shop ID provided');
      setLoading(false);
      return;
    }

    const fetchShopDetails = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/getShopDetails`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        if (data.success) {
          setShop(data.data);
        } else {
          setError(data.message || 'Failed to fetch shop details');
        }
      } catch (err) {
        setError('Error fetching shop details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchShopDetails();
  }, [shopId]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleVoiceChatClick = async () => {
    console.log('Voice chat clicked, shop details:', {
      type: shop?.type,
      city: shop?.shop_city,
      state: shop?.shop_state,
      country: shop?.shop_country,
      shopName: shop?.shop_name
    });

    try {
      let session_id = localStorage.getItem('session_id');
      if (!session_id) {
        session_id = crypto.randomUUID();
        localStorage.setItem('session_id', session_id);
      }
      console.log("Using session_id:", session_id);

      const formData = {
        shopName: shop?.shop_name || '',
        shopId: shopId || '',
        city: shop?.shop_city || '',
        state: shop?.shop_state || '',
        country: shop?.shop_country || '',
        productType: shopType || '',
      };

      const response = await fetch(
        `${import.meta.env.VITE_CHATBOT_URL}/start-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": session_id
          },
          body: JSON.stringify({
            session_id: session_id,
            formData: formData
          }),
        }
      );
      const data = await response.json();
      console.log("Backend response:", data);

      if (!data.message) {
        console.error("Failed to start a chat");
        showNotification("Failed to start voice chat", "error");
      } else {
        if (data.session_id) {
          localStorage.setItem('session_id', data.session_id);
        }
        console.log("Voice chat session started successfully!");
        const sc_details = {
          "shopId": shopId,
          "shopType": shopType,
          "shopName": shopName,
          "custId": custId
        }
        localStorage.setItem("sc_details", JSON.stringify(sc_details));
        showNotification("Voice chat session started!", "success");
        setShowVoiceChat(true);
      }

    } catch (err) {
      console.error("Error starting voice chat:", err);
      showNotification("Error starting voice chat session", "error");
    }
  };

  const handleTextChatClick = async () => {
    console.log('Text chat clicked, shop details:', {
      type: shop?.type,
      city: shop?.shop_city,
      state: shop?.shop_state,
      country: shop?.shop_country,
      shopName: shop?.shop_name
    });

    try {
      let session_id = localStorage.getItem('session_id');
      if (!session_id) {
        session_id = crypto.randomUUID();
        localStorage.setItem('session_id', session_id);
      }
      console.log("Using session_id:", session_id);

      const formData = {
        shopName: shop?.shop_name || '',
        shopId: shopId || '',
        city: shop?.shop_city || '',
        state: shop?.shop_state || '',
        country: shop?.shop_country || '',
        productType: shopType || '',
      };

      const response = await fetch(
        `${import.meta.env.VITE_CHATBOT_URL}/start-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": session_id
          },
          body: JSON.stringify({
            session_id: session_id,
            formData: formData
          }),
        }
      );
      const data = await response.json();
      console.log("Backend response:", data);

      if (!data.message) {
        console.error("Failed to start a chat");
        showNotification("Failed to start text chat", "error");
      } else {
        if (data.session_id) {
          localStorage.setItem('session_id', data.session_id);
        }
        console.log("Text chat session started successfully!");
        const sc_details = {
          "shopId": shopId,
          "shopType": shopType,
          "shopName": shopName,
          "custId": custId
        }
        localStorage.setItem("sc_details", JSON.stringify(sc_details));
        showNotification("Text chat session started!", "success");
        setShowTextChat(true);
      }

    } catch (err) {
      console.error("Error starting text chat:", err);
      showNotification("Error starting text chat session", "error");
    }
  };

  if (loading) {
    return (
      <div className="shop-detail-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading shop details...</p>
        </div>
      </div>
    );
  }


  if (!shop) {
    return (
      <div className="shop-detail-container">
        <div className="error-container">
          <div className="error-icon">🔍</div>
          <h3 className="error-title">Shop Not Found</h3>
          <p className="error-text">The shop you're looking for doesn't exist.</p>
          <button onClick={handleBack} className="back-button">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const processImageSrc = (data) => {
    if (!data) return null;

    try {
      let base64String = '';

      if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
        const uint8 = new Uint8Array(data.data);
        base64String = btoa(String.fromCharCode.apply(null, uint8));
      }

      else if (typeof data === 'string') {
        let clean = data.trim().replace(/['"]+/g, '');

        if (clean.includes('base64,ZGF0Y')) {
          const encodedPart = clean.split('base64,')[1];
          return processImageSrc(atob(encodedPart));
        }

        if (clean.startsWith('data:image')) return clean;
        base64String = clean;
      } else {
        return null;
      }

      return base64String.startsWith('data:image')
        ? base64String
        : `data:image/jpeg;base64,${base64String}`;
    } catch (e) {
      console.error("Error processing image:", e);
      return null;
    }
  };

  return (
    <div className="shop-detail-container">
      {/* Chat Buttons */}
      <div className="chat-split-fab">
        <button
          className="chat-half voice-half"
          onClick={handleVoiceChatClick}
          title="Voice Chat"
        >
          🗣️
        </button>
        <button
          className="chat-half text-half"
          onClick={handleTextChatClick}
          title="Text Chat"
        >
          💬
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 24px',
            backgroundColor: notification.type === 'success' ? '#4CAF50' : '#f44336',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: '18px' }}>
            {notification.type === 'success' ? '✅' : '❌'}
          </span>
          <span style={{ fontWeight: '500' }}>{notification.message}</span>
        </div>
      )}

      <button onClick={handleBack} className="back-button">
        ← Back
      </button>

      {/* Store Name Section */}
      <div className="store-name-section">
        <h1 className="store-name">{shop.shop_name}</h1>
        <span className="shop-type">{shop.type}</span>
      </div>

      {/* Details and Photos Row */}
      <div className="details-photos-row">
        <div className="details-section">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">📍 Location:</span>
              {shop.shop_city}, {shop.shop_state}, {shop.shop_country}
            </div>
            <div className="info-item">
              <span className="info-label">📮 Pincode:</span>
              {shop.shop_pincode}
            </div>
            <div className="info-item">
              <span className="info-label">📧 Email:</span>
              {shop.shop_email}
            </div>
            <div className="info-item">
              <span className="info-label">📞 Phone:</span>
              {shop.shop_phone}
            </div>
          </div>

          <div className="description-section">
            <h3>About This Shop</h3>
            <p className="about-shop">
              {shop.shop_name} is a {shop.type} shop located in {shop.shop_city}, {shop.shop_state}.
              {shop.shop_website && (
                <span> Visit their website at <a href={shop.shop_website} target="_blank" rel="noopener noreferrer">{shop.shop_website}</a>.</span>
              )}
            </p>
          </div>
        </div>

        <div className="photos-section">
          <h3>Shop Images</h3>
          <div className="images-grid">
            {shopImages && shopImages.pic1 && <img src={shopImages.pic1} alt="Shop 1" />}
            {shopImages && shopImages.pic2 && <img src={shopImages.pic2} alt="Shop 2" />}
            {shopImages && shopImages.pic3 && <img src={shopImages.pic3} alt="Shop 3" />}
            {shopImages && shopImages.pic4 && <img src={shopImages.pic4} alt="Shop 4" />}
            {shopImages && shopImages.pic5 && <img src={shopImages.pic5} alt="Shop 5" />}
          </div>
        </div>
      </div>

      {/* Ratings and Feedback Row */}
      <div className="ratings-feedback-row">
        {/* Ratings Section - 50% */}
        <section className="section ratings-section">
          <h2 className="section-title">Ratings & Reviews</h2>
          <div className="ratings-container">
            <div className="rating-overview">
              <div className="rating-big">{avgRating || 0}</div>
              {renderStars(avgRating || 0)}
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
                      <div className="rating-fill" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <span className="rating-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feedback Section - 50% */}
        <section className="section feedback-section">
          <h2 className="section-title">Recent Feedback</h2>
          <div className="feedback-container">
            <div className="feedback-wrapper">
              {feedbacks.length === 0 ? (
                <p className="no-feedback">No feedbacks yet</p>
              ) : (
                <>
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

      {/* Add Rating and Feedback Section */}
      <section className="section add-feedback-section">
        <h2 className="section-title">Add Your Rating & Feedback</h2>
        <div className="add-feedback-form">
          <div className="rating-input-container">
            <label className="rating-label">Your Rating:</label>
            <div className="interactive-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`star ${star <= (hoverRating || userRating) ? 'filled' : ''}`}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  style={{
                    cursor: 'pointer',
                    fontSize: '32px',
                    color: star <= (hoverRating || userRating) ? '#FFC107' : '#E0E0E0',
                    transition: 'color 0.2s ease',
                    marginRight: '4px'
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="rating-text">
              {userRating > 0 ? `${userRating} star${userRating > 1 ? 's' : ''}` : 'Select a rating'}
            </span>
          </div>

          <div className="feedback-input-container">
            <label className="feedback-label" htmlFor="user-feedback">Your Feedback:</label>
            <textarea
              id="user-feedback"
              className="feedback-textarea"
              value={userFeedback}
              onChange={(e) => setUserFeedback(e.target.value)}
              placeholder="Share your experience with this shop..."
              rows={4}
            />
          </div>

          <button
            className="submit-feedback-btn"
            onClick={handleFeedbackSubmit}
            disabled={userRating === 0}
          >
            Submit Feedback
          </button>
        </div>
      </section>

      Search
      <div className="stock-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          <span className="search-icon">🔍</span>
        </div>
        <div className="product-count">
          Total Products: {filteredProducts.length}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="products-table">
          <thead>
            <tr>
              {displayColumns.map(col => (
                <th key={col.column_name}>
                  {col.column_name?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </th>
              ))}
              <th>Images</th>
              <th>Map</th>
              <th>Wishlist</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product, index) => (
                <tr key={product.id || index}>
                  {displayColumns.map(col => {
                    const value = product[col.column_name];
                    const columnType = col.data_type;
                    let displayValue = value;

                    if (value === null || value === undefined) {
                      displayValue = '-';
                    } else if (columnType === 'numeric' || columnType === 'decimal') {
                      displayValue = `₹${value}`;
                    } else if (columnType === 'boolean' || columnType === 'bool') {
                      displayValue = value ? '✅' : '❌';
                    } else if (columnType === 'date') {
                      displayValue = new Date(value).toLocaleDateString();
                    }

                    return (
                      <td key={col.column_name}>
                        {displayValue}
                      </td>
                    );
                  })}

                  {/* Images Cell */}
                  <td className="images-cell">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['image1', 'image2', 'image3', 'image4', 'image5'].map((key) => {
                        const rawData = product[key];
                        if (!rawData) return null;

                        const finalSrc = processImageSrc(rawData);

                        return finalSrc ? (
                          <img
                            key={`${product.id || index}-${key}`}
                            src={finalSrc}
                            alt="Product"
                            onClick={() => setPreviewImage(finalSrc)}
                            style={{
                              width: '50px',
                              height: '50px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #ccc',
                              backgroundColor: '#eee',
                              cursor: 'pointer'
                            }}
                          />
                        ) : null;
                      })}
                    </div>

                  </td>
                  {/* Map Button Cell */}
                  <td className="map-cell">
                    <button
                      onClick={() => handleOpenMap(product)}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#4c6ef5",
                        color: "white",
                        border: "none",
                        borderRadius: "20px",
                        cursor: "pointer",
                        fontWeight: "500",
                        transition: "all 0.2s"
                      }}
                    >
                      Start
                    </button>
                  </td>
                  {/* Wishlist Button Cell */}
                  <td>
                    {(() => {
                      console.log(product);
                      const productId = product.id;
                      const isInWishlist = wishlist.has(productId);
                      const isLoading = wishlistLoading[productId];
                      return (
                        <button
                          onClick={() => handleToggleWishlist(product)}
                          disabled={isLoading}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: isInWishlist ? "#FF6B6B" : "#f8f9fa",
                            color: isInWishlist ? "#fff" : "#333",
                            border: isInWishlist ? "none" : "1px solid #ddd",
                            borderRadius: "20px",
                            cursor: isLoading ? "wait" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "14px",
                            fontWeight: "500",
                            transition: "all 0.2s ease",
                          }}
                          title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
                        >
                          {isLoading ? (
                            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                          ) : (
                            <span style={{
                              fontSize: "16px",
                              transition: "transform 0.2s ease",
                              transform: isInWishlist ? "scale(1.1)" : "scale(1)"
                            }}>
                              {isInWishlist ? "❤️" : "🤍"}
                            </span>
                          )}
                          <span>{isInWishlist ? "Wishlisted" : "Wishlist"}</span>
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={displayColumns.length + 1} className="no-data">
                  {searchTerm ? 'No products match your search' : 'No products found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredProducts.length > itemsPerPage && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="page-btn"
          >
            ««
          </button>
          <button
            onClick={() => setCurrentPage(prev => prev - 1)}
            disabled={currentPage === 1}
            className="page-btn"
          >
            «
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage === totalPages}
            className="page-btn"
          >
            »
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="page-btn"
          >
            »»
          </button>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="image-preview-overlay"
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            cursor: 'zoom-out'
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '30px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
            <img
              src={previewImage}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                borderRadius: '8px',
                boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
              }}
            />
            {/* Virtual Try-On button — only for clothing shops */}
            {shopType === 'clothing' && (
              <button
                onClick={() => navigate('/virtual-tryon', { state: { garmentImage: previewImage } })}
                style={{
                  position: 'absolute',
                  bottom: '-52px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '12px 28px',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '30px',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(102,126,234,0.5)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.5px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)'}
                onMouseOut={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1)'}
              >
                👗 Virtual Try-On
              </button>
            )}
          </div>
        </div>
      )}

      {/* Map Dialog Modal */}
      {mapDialogVisible && (
        <div className="map-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="map-modal-content" style={{
            backgroundColor: '#fff', padding: '20px', borderRadius: '12px',
            width: '600px', maxWidth: '90%', position: 'relative', textAlign: 'center',
            minHeight: '400px', display: 'flex', flexDirection: 'column'
          }}>
            <button
              onClick={() => { setMapDialogVisible(false); setMapDirections(null); }}
              style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '28px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#333' }}
            >×</button>
            <h2 style={{ marginBottom: '20px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              Directions: {currentMapProduct?.product_name || 'Product'}
            </h2>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mapLoading ? (
                <div style={{ fontSize: '18px', color: '#666' }}>Loading map data...</div>
              ) : mapDirections ? (
                (() => {
                  const currentImageRaw = mapDirections[`image${currentMapStep}`];
                  const currentDir = mapDirections[`direction${currentMapStep}`];

                  // Empty step reached, meaning path is complete
                  if (!currentImageRaw && !currentDir) {
                    return (
                      <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s' }}>
                        <div style={{ fontSize: '60px', marginBottom: '15px' }}>🏁</div>
                        <h3 style={{ color: '#4CAF50', fontSize: '24px' }}>You have reached the destination!</h3>
                      </div>
                    );
                  }

                  const imgSrc = processImageSrc(currentImageRaw);

                  return (
                    <div style={{ position: 'relative', display: 'inline-block', width: '100%', animation: 'fadeIn 0.3s' }}>
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={`Step ${currentMapStep}`}
                          style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', height: '300px', backgroundColor: '#f5f5f5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '8px', border: '2px dashed #ccc', color: '#888',
                          fontSize: '20px'
                        }}>
                          No Map Image
                        </div>
                      )}

                      {currentDir && (() => {
                        // Icon points RIGHT by default (>>).
                        // forward=up → -90°, backward=down → +90°, left → 180°, right → 0°
                        const rotationMap = { forward: -90, backward: 90, left: 180, right: 0 };
                        const animKeyMap = {
                          forward: 'chevron-move-up',
                          backward: 'chevron-move-down',
                          left: 'chevron-move-left',
                          right: 'chevron-move-right',
                        };
                        const rotation = rotationMap[currentDir] ?? 0;
                        const animName = animKeyMap[currentDir] ?? 'chevron-move-right';

                        return (
                          <div
                            onClick={() => setCurrentMapStep(prev => prev + 1)}
                            title={`Go ${currentDir}`}
                            style={{
                              position: 'absolute', top: '50%', left: '50%',
                              cursor: 'pointer',
                              animation: `${animName} 0.85s ease-in-out infinite`,
                            }}
                          >
                            <img
                              src="/direction-arrow.svg"
                              alt={currentDir}
                              draggable={false}
                              style={{
                                width: '90px',
                                height: '90px',
                                objectFit: 'contain',
                                transform: `rotate(${rotation}deg)`,
                                filter: 'drop-shadow(0 0 10px rgba(0, 200, 255, 0.85))',
                                display: 'block',
                                pointerEvents: 'none',
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()
              ) : (
                <div style={{ fontSize: '18px', color: '#888' }}>
                  No directions available for this product.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

{showVoiceChat && (
        <Voice onClose={() => setShowVoiceChat(false)} />
      )}
{showTextChat && (
        <div className="voice-modal-overlay">
          <div className="voice-modal">
            <button className="voice-modal-close" onClick={() => setShowTextChat(false)}>×</button>
            <TextChat onClose={() => setShowTextChat(false)} isPage={true} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ShopDetail;

