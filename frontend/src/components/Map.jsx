import React, { useState, useEffect } from 'react';
import '../styles/Map.css';

function Map({ Data }) {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDirections, setProductDirections] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(1);
  const [editingDirections, setEditingDirections] = useState({
    direction1: '',
    direction2: '',
    direction3: '',
    direction4: '',
    direction5: '',
    image1: null,
    image2: null,
    image3: null,
    image4: null,
    image5: null,
  });

  // Get table name from shop data
  const getTableName = () => {
    if (!Data) return null;
    const normalizedShopName = Data.shop_name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return `${Data.type}_${Data.shop_id}_${normalizedShopName}`;
  };

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const tableName = getTableName();

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          table_name: tableName,
          shop_type: Data.type,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setProducts(result.data.products);
      } else {
        console.error('Failed to fetch products:', result.message);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch products when component mounts
  useEffect(() => {
    if (Data) {
      fetchProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Data]);

  const fetchProductDirections = async (productId) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-product-directions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          shop_id: Data.shop_id,
          product_id: productId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setProductDirections(result.data);
        if (result.data) {
          setEditingDirections({
            direction1: result.data.direction1 || '',
            direction2: result.data.direction2 || '',
            direction3: result.data.direction3 || '',
            direction4: result.data.direction4 || '',
            direction5: result.data.direction5 || '',
            image1: result.data.image1,
            image2: result.data.image2,
            image3: result.data.image3,
            image4: result.data.image4,
            image5: result.data.image5,
          });
          // Find the highest step (1-5) that has data, preventing later steps from hiding
          const maxStep = [1, 2, 3, 4, 5].reduce((max, n) =>
            (result.data[`direction${n}`] || result.data[`image${n}`]) ? Math.max(max, n) : max, 1
          );
          setVisibleSteps(maxStep);
        } else {
          // Reset editing directions if no data found
          setEditingDirections({
            direction1: '',
            direction2: '',
            direction3: '',
            direction4: '',
            direction5: '',
            image1: null,
            image2: null,
            image3: null,
            image4: null,
            image5: null,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching product directions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = (product) => {
    if (selectedProduct?.id === product.id) {
      setSelectedProduct(null);
      setProductDirections(null);
    } else {
      setSelectedProduct(product);
      setVisibleSteps(1);
      fetchProductDirections(product.id);
    }
  };

  const handleImageUpload = (imageKey, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEditingDirections(prev => ({
          ...prev,
          [imageKey]: e.target.result,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectionChange = (directionKey, value) => {
    setEditingDirections(prev => ({
      ...prev,
      [directionKey]: value,
    }));
  };

  const saveDirections = async () => {
    try {
      setIsLoading(true);
      const endpoint = productDirections ?
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/update-product-directions` :
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/add-product-directions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          shop_id: Data.shop_id,
          product_id: selectedProduct.id,
          directions: editingDirections,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert('Directions saved successfully!');
        fetchProductDirections(selectedProduct.id);
      } else {
        alert('Failed to save directions: ' + result.message);
      }
    } catch (error) {
      console.error('Error saving directions:', error);
      alert('Error saving directions');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelEdit = () => {
    // Revert form back to the DB state
    if (productDirections) {
      setEditingDirections({
        direction1: productDirections.direction1 || '',
        direction2: productDirections.direction2 || '',
        direction3: productDirections.direction3 || '',
        direction4: productDirections.direction4 || '',
        direction5: productDirections.direction5 || '',
        image1: productDirections.image1,
        image2: productDirections.image2,
        image3: productDirections.image3,
        image4: productDirections.image4,
        image5: productDirections.image5,
      });
      const maxStep = [1, 2, 3, 4, 5].reduce((max, n) =>
        (productDirections[`direction${n}`] || productDirections[`image${n}`]) ? Math.max(max, n) : max, 1
      );
      setVisibleSteps(maxStep);
    } else {
      setEditingDirections({
        direction1: '', direction2: '', direction3: '', direction4: '', direction5: '',
        image1: null, image2: null, image3: null, image4: null, image5: null,
      });
      setVisibleSteps(1);
    }
  };

  if (!Data) {
    return <div className="map-container">No shop data available</div>;
  }

  return (
    <div className="map-container">
      <div className="map-header">
        <h2>Product Directions Manager</h2>
        <p>Shop: {Data.shop_name} | Type: {Data.type}</p>
      </div>

      <div className={`map-content${selectedProduct ? ' has-selection' : ''}`}>
        {/* Products Grid / List */}
        <div className={`products-section${selectedProduct ? ' collapsed' : ''}`}>
          <h3>Products</h3>
          {isLoading && <div className="loading">Loading...</div>}
          <div className="products-grid">
            {products.map((product) => (
              <div
                key={product.id}
                className={`product-item ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                onClick={() => handleProductSelect(product)}
              >
                {product.image1 && (
                  <img
                    src={product.image1}
                    alt={product.product_name}
                    className="product-thumbnail"
                  />
                )}
                <div className="product-info">
                  <h4>{product.product_name}</h4>
                  <p>💰 ${product.price}</p>
                  <p>📦 Qty: {product.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Product Directions — always in DOM, shown/hidden via CSS */}
        <div className={`directions-section${selectedProduct ? ' visible' : ''}`}>
          {!selectedProduct ? (
            <div className="directions-placeholder">
              <span className="directions-placeholder-icon">📋</span>
              <p>Select a product to manage directions</p>
            </div>
          ) : (
            <>
              <div className="directions-header">
                <h3>Directions for: {selectedProduct.product_name}</h3>
                <div className="directions-actions">
                  <div className="edit-actions">
                    <button
                      className="save-btn"
                      onClick={saveDirections}
                      disabled={isLoading}
                    >
                      {productDirections ? 'Update' : 'Add Directions'}
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

              <div className="directions-content">
                {Array.from({ length: visibleSteps }, (_, i) => i + 1).map((num) => {
                  const directionKey = `direction${num}`;
                  const imageKey = `image${num}`;

                  // Handler: delete this detail and shift all subsequent ones up
                  const handleDeleteDetail = () => {
                    setEditingDirections(prev => {
                      const next = { ...prev };
                      // Shift direction and image data up from pos+1 onward
                      for (let i = num; i < visibleSteps; i++) {
                        next[`direction${i}`] = prev[`direction${i + 1}`] || '';
                        next[`image${i}`] = prev[`image${i + 1}`] || null;
                      }
                      // Clear the last slot
                      next[`direction${visibleSteps}`] = '';
                      next[`image${visibleSteps}`] = null;
                      return next;
                    });
                    setVisibleSteps(prev => prev - 1);
                  };

                  return (
                    <div key={num} className="direction-item">
                      <div className="direction-item-header">
                        <h4>Detail {num}</h4>
                        {/* Delete button for Details 2-5 (any of them) */}
                        {num > 1 && (
                          <button
                            className="delete-step-btn"
                            onClick={handleDeleteDetail}
                            title={`Delete Detail ${num}`}
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>

                      {/* Direction Dropdown */}
                      <div className="direction-text">
                        <label>Direction:</label>
                        <select
                          value={editingDirections[directionKey]}
                          onChange={(e) => handleDirectionChange(directionKey, e.target.value)}
                          className="direction-select"
                        >
                          <option value="">-- Select --</option>
                          <option value="forward">↑ Forward</option>
                          <option value="backward">↓ Backward</option>
                          <option value="left">← Left</option>
                          <option value="right">→ Right</option>
                        </select>
                      </div>

                      {/* Direction Image */}
                      <div className="direction-image">
                        <label>Image:</label>
                        <div className="image-upload">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(imageKey, e.target.files[0])}
                          />
                          {editingDirections[imageKey] && (
                            <img
                              src={editingDirections[imageKey]}
                              alt={`Detail ${num}`}
                              className="direction-preview"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add Detail button — hidden when all 5 details are visible */}
                {visibleSteps < 5 && (
                  <button
                    className="add-step-btn"
                    onClick={() => setVisibleSteps(prev => prev + 1)}
                  >
                    + Add Detail {visibleSteps + 1}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Map;