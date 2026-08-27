import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition
} from "react-speech-recognition";
import "../styles/Voice.css";
import { EdgeTTS } from 'edge-tts-universal/browser';

const Voice = ({ onClose, isPage = false }) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const [isMuted, setIsMuted]                     = useState(false);
  const [status, setStatus]                       = useState("Tap to speak");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isPlayingAudio, setIsPlayingAudio]       = useState(false);
  const [isAnalysing, setIsAnalysing]             = useState(false);

  // ── Image state ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage]   = useState(null);
  const [imagePreview, setImagePreview]     = useState(null);
  const [awaitingImage, setAwaitingImage]   = useState(false);
  const [imageContext, setImageContext]     = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");

  // ── Wishlist / cart / spending limit state ─────────────────────────────────
  const [wishlistProducts, setWishlistProducts]     = useState([]);
  const [showWishlistDialog, setShowWishlistDialog] = useState(false);
  const [cartProducts, setCartProducts]             = useState([]);
  const [cartSearchResults, setCartSearchResults]   = useState([]);
  const [showCartDialog, setShowCartDialog]         = useState(false);
  const [selectedCartProduct, setSelectedCartProduct] = useState(null);
  const [cartQuantity, setCartQuantity]             = useState(1);
  const [spendingLimit, setSpendingLimit]           = useState(null);

  const lastTranscriptRef      = useRef("");
  const pauseTimeoutRef        = useRef(null);
  const isTranscribingRef      = useRef(false);
  const lastSentTranscriptRef  = useRef("");
  const currentTimeoutRef      = useRef(null);
  const audioRef               = useRef(null);
  const fileInputRef           = useRef(null);

  // ── Image handlers ───────────────────────────────────────────────────────
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024)    { alert("Image size should be less than 5MB"); return; }
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

  // ── Transcript tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (transcript !== lastTranscriptRef.current) {
      const newText = transcript.slice(lastTranscriptRef.current.length);
      if (newText.trim()) setInterimTranscript(newText);
      lastTranscriptRef.current = transcript;
    }
  }, [transcript]);

  // ── Status label ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlayingAudio)             setStatus("Playing response...");
    else if (showWishlistDialog)    setStatus("Pick a product to wishlist");
    else if (awaitingImage)         setStatus("Please upload the photo below");
    else if (listening && !isMuted) setStatus("Listening...");
    else if (isMuted)               setStatus("Muted — tap to unmute");
    else                            setStatus("Tap to speak");
  }, [listening, isMuted, isPlayingAudio, awaitingImage, showWishlistDialog]);

  // ── Auto-send after 1.5s pause ───────────────────────────────────────────
  useEffect(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    if (listening && !isMuted && transcript.trim()) {
      pauseTimeoutRef.current = setTimeout(() => {
        if (transcript.trim()) sendTranscript();
      }, 1500);
    }
    return () => { if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current); };
  }, [transcript, listening, isMuted]);

  // ── Session ID ───────────────────────────────────────────────────────────
  const getSessionId = useCallback(() => {
    let id = localStorage.getItem("session_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("session_id", id); }
    return id;
  }, []);

  // ── TTS playback ─────────────────────────────────────────────────────────
  const playTTS = useCallback(async (text) => {
    try {
      setIsPlayingAudio(true);
      const ttsInstance = new EdgeTTS(text, "en-IN-NeerjaNeural");
      const result      = await ttsInstance.synthesize();
      const blob        = new Blob([result.audio], { type: "audio/mpeg" });
      const audioUrl    = URL.createObjectURL(blob);
      const audio       = new Audio(audioUrl);
      audioRef.current  = audio;
      audio.play().catch((err) => { console.error("Playback error:", err); setIsPlayingAudio(false); });
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlayingAudio(false);
        setIsMuted(false);
        resetTranscript();
        isTranscribingRef.current = false;
        audioRef.current          = null;
      };
    } catch (err) {
      console.error("TTS error:", err);
      setIsPlayingAudio(false);
    }
  }, [resetTranscript]);

  // ── Razorpay Checkout Handler ─────────────────────────────────────────────
  const triggerRazorpayCheckout = useCallback((checkoutAction) => {
    if (!checkoutAction || checkoutAction.action !== "TRIGGER_RAZORPAY_CHECKOUT") return;
    const { key_id, order_id, amount, currency } = checkoutAction.data || {};

    if (!window.Razorpay) {
      alert("Razorpay checkout script is loading. Please try again.");
      return;
    }

    const options = {
      key: key_id,
      amount: amount,
      currency: currency || "INR",
      name: "ShopMate",
      description: "Order Checkout (Single Portal)",
      order_id: order_id,
      handler: async function (response) {
        try {
          const verifyRes = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/payment/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id || order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.status === "PAID") {
            const session_id = getSessionId();
            await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/clear`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
            }).catch(() => {});
            setCartProducts([]);
            await playTTS("Payment successful! Your order has been placed.");
          } else {
            await playTTS("Payment verification failed. Please contact support.");
          }
        } catch (err) {
          console.error("Verification error:", err);
        }
      },
      prefill: {
        name: "ShopMate Customer",
        email: "customer@shopmate.ai",
        contact: "9999999999"
      },
      theme: {
        color: "#2563eb"
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (resp) {
      playTTS("Payment failed. Please try again.");
    });
    rzp.open();
  }, [getSessionId, playTTS]);

  // ── Main send ────────────────────────────────────────────────────────────
  const sendTranscript = useCallback((overrideText = null) => {
    const finalTranscript = (overrideText || transcript).trim();

    if (!finalTranscript)                                                    { console.log("Skipping: empty");      return; }
    if (isTranscribingRef.current)                                           { console.log("Skipping: in progress"); return; }
    if (!overrideText && lastSentTranscriptRef.current === finalTranscript)  { console.log("Skipping: duplicate");  return; }

    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }

    isTranscribingRef.current     = true;
    lastSentTranscriptRef.current = finalTranscript;
    setIsMuted(true);
    setIsPlayingAudio(true);

    const session_id  = getSessionId();
    const imageToSend = uploadedImage || null;
    const payload     = { text: finalTranscript, session_id: session_id };
    if (imageToSend) payload.image = imageToSend;

    fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
      body:    JSON.stringify(payload)
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(async (data) => {
        const {
          text: responseText,
          needs_image: needsImage,
          image_context: imgContext,
          needs_wishlist: needsWishlist,
          wishlist_products: wProducts = [],
          needs_cart: needsCart,
          cart_products: cProducts = [],
          show_cart: showCart = false,
          should_speak: shouldSpeak = true,
          checkout_action: checkoutAction = null,
          spending_limit: updatedLimit = null,
        } = data;

        if (updatedLimit !== null && updatedLimit !== undefined) {
          setSpendingLimit(updatedLimit);
        }

        if (imageToSend) removeImage();

        // ── Trigger Razorpay modal if checkout action present ─────────────
        if (checkoutAction) {
          triggerRazorpayCheckout(checkoutAction);
        }

        // ── Wishlist dialog ──────────────────────────────────────────────
        if (needsWishlist && wProducts.length > 0) {
          setWishlistProducts(wProducts);
          setShowWishlistDialog(true);
          setIsPlayingAudio(false);
          isTranscribingRef.current = false;
          if (shouldSpeak && responseText) await playTTS(responseText);
          return;
        }

        // ── Cart dialog ─────────────────────────────────────────────────────
        if (needsCart && cProducts.length > 0) {
          if (cProducts.length === 1) {
            setSelectedCartProduct(cProducts[0]);
            setCartSearchResults([]);
          } else {
            setCartSearchResults(cProducts);
            setSelectedCartProduct(null);
          }
          setCartQuantity(1);
          setShowCartDialog(true);
          setIsPlayingAudio(false);
          isTranscribingRef.current = false;
          if (shouldSpeak && responseText) await playTTS(responseText);
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

        if (responseText) {
          await playTTS(responseText);
        }
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        setIsPlayingAudio(false);
        setIsMuted(false);
        isTranscribingRef.current = false;
      });
  }, [transcript, uploadedImage, getSessionId, playTTS, triggerRazorpayCheckout]);

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
          console.log("Added in wishlist");
        } else {
          console.log("Not added in wishlist");
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
    } catch (err) {
      console.error("Cart fetch error:", err);
    }
  }, [getSessionId]);

  // ── Sync cart on mount ───────────────────────────────────────────────────
  useEffect(() => {
    fetchCartItems();
  }, [fetchCartItems]);

  const handleCartSelect = useCallback((product) => {
    setSelectedCartProduct(product);
    setCartQuantity(1);
  }, []);

  const handleCartConfirm = useCallback(async () => {
    if (!selectedCartProduct) return;
    const session_id = getSessionId();
    try {
      const addRes = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": session_id
        },
        body: JSON.stringify({
          product_id:   selectedCartProduct.product_id,
          product_name: selectedCartProduct.product_name,
          price:        selectedCartProduct.price,
          brand:        selectedCartProduct.brand,
          description:  selectedCartProduct.description,
          category:     selectedCartProduct.category,
          quantity:     cartQuantity || 1,
          shop_id:      selectedCartProduct.shop_id,
          shop_name:    selectedCartProduct.shop_name,
          shop_city:    selectedCartProduct.shop_city,
          shop_type:    selectedCartProduct.shop_type
        })
      });
      if (addRes.ok) {
        const addData = await addRes.json();
        if (addData.cart_items) {
          setCartProducts(addData.cart_items);
        }
        if (addData.should_speak && addData.recommendation_text) {
          await playTTS(addData.recommendation_text);
        }
      }
    } catch (err) {
      console.error("Add to cart error:", err);
    }

    setShowCartDialog(false);
    setCartSearchResults([]);
    setSelectedCartProduct(null);
    setCartQuantity(1);
  }, [cartQuantity, getSessionId, playTTS, selectedCartProduct]);

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

  // ── Send image when bot is waiting ───────────────────────────────────────
  const sendImageNow = useCallback(() => {
    if (!uploadedImage) return;
    sendTranscript(`Here is the photo you asked for: ${imageContext}`);
  }, [uploadedImage, imageContext, sendTranscript]);

  // ── Recording controls ───────────────────────────────────────────────────
  const startListening = () => {
    setIsMuted(false);
    SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    sendTranscript();
  };

  const toggleRecording = () => {
    if (listening && !isMuted) stopListening();
    else if (isMuted) startListening();
    else {
      resetTranscript();
      lastTranscriptRef.current = "";
      setInterimTranscript("");
      startListening();
    }
  };

  const toggleMute = () => {
    if (isMuted) { SpeechRecognition.startListening({ continuous: true, language: "en-IN" }); setIsMuted(false); }
    else         { SpeechRecognition.stopListening(); setIsMuted(true); }
  };
    
  const stopAndListen = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current     = false;
    lastSentTranscriptRef.current = "";
    if (pauseTimeoutRef.current)   { clearTimeout(pauseTimeoutRef.current);   pauseTimeoutRef.current   = null; }
    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }
    resetTranscript();
    lastTranscriptRef.current = "";
    setInterimTranscript("");
    SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
  };

  const handleClose = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current     = false;
    lastSentTranscriptRef.current = "";
    lastTranscriptRef.current     = "";
    if (pauseTimeoutRef.current)   { clearTimeout(pauseTimeoutRef.current);   pauseTimeoutRef.current   = null; }
    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }
    if (listening) SpeechRecognition.stopListening();

    const session_id = getSessionId();
    try {
      setIsAnalysing(true);
      await fetch(`${import.meta.env.VITE_CHATBOT_URL}/cart/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
      }).catch(() => {});
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/analyze-session`, {
        method:  "POST",
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
      onClose();
    }
  }, [listening, getSessionId, onClose]);

  const cartTotal = (cartProducts || []).reduce((sum, item) => {
    const price = Number(item.price || 0);
    const qty = Number(item.quantity || 1);
    return sum + (price * qty);
  }, 0);

  // ── Browser support ──────────────────────────────────────────────────────
  if (!browserSupportsSpeechRecognition && !isPage) {
    return (
      <div className="voice-modal-overlay">
        <div className="voice-modal">
          <div className="voice-header">
            <p className="voice-header-title">ShopMate Voice</p>
            <button className="voice-modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="voice-content">
            <p className="voice-status">Browser doesn't support speech recognition.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={isPage ? "voice-page-wrapper" : "voice-modal-overlay"}>
      <div className={isPage ? "voice-page-container" : "voice-modal"}>

        {!showCartDialog && (
          <button
            className="voice-cart-fab"
            onClick={async () => {
              await fetchCartItems();
              setSelectedCartProduct(null);
              setCartSearchResults([]);
              setShowCartDialog(true);
            }}
            title="Open cart"
          >
            🛒
          </button>
        )}

        {/* ── Fixed header ── */}
        <div className="voice-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p className="voice-header-title">{isPage ? "ShopMate Text Chat" : "ShopMate Voice"}</p>
            {spendingLimit !== null && (
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                Limit: ₹{Number(spendingLimit).toLocaleString()}
              </span>
            )}
          </div>
          <button className="voice-modal-close" onClick={handleClose}>×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="voice-content">

          {/* Mic + status */}
          <div className="voice-top-section">
            <button className="voice-mic-button" onClick={toggleRecording}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   className={`voice-mic-icon ${listening && !isMuted ? "recording" : ""}`}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8"  y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <p className="voice-status">{status}</p>
          </div>

          {/* Stop & Listen */}
          {isPlayingAudio && (
            <button className="voice-stop-button" onClick={stopAndListen}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="voice-stop-icon">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="voice-stop-text">Stop & Listen</span>
            </button>
          )}

          {/* Bot image request banner */}
          {awaitingImage && (
            <div className="voice-image-request">
              <p className="voice-image-request-msg">📸 {imagePromptMsg}</p>
              <p className="voice-image-hint">Upload your photo below, then tap "Send Photo"</p>
            </div>
          )}

          {/* Image upload / preview */}
          <div className={`voice-image-section ${awaitingImage ? "voice-image-section--active" : ""}`}>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload}
                   accept="image/*" style={{ display: "none" }} />
            {imagePreview ? (
              <div className="voice-image-preview-container">
                <img src={imagePreview} alt="Uploaded" className="voice-image-preview" />
                <div className="voice-image-actions">
                  <button className="voice-image-remove-btn" onClick={removeImage}>✕ Remove</button>
                  {awaitingImage && (
                    <button className="voice-image-send-btn" onClick={sendImageNow}>📤 Send Photo</button>
                  )}
                </div>
              </div>
            ) : (
              <button
                className={`voice-image-upload-btn ${awaitingImage ? "voice-image-upload-btn--pulse" : ""}`}
                onClick={triggerFileInput}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {awaitingImage ? "Upload Photo" : "Add Image"}
              </button>
            )}
          </div>

          {/* Transcript */}
          {(transcript || interimTranscript) && (
            <div className="voice-transcript-container">
              <p className="voice-transcript">
                {transcript}
                <span className="voice-interim">{interimTranscript}</span>
              </p>
            </div>
          )}

          {/* Mute control */}
          {listening && (
            <div className="voice-controls">
              <button className={`voice-mute-btn ${isMuted ? "muted" : ""}`} onClick={toggleMute}
                      title={isMuted ? "Unmute" : "Mute"}>
                {isMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8"  y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8"  y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          )}

        </div>

        {/* ── Wishlist Product Dialog ── */}
        {showWishlistDialog && (
          <div className="wl-dialog-overlay">
            <div className="wl-dialog">
              <div className="wl-dialog-header">
                <span className="wl-dialog-icon">🛍️</span>
                <div>
                  <p className="wl-dialog-title">Add to Wishlist</p>
                  <p className="wl-dialog-sub">Tap the product you want to save</p>
                </div>
                <button className="wl-dialog-close" onClick={handleWishlistDismiss}>✕</button>
              </div>

              <div className="wl-product-list">
                {wishlistProducts.length === 0 ? (
                  <p className="wl-empty">No matching products found.</p>
                ) : (
                  wishlistProducts.map((product, i) => (
                    <button
                      key={product.product_id ?? i}
                      className="wl-product-card"
                      onClick={() => handleWishlistConfirm(product)}
                    >
                      <div className="wl-product-info">
                        <span className="wl-product-name">{product.product_name}</span>
                        {product.brand && (
                          <span className="wl-product-brand">{product.brand}</span>
                        )}
                        {product.description && (
                          <span className="wl-product-desc">{product.description}</span>
                        )}
                      </div>
                      {product.price != null && (
                        <span className="wl-product-price">₹{product.price}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button className="wl-cancel-btn" onClick={handleWishlistDismiss}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showCartDialog && (
          <div className="wl-dialog-overlay">
            <div className="wl-dialog">
              <div className="wl-dialog-header">
                <span className="wl-dialog-icon">🛒</span>
                <div>
                  <p className="wl-dialog-title">{selectedCartProduct ? "Set quantity" : (cartSearchResults.length > 0 ? "Select product to add" : "Your cart")}</p>
                  <p className="wl-dialog-sub">
                    {selectedCartProduct ? "Choose the quantity to add" : (cartSearchResults.length > 0 ? "Tap the product you want to add" : "Products selected for checkout")}
                  </p>
                </div>
                <button className="wl-dialog-close" onClick={handleCartDismiss}>✕</button>
              </div>

              <div className="wl-product-list">
                {selectedCartProduct ? (
                  <div className="wl-product-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="wl-product-info">
                      <span className="wl-product-name">{selectedCartProduct.product_name}</span>
                      {selectedCartProduct.brand && (
                        <span className="wl-product-brand">{selectedCartProduct.brand}</span>
                      )}
                      {selectedCartProduct.description && (
                        <span className="wl-product-desc">{selectedCartProduct.description}</span>
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

                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button className="wl-cancel-btn" style={{ flex: 1, background: '#2563eb', color: '#fff' }} onClick={handleCartConfirm}>
                        Confirm add to cart
                      </button>
                      <button className="wl-cancel-btn" style={{ width: 'auto' }} onClick={handleCartDismiss}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  (cartSearchResults.length > 0 ? cartSearchResults : cartProducts).length === 0 ? (
                    <p className="wl-empty">Your cart is empty.</p>
                  ) : (
                    (cartSearchResults.length > 0 ? cartSearchResults : cartProducts).map((product, i) => (
                      <div key={product.product_id ?? i} className="wl-product-card" style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                        <button
                          className="wl-product-card"
                          onClick={() => handleCartSelect(product)}
                          style={{ textAlign: 'left', flex: 1, border: 'none', background: 'transparent', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div className="wl-product-info">
                            <span className="wl-product-name">{product.product_name}</span>
                            {product.brand && (
                              <span className="wl-product-brand">{product.brand}</span>
                            )}
                            {product.description && (
                              <span className="wl-product-desc">{product.description}</span>
                            )}
                            <span className="wl-product-desc">Qty: {product.quantity || 1}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                            {product.price != null && (
                              <span className="wl-product-price">₹{product.price}</span>
                            )}
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              Total: ₹{Number(product.price || 0) * Number(product.quantity || 1)}
                            </span>
                          </div>
                        </button>
                        <button
                          className="wl-cancel-btn"
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
                    <>
                      <div style={{ fontWeight: 700, color: '#1f2937', textAlign: 'right' }}>
                        Grand Total: ₹{cartTotal}
                      </div>
                      <button
                        className="wl-cancel-btn"
                        style={{ background: '#10b981', color: '#fff', fontWeight: 600, padding: '10px' }}
                        onClick={() => {
                          handleCartDismiss();
                          sendTranscript("Let's checkout");
                        }}
                      >
                        💳 Proceed to Checkout (₹{cartTotal})
                      </button>
                    </>
                  )}
                  <button className="wl-cancel-btn" onClick={handleCartDismiss}>
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Analysing overlay ── */}
        {isAnalysing && (
          <div className="voice-analysing-overlay">
            <div className="voice-analysing-card">
              <div className="voice-analysing-spinner" />
              <p className="voice-analysing-title">Analysing conversation...</p>
              <p className="voice-analysing-sub">Generating insights from your session</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Voice;