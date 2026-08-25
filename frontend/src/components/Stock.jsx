import React, { useState, useEffect, useMemo } from 'react';
import '../styles/Stock.css';

const Stock = ({ Data }) => {
  const [products, setProducts] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [images, setImages] = useState({ image1: null, image2: null, image3: null, image4: null, image5: null });
  const [previewImage, setPreviewImage] = useState(null);
  const [imagePreviews, setImagePreviews] = useState({ image1: null, image2: null, image3: null, image4: null, image5: null });
  const [submitting, setSubmitting] = useState(false);

  useEffect(()=>{
    console.log("images",images)
  },[images])

  const normalizedShopName = Data.shop_name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const tableName = `${Data.type}_${Data.shop_id}_${normalizedShopName}`;
  console.log(tableName);
  const fetchProducts = async () => {
    try {
      setLoading(true);
      console.log("in");
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ table_name: tableName, shop_type: Data.type }),
      });

      const data = await response.json();
      if (data.success) {
        setProducts(data.data?.products || []);
        setColumns(data.data?.columns || []);
      } else {
        setError(data.message || 'Failed to fetch products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [tableName, Data.type]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter(product =>
      Object.values(product).some(value =>
        String(value || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [products, searchTerm]);

  // Pagination
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? null : parseFloat(value)) : value
    }));
  };



  const handleImageChange = (e, imageKey) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showNotification('Image size should be less than 5MB', 'error');
        return;
      }

      setImages(prev => ({ ...prev, [imageKey]: file }));


      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews(prev => ({ ...prev, [imageKey]: e.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (imageKey) => {
    setImages(prev => ({ ...prev, [imageKey]: null }));
    setImagePreviews(prev => ({ ...prev, [imageKey]: null }));
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const openAddModal = () => {
    setModalMode('add');
    setEditingProduct(null);
    setFormData({});
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setModalMode('edit');
    const productCopy = { ...product };
    delete productCopy.created_at;
    delete productCopy.updated_at;
    setEditingProduct(productCopy);
    setFormData(productCopy);
    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setFormData({});
    setImages({ image1: null, image2: null, image3: null, image4: null, image5: null });
    setImagePreviews({ image1: null, image2: null, image3: null, image4: null, image5: null });
    setSubmitting(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem('access_token');
      const endpoint = modalMode === 'add' ? '/add-product' : '/update-product';

      const productData = { ...formData };

      for (let i = 1; i <= 5; i++) {
        const imageKey = `image${i}`;
        if (images[imageKey]) {
          try {
            const base64 = await fileToBase64(images[imageKey]);
            productData[imageKey] = base64;
          } catch (error) {
            console.error(`Error converting ${imageKey} to base64:`, error);
            showNotification(`Error processing ${imageKey}`, 'error');
            setSubmitting(false);
            return;
          }
        }
      }

      const requestBody = {
        table_name: tableName,
        shop_type: Data.type,
        product_data: productData
      };

      if (modalMode === 'edit') {
        requestBody.product_id = editingProduct.id;
      }

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        showNotification(
          modalMode === 'add' ? 'Product added successfully!' : 'Product updated successfully!',
          'success'
        );
        closeModal();
        fetchProducts();
      } else {
        // Display specific error messages from backend
        if (data.missing_fields) {
          showNotification(`Missing required fields: ${data.missing_fields.join(', ')}`, 'error');
        } else if (data.message) {
          showNotification(data.message, 'error');
        } else {
          showNotification('Operation failed', 'error');
        }
      }
    } catch (err) {
      console.error('Error:', err);
      showNotification('Error connecting to server', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (product) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    try {
      const token = localStorage.getItem('access_token');
      const productId = product.id;

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/delete-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          table_name: tableName,
          shop_type: Data.type,
          product_id: productId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        showNotification('Product deleted successfully!', 'success');
        fetchProducts();
      } else {
        showNotification(data.message || 'Delete failed', 'error');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      showNotification('Error connecting to server', 'error');
    }
  };

  // Show notification
  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 3000);
  };

  // Get display columns (exclude internal fields)
  const displayColumns = useMemo(() => {
    return columns.filter(col => {
      const excluded = ['id', 'created_at', 'updated_at', 'image1', 'image2', 'image3', 'image4', 'image5'];
      return !excluded.includes(col.column_name.toLowerCase());
    });
  }, [columns]);

  if (loading && products.length === 0) {
    return (
      <div className="stock-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stock-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchProducts} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-container">
      {/* Notification */}
      {notification.show && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="stock-header">
        <h2>Stock Management</h2>
        <button className="add-btn" onClick={openAddModal}>
          + Add Product
        </button>
      </div>

      {/* Search */}
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

      {/* Products Table */}
      <div className="table-wrapper">
        <table className="products-table">
          <thead>
            <tr>
              {displayColumns.map(col => (
                <th key={col.column_name}>
                  {col.column_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </th>
              ))}
              <th>Images</th>
              <th>Actions</th>
            </tr>
          </thead>
         <tbody>
  {paginatedProducts.length > 0 ? (
    paginatedProducts.map((product, index) => (
      <tr key={product.id || index}>
        {displayColumns.map(col => {
          const value = product[col.column_name];
          const columnType =  col.data_type;
          // console.log(value);
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

        {/* --- IMPROVED IMAGE CELL --- */}
 <td className="images-cell">
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
    {['image1', 'image2', 'image3', 'image4', 'image5'].map((key) => {
      let rawData = product[key];

      // 1. Skip if empty
      if (!rawData) return null;

      const getFinalSrc = (data) => {
        try {
          let base64String = '';

          // 2. Handle Postgres 'bytea' format (buffer/Uint8Array)
          if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
            // Convert Buffer array to Base64 string
            const uint8 = new Uint8Array(data.data);
            base64String = btoa(String.fromCharCode.apply(null, uint8));
          } 
          // 3. Handle data if it's already a string but potentially double-encoded
          else if (typeof data === 'string') {
            let clean = data.trim().replace(/['"]+/g, '');
            
            // Unwrapping the "Double Base64" you mentioned earlier
            if (clean.includes('base64,ZGF0Y')) {
              const encodedPart = clean.split('base64,')[1];
              return getFinalSrc(atob(encodedPart)); 
            }
            
            if (clean.startsWith('data:image')) return clean;
            base64String = clean;
          } else {
            return null;
          }

          // 4. Final check: Does it have the prefix?
          return base64String.startsWith('data:image') 
            ? base64String 
            : `data:image/jpeg;base64,${base64String}`;
        } catch (e) {
          console.error("Error processing bytea image:", e);
          return null;
        }
      };

      const finalSrc = getFinalSrc(rawData);

     // ... inside your getFinalSrc logic ...
      return finalSrc ? (
        <img
          key={`${product.id || index}-${key}`}
          src={finalSrc}
          alt="Product"
          onClick={() => setPreviewImage(finalSrc)} // <--- Add this
          style={{
            width: '50px',
            height: '50px',
            objectFit: 'cover',
            borderRadius: '4px',
            border: '1px solid #ccc',
            backgroundColor: '#eee',
            cursor: 'pointer' // <--- Add this for UX
          }}
          // ... rest of your code ...
        />
      ) : null;
          })}
        </div>
      </td>
        {/* --- END IMAGE CELL --- */}

        <td className="actions-cell">
          <button className="edit-btn" onClick={() => openEditModal(product)} title="Edit">✏️</button>
          <button className="delete-btn" onClick={() => handleDelete(product)} title="Delete">🗑️</button>
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan={displayColumns.length + 2} className="no-data">
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalMode === 'add' ? 'Add New Product' : 'Edit Product'}</h3>
              <button className="close-btn" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit} className="product-form">
              <div className="form-fields">
                {displayColumns.map(col => (
                  <div className="form-group" key={col.column_name}>
                    <label htmlFor={col.column_name}>
                      {col.column_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </label>
                    <input
                      type={col.data_type === 'numeric' || col.data_type === 'decimal' ? 'number' : 'text'}
                      id={col.column_name}
                      name={col.column_name}
                      value={formData[col.column_name] || ''}
                      onChange={handleInputChange}
                      step={col.data_type === 'numeric' || col.data_type === 'decimal' ? '0.01' : undefined}
                    />
                  </div>
                ))}
              </div>

              {/* Image Upload Section */}
              <div className="image-upload-section">
                <h4>Product Images</h4>
                <div className="image-grid">
                  {['image1', 'image2', 'image3', 'image4', 'image5'].map((imageKey, index) => (
                    <div key={imageKey} className="image-upload-item">
                      <label htmlFor={imageKey} className="image-label">
                        Image {index + 1}
                      </label>
                      <div className="image-upload-container">
                        {imagePreviews[imageKey] ? (
                          <div className="image-preview">
                            <img
                              src={imagePreviews[imageKey]}
                              alt={`Preview ${index + 1}`}
                              className="preview-image"
                            />
                            <button
                              type="button"
                              className="remove-image-btn"
                              onClick={() => removeImage(imageKey)}
                              title="Remove image"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="image-upload-placeholder">
                            <input
                              type="file"
                              id={imageKey}
                              accept="image/*"
                              onChange={(e) => handleImageChange(e, imageKey)}
                              style={{ display: 'none' }}
                            />
                            <label htmlFor={imageKey} className="upload-btn">
                              Choose Image
                            </label>
                            <p className="upload-hint">Max 5MB</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? 'Submitting...' : (modalMode === 'add' ? 'Add Product' : 'Update Product')}
                </button>
              </div>
            </form>
          </div>
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
    <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
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
    </div>
  </div>
)}
    </div>
  );
};

export default Stock;

