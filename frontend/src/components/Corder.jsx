import React, { useEffect, useState } from 'react';
import '../styles/COrder.css';


function ImageSlider({ images }) {
  const [currentIndex, setCurrentIndex] = useState(0);

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

  const processedImages = images?.map(img => processImageSrc(img)).filter(Boolean) || [];
  console.log("processed", processedImages);

  const goToPrev = () => {
    setCurrentIndex(prev => (prev === 0 ? processedImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex(prev => (prev === processedImages.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index) => setCurrentIndex(index);

  if (processedImages.length === 0) {
    return (
      <div className="corder-image-slider">
        <div className="corder-slider-image active Corder-no-image">
          No Image
        </div>
      </div>
    );
  }

  return (
    <div className="corder-image-slider">
      {processedImages.map((base64Image, index) => (
        <img
          key={index}
          src={base64Image}
          alt={`Product image ${index + 1}`}
          className={`corder-slider-image ${
            index === currentIndex ? "active" : ""
          }`}
        />
      ))}


      {processedImages.length > 1 && (
        <>
          <button
            className="corder-slider-arrow prev"
            onClick={goToPrev}
            aria-label="Previous image"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button
            className="corder-slider-arrow next"
            onClick={goToNext}
            aria-label="Next image"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          <div className="corder-slider-dots">
            {processedImages.map((_, index) => (
              <button
                key={index}
                className={`corder-slider-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {processedImages.length > 0 && (
        <div className="corder-image-counter">
          {currentIndex + 1} / {processedImages.length}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, quantity, onQuantityChange, custId, onDeleteSuccess }) {
  const maxQuantity = product.quantity || 99;
  console.log("custId",custId);
  const incrementQuantity = () => {
    if (quantity < maxQuantity) {
      onQuantityChange(quantity + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      onQuantityChange(quantity - 1);
    }
  };

  const handledelete = async () => {
    const product_id = product.product_id;
    const shop_id = product.shop_id;
    const token = localStorage.getItem("access_token");
    console.log(product_id, shop_id, custId);

    if(!product_id || !shop_id || !custId) return;
   
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/customers/deleteWishList`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            product_id: product_id,
            shop_id: shop_id,
            custId: custId
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        console.log("deletion sucess");
        onDeleteSuccess(); 
      }
    } catch (error) {
      console.error("Error deleting:", error);
    }
    
}

  return (
    <div className="corder-product-card">
      <ImageSlider images={product.images} />

      <div className="corder-product-details">
        <h4 className="corder-product-name">{product.product_name || `Product ${product.product_id}`}</h4>

        <div className="corder-product-stock">
          <span className="corder-stock-label">Available:</span>
          <span className="corder-stock-value">{maxQuantity}</span>
        </div>

        <div className="corder-quantity-selector">
          <span className="corder-quantity-label">Quantity:</span>
          <div className="corder-quantity-controls">
            <button
              className="corder-qty-btn"
              onClick={decrementQuantity}
              disabled={quantity <= 1}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <span className="corder-qty-value">{quantity}</span>
            <button
              className="corder-qty-btn"
              onClick={incrementQuantity}
              disabled={quantity >= maxQuantity}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            <button className="corder-remove-btn" onClick={handledelete}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// OrderModal Component
function OrderModal({ isOpen, onClose, shop, products, quantities, onConfirmOrder }) {
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!pickupDate || !pickupTime) {
      alert('Please select both pickup date and time');
      return;
    }

    onConfirmOrder(pickupDate, pickupTime);
    setPickupDate('');
    setPickupTime('');
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="corder-modal-overlay" onClick={onClose}>
      <div className="corder-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="corder-modal-header">
          <h3>Order from {shop.shop_name}</h3>
          <button className="corder-modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="corder-modal-body">
          <h4>Products:</h4>
          <ul className="corder-order-summary">
            {products.map((product) => (
              <li key={product.wishlist_id}>
                <span>{product.product_name || `Product ${product.product_id}`}</span>
                <span>× {quantities[product.wishlist_id] || 1}</span>
              </li>
            ))}
          </ul>

          <div className="corder-pickup-section">
            <h4>Pickup Details:</h4>
            <div className="corder-pickup-fields">
              <div className="corder-pickup-field">
                <label>Pickup Date</label>
                <input
                  type="date"
                  value={pickupDate}
                  min={today}
                  onChange={(e) => setPickupDate(e.target.value)}
                  required
                />
              </div>
              <div className="corder-pickup-field">
                <label>Pickup Time</label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="corder-modal-footer">
          <button className="corder-btn corder-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="corder-btn corder-btn-primary" onClick={handleConfirm}>
            Confirm Order
          </button>
        </div>
      </div>
    </div>
  );
}

// ShopSection Component
function ShopSection({ shop, quantities, onQuantityChange, onOrderClick, custId, onDeleteSuccess }) {
  return (
    <div className="corder-shop-section">
      <div className="corder-shop-header">
        <div className="corder-shop-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
        <h3 className="corder-shop-name">{shop.shop_name}</h3>
        <span className="corder-shop-type">{shop.type}</span>
      </div>

      <div className="corder-shop-products">
        {shop.products.map((product) => (
          <ProductCard
            key={product.wishlist_id}
            product={product}
            quantity={quantities[product.wishlist_id] || 1}
            onQuantityChange={(qty) => onQuantityChange(product.wishlist_id, qty)}
            custId={custId}
            onDeleteSuccess={onDeleteSuccess}
          />
        ))}
      </div>

      <div className="corder-shop-footer">
        <button
          className="corder-btn corder-btn-primary corder-order-btn"
          onClick={() => onOrderClick(shop)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          Make Order
        </button>
      </div>
    </div>
  );
}

// Main COrder Component
function Corder({ custData }) {
  const custId = custData?.customer_id;
  const token = localStorage.getItem('access_token');

  const [wishList, setWishList] = useState([]);
  const [groupedWishList, setGroupedWishList] = useState({});
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);

  const [reload, setReload] = useState(false);
  const onDeleteSuccess = () => {
    setReload(prev => !prev);
  };

  useEffect(() => {
    if (!custId) return;
    
    const getWishlist = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/getWishList`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              cust_id: custId,
            }),
          }
        );

        const data = await response.json();

        if (data.success) {
          setWishList(data.data);
          
          const initialQuantities = {};
          data.data.forEach((item) => {
            initialQuantities[item.wishlist_id] = 1;
          });
          setQuantities(initialQuantities);
        }
      } catch (error) {
        console.error('Error fetching wishlist:', error);
      } finally {
        setLoading(false);
      }
    };

    getWishlist();
  }, [custId, token, reload]);

  // Group products by shop_id
  useEffect(() => {
    const groups = {};

    wishList.forEach((item) => {
      const shopId = item.shop_id;
      if (!groups[shopId]) {
        groups[shopId] = {
          shop_id: shopId,
          shop_name: item.shop_name,
          type: item.type,
          products: [],
        };
      }
      groups[shopId].products.push(item);
    });

    setGroupedWishList(groups);
  }, [wishList]);

  const handleQuantityChange = (wishlistId, newQuantity) => {
    setQuantities((prev) => ({
      ...prev,
      [wishlistId]: newQuantity,
    }));
  };

  const handleOrderClick = (shop) => {
    setSelectedShop(shop);
    setModalOpen(true);
  };

  // const handleConfirmOrder = (pickupDate, pickupTime) => {
  //   if (!selectedShop) return;

  //   const orderData = {
  //     shop: {
  //       shop_id: selectedShop.shop_id,
  //       shop_name: selectedShop.shop_name,
  //       type: selectedShop.type,
  //     },
  //     products: selectedShop.products.map((product) => ({
  //       wishlist_id: product.wishlist_id,
  //       product_id: product.product_id,
  //       product_name: product.product_name || `Product ${product.product_id}`,
  //       product_type: product.type,
  //       quantity: quantities[product.wishlist_id] || 1,
  //       max_quantity: product.quantity,
  //     })),
  //     pickup: {
  //       date: pickupDate,
  //       time: pickupTime,
  //     },
  //     customer_id: custId,
  //     ordered_at: new Date().toISOString(),
  //   };

  //   console.log('Order Placed:', orderData);
  //   alert(`Order placed successfully for ${selectedShop.shop_name}!\nPickup: ${pickupDate} at ${pickupTime}`);
  //   setModalOpen(false);
  //   setSelectedShop(null);
  // };

  const handleConfirmOrder = async (pickupDate, pickupTime) => {
  if (!selectedShop) return;

  const orderData = {
    cust_id: custId,
    shop_id: selectedShop.shop_id,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    products: selectedShop.products.map((product) => ({
      product_id: product.product_id,
      quantity: quantities[product.wishlist_id] || 1
    }))
  };

  console.log(token)
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message);

    alert(`Order placed successfully!\nOrder ID: ${data.order_id}`);
    setModalOpen(false);
    setSelectedShop(null);

  } catch (err) {
    console.error("Order failed:", err);
    alert("Failed to place order");
  }
};

  console.log('wishlist:', wishList);
  console.log('groupedWishList:', groupedWishList);

  if (loading) {
    return (
      <div className="corder-container">
        <h2 className="corder-title">My Wishlist</h2>
        <div className="corder-empty">
          <div className="corder-empty-icon">⏳</div>
          <p className="corder-empty-text">Loading wishlist...</p>
        </div>
      </div>
    );
  }

  const shopGroups = Object.values(groupedWishList);
  const hasItems = shopGroups.length > 0;

  return (
    <div className="corder-container">
      <h2 className="corder-title">My Wishlist</h2>

      {!hasItems ? (
        <div className="corder-empty">
          <div className="corder-empty-icon">🛒</div>
          <p className="corder-empty-text">Your wishlist is empty</p>
        </div>
      ) : (
        <div className="corder-shop-sections">
          {shopGroups.map((shop) => (
            <ShopSection
              key={shop.shop_id}
              shop={shop}
              quantities={quantities}
              onQuantityChange={handleQuantityChange}
              onOrderClick={handleOrderClick}
              custId={custId}
              onDeleteSuccess={onDeleteSuccess}
            />
          ))}
        </div>
      )}

      <OrderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        shop={selectedShop}
        products={selectedShop?.products || []}
        quantities={quantities}
        onConfirmOrder={handleConfirmOrder}
      />
    </div>
  );
}

export default Corder;

