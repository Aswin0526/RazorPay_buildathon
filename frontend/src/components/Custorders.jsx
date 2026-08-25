import React, { useEffect, useState } from "react";
import "../styles/Custorders.css";

function Custorders({ custData }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const custId = custData?.customer_id;
  const token = localStorage.getItem("access_token");

  useEffect(() => {
    if (!custId || !token) return;

    const fetchOrders = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/getOrders`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ cust_id: custId }),
          }
        );

        const data = await res.json();
        console.log(data);
        if (!res.ok) throw new Error(data.message);

        setOrders(data);
      } catch (err) {
        console.error("Order fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [custId, token]);

  // Helper function to get status class
  const getStatusClass = (status) => {
    const statusMap = {
      pending: "custorders-status-pending",
      confirmed: "custorders-status-confirmed",
      preparing: "custorders-status-preparing",
      ready: "custorders-status-ready",
      completed: "custorders-status-completed",
      cancelled: "custorders-status-cancelled",
    };
    return statusMap[status?.toLowerCase()] || "custorders-status-pending";
  };

  if (loading) {
    return (
      <div className="custorders-container">
        <div className="custorders-loading">
          <div className="custorders-loading-spinner"></div>
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="custorders-container">
        <h2 className="custorders-title">Your Orders</h2>
        <div className="custorders-empty">
          <div className="custorders-empty-icon">📦</div>
          <h3 className="custorders-empty-title">No Orders Yet</h3>
          <p className="custorders-empty-text">You haven't placed any orders yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="custorders-container">
      <h2 className="custorders-title">Your Orders</h2>

      <div className="custorders-list">
        {orders.map((order) => (
          <div key={order.order_id} className="custorders-card">
            {/* Card Header */}
            <div className="custorders-card-header">
              <div className="custorders-shop-info">
                <div className="custorders-shop-icon">
                  {order.shop_name?.charAt(0).toUpperCase()}
                </div>
                <div className="custorders-shop-details">
                  <h3>{order.shop_name}</h3>
                  <div className="custorders-order-date">
                    <span>📅</span>
                    <span>{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className={`custorders-status ${getStatusClass(order.state)}`}>
                <span className="custorders-status-dot"></span>
                <span>{order.state}</span>
              </div>
            </div>

            {/* Card Body */}
            <div className="custorders-card-body">
              {/* Pickup Info */}
              <div className="custorders-pickup-info">
                <div className="custorders-pickup-item">
                  <div className="custorders-pickup-icon">📍</div>
                  <div>
                    <div className="custorders-pickup-label">Pickup Date</div>
                    <div className="custorders-pickup-value">{order.pickup_date}</div>
                  </div>
                </div>
                <div className="custorders-pickup-item">
                  <div className="custorders-pickup-icon">⏰</div>
                  <div>
                    <div className="custorders-pickup-label">Pickup Time</div>
                    <div className="custorders-pickup-value">{order.pickup_time}</div>
                  </div>
                </div>
              </div>

              {/* Note */}
              {order.note && (
                <div className="custorders-note">
                  <span className="custorders-note-icon">📝</span>
                  <p className="custorders-note-text">
                    <span className="custorders-note-label">Note:</span> {order.note}
                  </p>
                </div>
              )}

              {/* Products */}
              <div className="custorders-products-section">
                <h4 className="custorders-products-title">Items Ordered</h4>
                <ul className="custorders-products-list">
                  {order.products.map((p, idx) => (
                    <li key={idx} className="custorders-product-item">
                      <div className="custorders-product-info">
                        <div className="custorders-product-check">✓</div>
                        <p className="custorders-product-name">{p.product_name}</p>
                      </div>
                      <div className="custorders-product-quantity">
                        <span className="custorders-qty-badge">{p.quantity}</span>
                        <span className="custorders-qty-label">×</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Card Footer */}
            <div className="custorders-card-footer">
              <div className="custorders-order-id">
                <span>🆔</span>
                <span>Order #{order.order_id}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Custorders;
