import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import "../styles/TextChat.css";
import "../styles/TextChat.css";

function TextChat({ onClose, isPage = false }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const messagesEndRef = useRef(null);

  // ── Image state ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [awaitingImage, setAwaitingImage] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");
  const fileInputRef = useRef(null);

  // ── Wishlist / cart state ─────────────────────────────────────────────────
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [showWishlistDialog, setShowWishlistDialog] = useState(false);
  const [cartProducts, setCartProducts] = useState([]);
  const [cartSearchResults, setCartSearchResults] = useState([]);
  const [showCartDialog, setShowCartDialog] = useState(false);
  const [selectedCartProduct, setSelectedCartProduct] = useState(null);
  const [cartQuantity, setCartQuantity] = useState(1);

  // ── Session ID ───────────────────────────────────────────────────────────
  const getSessionId = useCallback(() => {
    let id = localStorage.getItem("session_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("session_id", id); }
    return id;
  }, []);

  // ── Auto scroll to bottom ────────────────────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Image handlers ───────────────────────────────────────────────────────
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image size should be less than 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => { setUploadedImage(e.target.result); setImagePreview(e.target.result); };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => fileInputRef.current.click();

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text, image = null) => {
    if (!text.trim() && !image) return;

    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      text: text,
      image: image
    }]);

    setIsLoading(true);
    const session_id = getSessionId();
    const payload = { text: text, session_id: session_id };
    if (image) payload.image = image;

    try {
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const {
        text: responseText,
        needs_image: needsImage,
        image_context: imgContext,
        needs_wishlist: needsWishlist,
        wishlist_products: wProducts = [],
        needs_cart: needsCart,
        cart_products: cProducts = [],
        should_speak: shouldSpeak = true,
      } = data;

      if (image) removeImage();

      // ── Wishlist dialog ──────────────────────────────────────────────
      if (needsWishlist && wProducts.length > 0) {
        setWishlistProducts(wProducts);
        setShowWishlistDialog(true);
        setIsLoading(false);
        if (shouldSpeak && responseText) {
          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            sender: 'bot',
            text: responseText
          }]);
        }
        return;
      }

      if (needsCart && cProducts.length > 0) {
        setCartSearchResults(cProducts);
        setCartProducts([]);
        setSelectedCartProduct(null);
        setCartQuantity(1);
        setShowCartDialog(true);
        setIsLoading(false);
        if (shouldSpeak && responseText) {
          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            sender: 'bot',
            text: responseText
          }]);
        }
        return;
      }

      // ── Image request ────────────────────────────────────────────────
      if (needsImage && imgContext) {
        setAwaitingImage(true);
        setImageContext(imgContext);
        setImagePromptMsg(responseText);
      } else {
        setAwaitingImage(false);
        setImageContext("");
        setImagePromptMsg("");
      }

      // Add bot response
      if (responseText) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          text: responseText
        }]);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: "Sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [getSessionId]);

  // ── Handle send ──────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = inputText.trim();
    if (!text && !uploadedImage) return;

    const imageToSend = uploadedImage;
    setInputText("");
    sendMessage(text, imageToSend);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Send image when bot is waiting ───────────────────────────────────────
  const sendImageNow = useCallback(() => {
    if (!uploadedImage) return;
    sendMessage(`Here is the photo you asked for: ${imageContext}`, uploadedImage);
  }, [uploadedImage, imageContext, sendMessage]);

  // ── Wishlist handlers ────────────────────────────────────────────────────
  const handleWishlistConfirm = useCallback((product) => {
    const shopDetails = JSON.parse(localStorage.getItem("sc_details"));
    if (shopDetails) {
      const shopId = shopDetails.shopId;
      const productId = product.product_id;
      const custId = shopDetails.custId;
      const shopType = shopDetails.shopType;
      const product_name = product.product_name;
      const token = localStorage.getItem("access_token");

      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/addWishList`, {
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
          product_name: product_name
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log("Added to wishlist");
        } else {
          console.log("Not added to wishlist");
        }
      })
      .catch(error => {
        console.error("Error:", error);
      });
    }

    setShowWishlistDialog(false);
    setWishlistProducts([]);
  }, []);

  const handleWishlistDismiss = useCallback(() => {
    setShowWishlistDialog(false);
    setWishlistProducts([]);
  }, []);

  const fetchCartItems = useCallback(async () => {
    const session_id = getSessionId();
    try {
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart`, {
        method: "GET",
        headers: { "X-Session-ID": session_id }
      });
      if (!res.ok) return;
      const data = await res.json();
      setCartProducts(data.cart_items || []);
      setCartSearchResults([]);
      setSelectedCartProduct(null);
      setCartQuantity(1);
    } catch (err) {
      console.error("Cart fetch error:", err);
    }
  }, [getSessionId]);

  const handleCartSelect = useCallback((product) => {
    setSelectedCartProduct(product);
    setCartQuantity(1);
  }, []);

  const handleCartConfirm = useCallback(async () => {
    if (!selectedCartProduct) return;
    const session_id = getSessionId();
    try {
      await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": session_id
        },
        body: JSON.stringify({
          product_id: selectedCartProduct.product_id,
          product_name: selectedCartProduct.product_name,
          price: selectedCartProduct.price,
          brand: selectedCartProduct.brand,
          description: selectedCartProduct.description,
          category: selectedCartProduct.category,
          quantity: cartQuantity || 1
        })
      });
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart`, {
        method: "GET",
        headers: { "X-Session-ID": session_id }
      });
      if (res.ok) {
        const data = await res.json();
        setCartProducts(data.cart_items || []);
      }
    } catch (err) {
      console.error("Add to cart error:", err);
    }

    setShowCartDialog(false);
    setCartSearchResults([]);
    setSelectedCartProduct(null);
    setCartQuantity(1);
  }, [cartQuantity, getSessionId, selectedCartProduct]);

  const handleCartRemove = useCallback(async (productId) => {
    const session_id = getSessionId();
    try {
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": session_id
        },
        body: JSON.stringify({ product_id: productId })
      });
      if (!res.ok) return;
      const data = await res.json();
      setCartProducts(data.cart_items || []);
    } catch (err) {
      console.error("Remove from cart error:", err);
    }
  }, [getSessionId]);

  const handleCartDismiss = useCallback(() => {
    setShowCartDialog(false);
    setCartSearchResults([]);
    setSelectedCartProduct(null);
    setCartQuantity(1);
  }, []);

  // ── Handle close ─────────────────────────────────────────────────────────
  const handleOpenCart = useCallback(async () => {
    await fetchCartItems();
    setShowCartDialog(true);
  }, [fetchCartItems]);

  const handleClose = useCallback(async () => {
    const session_id = getSessionId();
    try {
      setIsAnalysing(true);
      await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
      }).catch(() => {});
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/analyze-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          localStorage.removeItem("session_id");
          localStorage.removeItem("shopmate_analyses");
          localStorage.removeItem("sc_details");
        }
      }
    } catch (err) {
      console.warn("Analysis error (non-blocking):", err);
    } finally {
      setIsAnalysing(false);
      localStorage.removeItem("session_id");
      localStorage.removeItem("shopmate_analyses");
      localStorage.removeItem("sc_details");
      if (onClose) {
        onClose();
      } else if (!isPage) {
        navigate(-1);
      }
    }
  }, [getSessionId, navigate, onClose, isPage]);

  const cartTotal = (cartProducts || []).reduce((sum, item) => {
    const price = Number(item.price || 0);
    const qty = Number(item.quantity || 1);
    return sum + (price * qty);
  }, 0);

  const renderMessageText = (text) => {
    if (!text) return null;
    const lines = String(text).split(/\n+/).map(line => line.trim()).filter(Boolean);

    if (lines.length <= 1) {
      return <p className="textchat-message-text">{text}</p>;
    }

    return (
      <div className="textchat-message-text textchat-message-list">
        {lines.map((line, idx) => {
          const isProductLine = /^(?:\d+[\.)]|[-•])\s+|₹|Price|Qty|Product|Brand|Category/i.test(line);
          return (
            <div key={`${line}-${idx}`} className={`textchat-message-line ${isProductLine ? 'product-item' : ''}`}>
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="textchat-container">
      {/* Header */}
      <div className="textchat-header">
        <button className="textchat-back-btn" onClick={handleClose}>
          ← Back
        </button>
        <h1 className="textchat-title">ShopMate Chat</h1>
        <div className="textchat-spacer"></div>
      </div>

      {/* Messages */}
      <div className="textchat-messages">
        {messages.length === 0 ? (
          <div className="textchat-welcome">
            <div className="textchat-welcome-icon">🛍️</div>
            <h2>Welcome to ShopMate Chat!</h2>
            <p>Ask me anything about products, get recommendations, or browse the shop.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`textchat-message ${msg.sender === 'user' ? 'user' : 'bot'}`}>
              {msg.sender === 'bot' && (
                <div className="textchat-avatar bot-avatar">🤖</div>
              )}
              <div className="textchat-bubble">
                {msg.image && (
                  <img src={msg.image} alt="Uploaded" className="textchat-image" />
                )}
                {renderMessageText(msg.text)}
              </div>
              {msg.sender === 'user' && (
                <div className="textchat-avatar user-avatar">👤</div>
              )}
            </div>
          ))
        )}

        {/* Bot image request */}
        {awaitingImage && (
          <div className="textchat-message bot">
            <div className="textchat-avatar bot-avatar">🤖</div>
            <div className="textchat-bubble">
              <p>📸 {imagePromptMsg}</p>
              <p className="textchat-image-hint">Please upload your photo using the button below.</p>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="textchat-message bot">
            <div className="textchat-avatar bot-avatar">🤖</div>
            <div className="textchat-bubble typing">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image upload section */}
      {awaitingImage && (
        <div className="textchat-image-section">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            style={{ display: "none" }}
          />
          {imagePreview ? (
            <div className="textchat-image-preview">
              <img src={imagePreview} alt="Preview" />
              <div className="textchat-image-actions">
                <button onClick={removeImage}>Remove</button>
                <button onClick={sendImageNow} className="send-image-btn">Send Photo</button>
              </div>
            </div>
          ) : (
            <button className="textchat-upload-btn" onClick={triggerFileInput}>
              📤 Upload Photo
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="textchat-input-container">
        <div className="textchat-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            style={{ display: "none" }}
          />
          <button
            className="textchat-attach-btn"
            onClick={triggerFileInput}
            title="Attach image"
          >
            📎
          </button>
          <textarea
            className="textchat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows="1"
          />
          <button
            className="textchat-send-btn"
            onClick={handleSend}
            disabled={!inputText.trim() && !uploadedImage}
          >
            {isLoading ? "⏳" : "📤"}
          </button>
        </div>
      </div>

      <button
        className="textchat-cart-fab"
        onClick={handleOpenCart}
        title="Open cart"
      >
        🛒
      </button>

      {/* Wishlist Dialog */}
      {showWishlistDialog && (
        <div className="wishlist-overlay">
          <div className="wishlist-dialog">
            <div className="wishlist-header">
              <span className="wishlist-icon">🛍️</span>
              <div>
                <h3>Add to Wishlist</h3>
                <p>Tap the product you want to save</p>
              </div>
              <button className="wishlist-close" onClick={handleWishlistDismiss}>✕</button>
            </div>

            <div className="wishlist-products">
              {wishlistProducts.length === 0 ? (
                <p className="wishlist-empty">No matching products found.</p>
              ) : (
                wishlistProducts.map((product, i) => (
                  <button
                    key={product.product_id ?? i}
                    className="wishlist-product"
                    onClick={() => handleWishlistConfirm(product)}
                  >
                    <div className="wishlist-product-info">
                      <span className="wishlist-product-name">{product.product_name}</span>
                      {product.brand && (
                        <span className="wishlist-product-brand">{product.brand}</span>
                      )}
                      {product.description && (
                        <span className="wishlist-product-desc">{product.description}</span>
                      )}
                    </div>
                    {product.price != null && (
                      <span className="wishlist-product-price">₹{product.price}</span>
                    )}
                  </button>
                ))
              )}
            </div>

            <button className="wishlist-cancel" onClick={handleWishlistDismiss}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCartDialog && (
        <div className="wishlist-overlay">
          <div className="wishlist-dialog">
            <div className="wishlist-header">
              <span className="wishlist-icon">🛒</span>
              <div>
                <h3>{selectedCartProduct ? "Set quantity" : "Your cart"}</h3>
                <p>{selectedCartProduct ? "Choose the quantity to add" : "Products selected for checkout"}</p>
              </div>
              <button className="wishlist-close" onClick={handleCartDismiss}>✕</button>
            </div>

            <div className="wishlist-products">
              {selectedCartProduct ? (
                <div className="wishlist-product" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="wishlist-product-info">
                    <span className="wishlist-product-name">{selectedCartProduct.product_name}</span>
                    {selectedCartProduct.brand && (
                      <span className="wishlist-product-brand">{selectedCartProduct.brand}</span>
                    )}
                    {selectedCartProduct.description && (
                      <span className="wishlist-product-desc">{selectedCartProduct.description}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <label style={{ fontWeight: 600 }}>Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={cartQuantity}
                      onChange={(e) => setCartQuantity(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: '90px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div style={{ fontWeight: 600, color: '#333' }}>
                    Item total: ₹{Number(selectedCartProduct.price || 0) * Number(cartQuantity || 1)}
                  </div>

                  <button className="wishlist-cancel" onClick={handleCartConfirm}>Confirm add to cart</button>
                </div>
              ) : (
                (cartSearchResults.length > 0 ? cartSearchResults : cartProducts).length === 0 ? (
                  <p className="wishlist-empty">Your cart is empty.</p>
                ) : (
                  (cartSearchResults.length > 0 ? cartSearchResults : cartProducts).map((product, i) => (
                    <div key={product.product_id ?? i} className="wishlist-product" style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                      <button
                        className="wishlist-product"
                        onClick={() => handleCartSelect(product)}
                        style={{ textAlign: 'left', flex: 1, border: 'none', background: 'transparent', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div className="wishlist-product-info">
                          <span className="wishlist-product-name">{product.product_name}</span>
                          {product.brand && (
                            <span className="wishlist-product-brand">{product.brand}</span>
                          )}
                          {product.description && (
                            <span className="wishlist-product-desc">{product.description}</span>
                          )}
                          <span className="wishlist-product-desc">Qty: {product.quantity || 1}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          {product.price != null && (
                            <span className="wishlist-product-price">₹{product.price}</span>
                          )}
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            Total: ₹{Number(product.price || 0) * Number(product.quantity || 1)}
                          </span>
                        </div>
                      </button>
                      <button
                        className="wishlist-cancel"
                        onClick={async () => {
                          await handleCartRemove(product.product_id);
                        }}
                        style={{ width: 'auto', padding: '6px 10px', marginLeft: '8px' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )
              )}
            </div>

            {!selectedCartProduct && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {cartProducts.length > 0 && (
                  <div style={{ fontWeight: 700, color: '#1f2937', textAlign: 'right' }}>
                    Grand Total: ₹{cartTotal}
                  </div>
                )}
                <button className="wishlist-cancel" onClick={handleCartDismiss}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysing overlay */}
      {isAnalysing && (
        <div className="analysing-overlay">
          <div className="analysing-card">
            <div className="analysing-spinner"></div>
            <p>Analysing conversation...</p>
            <p>Generating insights from your session</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TextChat;
