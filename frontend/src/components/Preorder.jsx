import React, { useEffect, useState } from "react";
import "./../styles/Preorder.css";

function Preorder({ Data }) {
  const shop_id = Data?.shop_id;
  const token = localStorage.getItem("access_token");
  const [reload, setReload] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editedNotes, setEditedNotes] = useState({});

  useEffect(() => {
    if (!shop_id || !token) return;

    const fetchOrders = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/owners/getOrders`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        console.log(data);
        setOrders(data);
      } catch (err) {
        console.error("Shop order fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [shop_id, token, reload]);

  const handleApproved = async (order) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            order_id: order.order_id,
            note: order.note || "Approved by shop. You can pick the order at the mentioned time and date",
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === order.order_id
            ? { ...o, state: "approved", note: data.order.note }
            : o
        )
      );
    } catch (err) {
      console.error("Order approval failed:", err);
      alert("Failed to approve order");
    }
  };

  const handleDone = async (order) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/markDone`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            order_id: order.order_id,
            note: order.note || "Order completed and picked up",
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === order.order_id
            ? { ...o, state: "done", note: data.order?.note || order.note }
            : o
        )
      );
      setReload(!reload);
    } catch (err) {
      console.error("Order done failed:", err);
      // Fallback: update local state if API fails
      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === order.order_id ? { ...o, state: "done" } : o
        )
      );
    }
  };

  const handleNoteChange = (orderId, newNote) => {
    setEditedNotes((prevNotes) => ({
      ...prevNotes,
      [orderId]: newNote,
    }));
  };

  const handleStateChange = (orderId, newState, order) => {
    setOrders((prevOrders) =>
      prevOrders.map((o) =>
        o.order_id === orderId ? { ...o, state: newState } : o
      )
    );

    if (newState === "approved") {
      handleApproved({ ...order, note: editedNotes[orderId] || order.note });
    } else if (newState === "done") {
      handleDone(order);
    }
  };

  const getStatusIcon = (state) => {
    switch (state) {
      case "ordered":
        return "📋";
      case "approved":
        return "✓";
      case "done":
        return "✓✓";
      default:
        return "•";
    }
  };

  // Get available next states based on current state
  const getAvailableStates = (currentState) => {
    if (currentState === "ordered") return ["approved"];
    if (currentState === "approved") return ["done"];
    return [];
  };

  if (loading) {
    return (
      <div className="preorder-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preorder-container">
      <div className="preorder-header">
        <h2 className="preorder-title">Pre Orders</h2>
        <span className="preorder-count">{orders.length} orders</span>
      </div>

      <div className="orders-grid">
        {orders.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3 className="empty-title">No orders yet</h3>
            <p className="empty-text">New pre-orders will appear here</p>
          </div>
        )}

        {orders.map((order) => {
          const availableStates = getAvailableStates(order.state);

          return (
            <div key={order.order_id} className="order-card">
              {/* Card Header */}
              <div className="card-header">
                <div className="order-info">
                  <span className="order-id">#{order.order_id}</span>
                  <span className={`status-badge ${order.state}`}>
                    <span className="status-icon">{getStatusIcon(order.state)}</span>
                    {order.state.toUpperCase()}
                  </span>
                </div>
                <div className="pickup-info">
                  <span className="pickup-icon">📅</span>
                  <span className="pickup-text">
                    {order.pickup_date} @ {order.pickup_time}
                  </span>
                </div>
              </div>

              {/* Customer & Products */}
              <div className="card-body">
                {/* Customer Section */}
                <div className="card-section">
                  <div className="section-header">
                    <span className="section-icon">👤</span>
                    <span className="section-title">Customer</span>
                  </div>
                  <p className="customer-id">{order.cust_id}</p>
                  <p className="customer-name">{order.customer_name}</p>
                  <p className="customer-email">{order.customer_email}</p>
                  <p className="customer-phone">{order.customer_phone}</p>
                </div>

                {/* Products List */}
                <div className="card-section">
                  <div className="section-header">
                    <span className="section-icon">🛒</span>
                    <span className="section-title">Products ({order.products.length})</span>
                  </div>
                  <div className="products-grid">
                    {order.products.map((p, idx) => (
                      <div key={idx} className="product-item">
                        <span className="product-name">{p.product_name}</span>
                        <span className="quantity-badge">×{p.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Note Section */}
                <div className="card-section">
                  <label className="note-label">NOTE</label>
                  <textarea
                    className="note-textarea"
                    value={editedNotes[order.order_id] ?? order.note ?? ""}
                    onChange={(e) => handleNoteChange(order.order_id, e.target.value)}
                    placeholder="Add a note..."
                  />
                </div>
              </div>

              {/* Card Footer */}
              <div className="card-footer">
                {order.state === "ordered" && (
                  <button
                    className="btn btn-approve"
                    onClick={() =>
                      handleStateChange(order.order_id, "approved", order)
                    }
                  >
                    <span className="btn-icon">✓</span>
                    Approve Order
                  </button>
                )}
                {order.state === "approved" && (
                  <button
                    className="btn btn-done"
                    onClick={() => handleStateChange(order.order_id, "done", order)}
                  >
                    <span className="btn-icon">✓✓</span>
                    Mark as Done
                  </button>
                )}
                {order.state === "done" && (
                  <div className="completed-badge">
                    <span className="completed-icon">✓✓</span>
                    Order Completed
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Preorder;

