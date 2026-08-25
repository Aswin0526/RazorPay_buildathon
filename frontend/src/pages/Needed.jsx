import React, { useEffect, useState } from 'react';
import '../styles/Needed.css';

function Needed({ custData }) {
    const token = localStorage.getItem('access_token');
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [votedProducts, setVotedProducts] = useState({});
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newProduct, setNewProduct] = useState({
        product_name: '',
        type: '',
        description: '',
        pic: null
    });
    const [submitting, setSubmitting] = useState(false);
    
    // Filter states
    const [filterType, setFilterType] = useState('all');
    const [sortBy, setSortBy] = useState('votes');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const getMostNeeded = async (customerData) => {
            try {
                const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/getMostNeeded`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        city: custData.customer_city,
                        state: custData.customer_state,
                        country: custData.customer_country,
                        customerId: custData.customer_id
                    }),
                });

                const result = await response.json();
                console.log("Location updated:", result);
                
                if (result.success && result.data) {
                    setProducts(result.data);
                }
            } catch (error) {
                console.error("Error sending location:", error);
            } finally {
                setLoading(false);
            }
        };

        if (custData && custData.customer_id) {
            getMostNeeded();
        }

    }, [custData, token]);

    // Get unique product types for filter
    const productTypes = ['all', ...new Set(products.map(p => p.type).filter(Boolean))];

    // Filter and sort products
    const getFilteredProducts = () => {
        let filtered = [...products];

        // Filter by type
        if (filterType !== 'all') {
            filtered = filtered.filter(p => p.type === filterType);
        }

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(p => 
                p.product_name.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }

        // Sort products
        switch (sortBy) {
            case 'votes':
                filtered.sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0));
                break;
            case 'newest':
                filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;
            case 'oldest':
                filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                break;
            case 'name':
                filtered.sort((a, b) => a.product_name.localeCompare(b.product_name));
                break;
            default:
                break;
        }

        return filtered;
    };

    const filteredProducts = getFilteredProducts();

    const handleVote = async (productId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/addVote`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    productId: productId,
                    customerId: custData.customer_id
                }),
            });

            const result = await response.json();
            
            if (result.success) {
                // Update local state to reflect the vote
                setVotedProducts(prev => ({ ...prev, [productId]: true }));
                setProducts(prev => prev.map(p => 
                    p.id === productId 
                        ? { ...p, total_votes: (p.total_votes || 0) + 1 }
                        : p
                ));
            }
        } catch (error) {
            console.error("Error voting:", error);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewProduct(prev => ({ ...prev, pic: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setNewProduct(prev => ({ ...prev, pic: null }));
    };

    const handleAddProduct = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/addProduct`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    product_name: newProduct.product_name,
                    type: newProduct.type,
                    description: newProduct.description,
                    pic: newProduct.pic,
                    state: custData.customer_state,
                    city: custData.customer_city,
                    country: custData.customer_country
                }),
            });

            const result = await response.json();
            
            if (result.success) {
                // Add new product to the list
                setProducts(prev => [result.data, ...prev]);
                setShowAddDialog(false);
                setNewProduct({
                    product_name: '',
                    type: '',
                    description: '',
                    pic: null
                });
            } else {
                alert(result.message || 'Failed to add product');
            }
        } catch (error) {
            console.error("Error adding product:", error);
            alert('Failed to add product');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="needed-container">
                <div className="needed-loading">
                    <div className="needed-loading-spinner">⏳</div>
                    <p>Loading products...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="needed-container">
            <div className="needed-content">
                <h1 className="needed-title">Most Needed Products</h1>
                <p className="needed-subtitle">Discover and vote for products your community needs</p>

                {/* Header Section with Filters */}
                <div className="needed-header-section">
                    {/* Filters Row */}
                    <div className="needed-filters-row">
                        {/* Search */}
                        <div className="needed-filter-group">
                            <label className="needed-filter-label">Search</label>
                            <input
                                type="text"
                                className="needed-filter-select"
                                placeholder="Search products..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ minWidth: '200px' }}
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="needed-filter-group">
                            <label className="needed-filter-label">Category</label>
                            <select 
                                className="needed-filter-select"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                            >
                                {productTypes.map(type => (
                                    <option key={type} value={type}>
                                        {type === 'all' ? 'All Categories' : type.charAt(0).toUpperCase() + type.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="needed-filter-group">
                            <label className="needed-filter-label">Sort By</label>
                            <select 
                                className="needed-filter-select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="votes">Most Votes</option>
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="name">Name (A-Z)</option>
                            </select>
                        </div>
                    </div>

                    {/* Add Product Button */}
                    <button 
                        className="needed-add-button"
                        onClick={() => setShowAddDialog(true)}
                    >
                        <span>+</span> Add Product
                    </button>
                </div>

                {/* Products Grid */}
                {filteredProducts.length > 0 ? (
                    <div className="needed-products-grid">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="needed-product-card">
                                {/* Product Image */}
                                <div className="needed-product-image-container">
                                    {product.pic ? (
                                        <img 
                                            src={product.pic} 
                                            alt={product.product_name}
                                            className="needed-product-image"
                                        />
                                    ) : (
                                        <div className="needed-product-image-placeholder">📦</div>
                                    )}
                                    <span className="needed-type-badge">{product.type}</span>
                                </div>

                                {/* Product Info */}
                                <div className="needed-product-info">
                                    <h3 className="needed-product-name">{product.product_name}</h3>
                                    <p className="needed-product-description">{product.description}</p>
                                    
                                    <div className="needed-product-location">
                                        <span className="needed-location-icon">📍</span>
                                        {product.city}, {product.state}
                                    </div>

                                    {/* Vote Section */}
                                    <div className="needed-vote-section">
                                        <div className="needed-vote-count">
                                            <span className="needed-vote-icon">🔥</span>
                                            <span className="needed-vote-number">{product.total_votes || 0}</span>
                                        </div>
                                        <button 
                                            className={`needed-vote-button ${votedProducts[product.id] ? 'voted' : ''}`}
                                            onClick={() => handleVote(product.id)}
                                            disabled={votedProducts[product.id]}
                                        >
                                            {votedProducts[product.id] ? '✓ Voted' : 'Vote'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="needed-empty">
                        <div className="needed-empty-icon">🔍</div>
                        <p className="needed-empty-text">No products found</p>
                        <p className="needed-empty-subtext">
                            {searchQuery || filterType !== 'all' 
                                ? 'Try adjusting your filters or search query' 
                                : 'Be the first to add a product your community needs!'}
                        </p>
                    </div>
                )}
            </div>

            {/* Add Product Dialog */}
            {showAddDialog && (
                <div className="needed-dialog-overlay" onClick={() => setShowAddDialog(false)}>
                    <div className="needed-dialog" onClick={e => e.stopPropagation()}>
                        <div className="needed-dialog-header">
                            <h2>Add New Product</h2>
                            <button 
                                className="needed-dialog-close"
                                onClick={() => setShowAddDialog(false)}
                            >
                                ×
                            </button>
                        </div>
                        
                        <form onSubmit={handleAddProduct} className="needed-dialog-form">
                            <div className="needed-form-group">
                                <label>Product Name *</label>
                                <input 
                                    type="text"
                                    value={newProduct.product_name}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, product_name: e.target.value }))}
                                    placeholder="What product do you need?"
                                    required
                                />
                            </div>

                            <div className="needed-form-group">
                                <label>Category *</label>
                                <select 
                                    value={newProduct.type}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, type: e.target.value }))}
                                    required
                                >
                                    <option value="">Select a category</option>
                                    <option value="clothing">Clothing</option>
                                    <option value="electronics">Electronics</option>
                                    <option value="bookstore">Books</option>
                                    <option value="cosmetics">Cosmetics</option>
                                </select>
                            </div>

                            <div className="needed-form-group">
                                <label>Description</label>
                                <textarea 
                                    value={newProduct.description}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Describe what you're looking for..."
                                    rows="3"
                                />
                            </div>

                            <div className="needed-form-group">
                                <label>Product Image (Optional)</label>
                                <label className="needed-file-input-container">
                                    <input 
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        className="needed-file-input"
                                    />
                                    <div className="needed-upload-icon">📷</div>
                                    <div className="needed-upload-text">
                                        Click to upload an image
                                    </div>
                                </label>
                                {newProduct.pic && (
                                    <div className="needed-image-preview">
                                        <img src={newProduct.pic} alt="Preview" />
                                        <button 
                                            type="button"
                                            className="needed-image-remove"
                                            onClick={handleRemoveImage}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="needed-dialog-actions">
                                <button 
                                    type="button" 
                                    className="needed-cancel-button"
                                    onClick={() => setShowAddDialog(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="needed-submit-button"
                                    disabled={submitting}
                                >
                                    {submitting ? '⏳ Adding...' : '✨ Add Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Needed;

