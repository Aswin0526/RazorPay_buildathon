import React, { useState, useEffect, useRef } from 'react';
import '../styles/Update.css';

function Update({ Data, logo: propLogo, shopImages: propShopImages }) {
    const [loading, setLoading] = useState(true);
    const [shopData, setShopData] = useState(null);
    const [ownerData, setOwnerData] = useState(null);
    const [logo, setLogo] = useState(null);
    const [shopImages, setShopImages] = useState({});
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    
    const [uploadStatus, setUploadStatus] = useState({});
    const [previewImages, setPreviewImages] = useState({});
    const fileInputRefs = useRef({});

    const [ownerFormData, setOwnerFormData] = useState({
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        owner_location: ''
    });
    
    // Shop form state
    const [shopFormData, setShopFormData] = useState({
        shop_name: '',
        shop_phone: '',
        shop_email: '',
        shop_website: '',
        shop_country: '',
        shop_state: '',
        shop_city: '',
        shop_pincode: '',
        shop_gmap_link: ''
    });

    const fetchOwnerProfile = async () => {
        const token = localStorage.getItem("access_token");
        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/profile`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json();
            if (data.success) {
                setOwnerData(data.data);
                setOwnerFormData({
                    owner_name: data.data.owner_name || '',
                    owner_email: data.data.owner_email || '',
                    owner_phone: data.data.owner_phone || '',
                    owner_location: data.data.owner_location || ''
                });
            }
        } catch (err) {
            console.error("Error fetching owner profile:", err);
        }
    };

    const fetchLogo = async () => {
        try {
            const token = localStorage.getItem("access_token");
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-logo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ shop_id: shopData?.shop_id }),
            });
            
            const result = await response.json();
            if (result.success && result.data && result.data.logo) {
                return result.data.logo;
            } else {
                return null;
            }
        } catch (err) {
            console.error('Error fetching logo:', err);
            return null;
        }
    };

    const fetchShopImages = async () => {
        try {
            const token = localStorage.getItem("access_token");
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-shop-images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ shop_id: shopData?.shop_id }),
            });
            const result = await response.json();
            if (result.success && result.data) {
                setShopImages(result.data);
            } else {
                setShopImages({});
            }
        } catch (err) {
            console.error('Error fetching shop images:', err);
            setShopImages({});
        }
    };

    useEffect(() => {
        if (Data) {
            setShopData(Data);
            setShopFormData({
                shop_name: Data.shop_name || '',
                shop_phone: Data.shop_phone || '',
                shop_email: Data.shop_email || '',
                shop_website: Data.shop_website || '',
                shop_country: Data.shop_country || '',
                shop_state: Data.shop_state || '',
                shop_city: Data.shop_city || '',
                shop_pincode: Data.shop_pincode || '',
                shop_gmap_link: Data.shop_gmap_link || ''
            });
        } else {
            const storedShopData = localStorage.getItem('user_data');
            if (storedShopData) {
                try {
                    const parsedData = JSON.parse(storedShopData);
                    const shop = parsedData.shop || parsedData;
                    setShopData(shop);
                    setShopFormData({
                        shop_name: shop.shop_name || '',
                        shop_phone: shop.shop_phone || '',
                        shop_email: shop.shop_email || '',
                        shop_website: shop.shop_website || '',
                        shop_country: shop.shop_country || '',
                        shop_state: shop.shop_state || '',
                        shop_city: shop.shop_city || '',
                        shop_pincode: shop.shop_pincode || '',
                        shop_gmap_link: shop.shop_gmap_link || ''
                    });
                } catch (error) {
                    console.error('Error parsing shop data:', error);
                }
            }
        }
    }, [Data]);
    
    useEffect(() => {
        if (!shopData) return;
        
        // Use prop values if provided (from parent component)
        if (propLogo) {
            setLogo(propLogo);
        } else {
            fetchLogo();
        }
        
        if (propShopImages) {
            setShopImages(propShopImages);
        } else {
            fetchShopImages();
        }
        
        fetchOwnerProfile();
        setLoading(false);
    }, [shopData, propLogo, propShopImages]);

    const handleOwnerChange = (e) => {
        const { name, value } = e.target;
        setOwnerFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError(null);
        setSuccess(null);
    };

    const handleShopChange = (e) => {
        const { name, value } = e.target;
        setShopFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError(null);
        setSuccess(null);
    };

    const handleOwnerSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        const token = localStorage.getItem("access_token");
        
        if (!token) {
            setError("Authentication token not found. Please login again.");
            setSubmitting(false);
            return;
        }

        try {
            const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/updateOwnerProfile`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(ownerFormData),
                }
            );

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to update owner profile");
            }

            setSuccess(data.message);
            if (data.data) {
                setOwnerFormData({
                    owner_name: data.data.owner_name || ownerFormData.owner_name,
                    owner_email: data.data.owner_email || ownerFormData.owner_email,
                    owner_phone: data.data.owner_phone || ownerFormData.owner_phone,
                    owner_location: data.data.owner_location || ownerFormData.owner_location
                });
            }
        } catch (err) {
            console.error("Update owner failed:", err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleShopSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        const token = localStorage.getItem("access_token");
        
        if (!token) {
            setError("Authentication token not found. Please login again.");
            setSubmitting(false);
            return;
        }

        try {
            const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/updateShopProfile`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(shopFormData),
                }
            );

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to update shop profile");
            }

            setSuccess(data.message);
            if (data.data) {
                setShopFormData({
                    shop_name: data.data.shop_name || shopFormData.shop_name,
                    shop_phone: data.data.shop_phone || shopFormData.shop_phone,
                    shop_email: data.data.shop_email || shopFormData.shop_email,
                    shop_website: data.data.shop_website || shopFormData.shop_website,
                    shop_country: data.data.shop_country || shopFormData.shop_country,
                    shop_state: data.data.shop_state || shopFormData.shop_state,
                    shop_city: data.data.shop_city || shopFormData.shop_city,
                    shop_pincode: data.data.shop_pincode || shopFormData.shop_pincode,
                    shop_gmap_link: data.data.shop_gmap_link || shopFormData.shop_gmap_link
                });
            }
        } catch (err) {
            console.error("Update shop failed:", err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleImageSelect = (e, imageKey) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Please select a valid image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError('Image size must be less than 5MB');
            return;
        }

        // Create preview
        const reader = new FileReader();
        reader.onload = (event) => {
            setPreviewImages(prev => ({
                ...prev,
                [imageKey]: event.target.result
            }));
        };
        reader.readAsDataURL(file);

        // Store file reference
        setUploadStatus(prev => ({
            ...prev,
            [imageKey]: { file, status: 'ready' }
        }));
    };

    const triggerFileInput = (imageKey) => {
        if (fileInputRefs.current[imageKey]) {
            fileInputRefs.current[imageKey].click();
        }
    };

    const uploadImage = async (imageKey) => {
        const status = uploadStatus[imageKey];
        if (!status || status.status !== 'ready' || !status.file) return;

        const token = localStorage.getItem("access_token");
        if (!token) {
            setError("Authentication token not found. Please login again.");
            setUploadStatus(prev => ({
                ...prev,
                [imageKey]: { ...prev[imageKey], status: 'error' }
            }));
            return;
        }

        setUploadStatus(prev => ({
            ...prev,
            [imageKey]: { ...prev[imageKey], status: 'uploading', progress: 0 }
        }));

        // Convert file to base64
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(status.file);
        });

        try {
            const requestData = {
                shop_id: shopData.shop_id,
                image_type: imageKey === 'logo' ? 'logo' : 'shop',
                image_key: imageKey === 'logo' ? undefined : imageKey,
                image_data: base64Data
            };

            const progressInterval = setInterval(() => {
                setUploadStatus(prev => {
                    if (!prev[imageKey] || prev[imageKey].progress >= 90) return prev;
                    return {
                        ...prev,
                        [imageKey]: { ...prev[imageKey], progress: (prev[imageKey].progress || 0) + 10 }
                    };
                });
            }, 200);

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/upload-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestData)
            });

            clearInterval(progressInterval);

            const result = await response.json();

            if (result.success) {
                setUploadStatus(prev => ({
                    ...prev,
                    [imageKey]: { ...prev[imageKey], status: 'success', progress: 100 }
                }));

                // Update the displayed image
                if (imageKey === 'logo') {
                    const newLogo = await fetchLogo();
                    setLogo(newLogo);
                } else {
                    fetchShopImages(); // This function updates state internally
                }

                // Clear preview
                setTimeout(() => {
                    setPreviewImages(prev => {
                        const newState = { ...prev };
                        delete newState[imageKey];
                        return newState;
                    });
                    setUploadStatus(prev => {
                        const newState = { ...prev };
                        delete newState[imageKey];
                        return newState;
                    });
                }, 2000);

                setSuccess(`${imageKey === 'logo' ? 'Logo' : 'Image'} uploaded successfully!`);
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (err) {
            console.error('Upload error:', err);
            setUploadStatus(prev => ({
                ...prev,
                [imageKey]: { ...prev[imageKey], status: 'error' }
            }));
            setError(`Failed to upload ${imageKey}: ${err.message}`);
        }
    };

    const deleteImage = async (imageKey) => {
        if (!window.confirm(`Are you sure you want to delete this ${imageKey === 'logo' ? 'logo' : 'image'}?`)) {
            return;
        }

        const token = localStorage.getItem("access_token");
        if (!token) {
            setError("Authentication token not found. Please login again.");
            return;
        }

        try {
            const requestData = {
                shop_id: shopData.shop_id,
                image_type: imageKey === 'logo' ? 'logo' : 'shop',
                image_key: imageKey === 'logo' ? undefined : imageKey,
                image_data: null // Send null to clear/delete the image
            };

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/upload-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                // Update displayed images
                if (imageKey === 'logo') {
                    setLogo(null);
                } else {
                    setShopImages(prev => {
                        const newImages = { ...prev };
                        delete newImages[imageKey];
                        return newImages;
                    });
                }
                setSuccess(`${imageKey === 'logo' ? 'Logo' : 'Image'} deleted successfully!`);
            } else {
                throw new Error(result.message || 'Delete failed');
            }
        } catch (err) {
            console.error('Delete error:', err);
            setError(`Failed to delete ${imageKey}: ${err.message}`);
        }
    };

    const renderImageUploadCard = (imageKey, label, isRequired = false) => {
        const currentImage = imageKey === 'logo' ? logo : (shopImages && shopImages[imageKey]);
        const previewImage = previewImages[imageKey];
        const status = uploadStatus[imageKey];
        const displayImage = previewImage || currentImage;

        return (
            <div 
                className={`image-upload-card ${isRequired ? 'required' : ''} ${displayImage ? 'has-image' : ''}`}
                key={imageKey}
            >
                <h4>{label}</h4>
                
                <div className="image-preview-container">
                    {displayImage ? (
                        <img src={displayImage} alt={label} />
                    ) : (
                        <div className="image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <span>No {imageKey === 'logo' ? 'logo' : 'image'}</span>
                        </div>
                    )}
                </div>

                <input
                    type="file"
                    ref={el => fileInputRefs.current[imageKey] = el}
                    className="upload-input"
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, imageKey)}
                />

                <div className="upload-buttons">
                    {!displayImage ? (
                        <button 
                            type="button"
                            className="upload-button primary"
                            onClick={() => triggerFileInput(imageKey)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            Upload
                        </button>
                    ) : (
                        <>
                            <button 
                                type="button"
                                className="upload-button primary"
                                onClick={() => triggerFileInput(imageKey)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                Change
                            </button>
                            <button 
                                type="button"
                                className="upload-button danger"
                                onClick={() => deleteImage(imageKey)}
                                disabled={isRequired && !currentImage}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                                Delete
                            </button>
                        </>
                    )}
                </div>

                {status && status.status === 'ready' && (
                    <button 
                        type="button"
                        className="update-button"
                        style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                        onClick={() => uploadImage(imageKey)}
                    >
                        Save Image
                    </button>
                )}

                {status && status.status === 'uploading' && (
                    <>
                        <div className="upload-progress">
                            <div 
                                className="upload-progress-bar" 
                                style={{ width: `${status.progress || 0}%` }}
                            />
                        </div>
                        <div className="upload-status">Uploading... {status.progress || 0}%</div>
                    </>
                )}

                {status && status.status === 'success' && (
                    <div className="upload-status" style={{ color: '#059669' }}>
                        ✓ Uploaded successfully!
                    </div>
                )}

                {status && status.status === 'error' && (
                    <div className="upload-status" style={{ color: '#dc2626' }}>
                        ✗ Upload failed
                    </div>
                )}
            </div>
        );
    };

    if (!shopData) {
        return (
            <div className="update-container">
                <div className="update-content">
                    <div className="update-error">No shop data found. Please login again.</div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="update-container">
                <div className="update-content">
                    <div className="update-loading">Loading profile...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="update-container">
            <div className="update-content">
                <h1 className="update-title">Update Shop Profile</h1>
                
                {error && <div className="update-error-message">{error}</div>}
                {success && <div className="update-success-message">{success}</div>}
                
                {/* Owner Profile Form */}
                <div className="update-form-card">
                    <h3>Owner Information</h3>
                    <form className="update-form" onSubmit={handleOwnerSubmit}>
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="owner_name">Owner Name *</label>
                                <input
                                    type="text"
                                    id="owner_name"
                                    name="owner_name"
                                    className="update-input"
                                    value={ownerFormData.owner_name}
                                    onChange={handleOwnerChange}
                                    placeholder="Enter owner name"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="owner_email">Owner Email *</label>
                                <input
                                    type="email"
                                    id="owner_email"
                                    name="owner_email"
                                    className="update-input"
                                    value={ownerFormData.owner_email}
                                    onChange={handleOwnerChange}
                                    placeholder="Enter owner email"
                                    required
                                />
                            </div>
                        </div>
                        
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="owner_phone">Owner Phone *</label>
                                <input
                                    type="tel"
                                    id="owner_phone"
                                    name="owner_phone"
                                    className="update-input"
                                    value={ownerFormData.owner_phone}
                                    onChange={handleOwnerChange}
                                    placeholder="Enter owner phone"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="owner_location">Location *</label>
                                <input
                                    type="text"
                                    id="owner_location"
                                    name="owner_location"
                                    className="update-input"
                                    value={ownerFormData.owner_location}
                                    onChange={handleOwnerChange}
                                    placeholder="Enter location"
                                    required
                                />
                            </div>
                        </div>
                        
                        <button 
                            type="submit" 
                            className="update-button"
                            disabled={submitting}
                        >
                            {submitting ? 'Saving...' : 'Save Owner Info'}
                        </button>
                    </form>
                </div>
                
                {/* Shop Profile Form */}
                <div className="update-form-card">
                    <h3>Shop Information</h3>
                    <form className="update-form" onSubmit={handleShopSubmit}>
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_name">Shop Name *</label>
                                <input
                                    type="text"
                                    id="shop_name"
                                    name="shop_name"
                                    className="update-input"
                                    value={shopFormData.shop_name}
                                    onChange={handleShopChange}
                                    placeholder="Enter shop name"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_email">Shop Email *</label>
                                <input
                                    type="email"
                                    id="shop_email"
                                    name="shop_email"
                                    className="update-input"
                                    value={shopFormData.shop_email}
                                    onChange={handleShopChange}
                                    placeholder="Enter shop email"
                                    required
                                />
                            </div>
                        </div>
                        
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_phone">Shop Phone *</label>
                                <input
                                    type="tel"
                                    id="shop_phone"
                                    name="shop_phone"
                                    className="update-input"
                                    value={shopFormData.shop_phone}
                                    onChange={handleShopChange}
                                    placeholder="Enter shop phone"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_website">Website</label>
                                <input
                                    type="text"
                                    id="shop_website"
                                    name="shop_website"
                                    className="update-input"
                                    value={shopFormData.shop_website}
                                    onChange={handleShopChange}
                                    placeholder="Enter website"
                                />
                            </div>
                        </div>
                        
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_country">Country *</label>
                                <input
                                    type="text"
                                    id="shop_country"
                                    name="shop_country"
                                    className="update-input"
                                    value={shopFormData.shop_country}
                                    onChange={handleShopChange}
                                    placeholder="Enter country"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_state">State *</label>
                                <input
                                    type="text"
                                    id="shop_state"
                                    name="shop_state"
                                    className="update-input"
                                    value={shopFormData.shop_state}
                                    onChange={handleShopChange}
                                    placeholder="Enter state"
                                    required
                                />
                            </div>
                        </div>
                        
                        <div className="update-form-row">
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_city">City *</label>
                                <input
                                    type="text"
                                    id="shop_city"
                                    name="shop_city"
                                    className="update-input"
                                    value={shopFormData.shop_city}
                                    onChange={handleShopChange}
                                    placeholder="Enter city"
                                    required
                                />
                            </div>
                            
                            <div className="update-field">
                                <label className="update-label" htmlFor="shop_pincode">Pincode *</label>
                                <input
                                    type="text"
                                    id="shop_pincode"
                                    name="shop_pincode"
                                    className="update-input"
                                    value={shopFormData.shop_pincode}
                                    onChange={handleShopChange}
                                    placeholder="Enter pincode"
                                    required
                                />
                            </div>
                        </div>
                        
                        <div className="update-form-row">
                            <div className="update-field full-width">
                                <label className="update-label" htmlFor="shop_gmap_link">Google Map Link</label>
                                <input
                                    type="text"
                                    id="shop_gmap_link"
                                    name="shop_gmap_link"
                                    className="update-input"
                                    value={shopFormData.shop_gmap_link}
                                    onChange={handleShopChange}
                                    placeholder="Enter Google Map link"
                                />
                            </div>
                        </div>
                        
                        <button 
                            type="submit" 
                            className="update-button"
                            disabled={submitting}
                        >
                            {submitting ? 'Saving...' : 'Save Shop Info'}
                        </button>
                    </form>
                </div>
                
                {/* Shop Images Section */}
                <div className="images-section">
                    <h3>Shop Images</h3>
                    <div className="image-upload-grid">
                        {renderImageUploadCard('logo', 'Shop Logo', true)}
                        {renderImageUploadCard('pic1', 'Shop Image 1')}
                        {renderImageUploadCard('pic2', 'Shop Image 2')}
                        {renderImageUploadCard('pic3', 'Shop Image 3')}
                        {renderImageUploadCard('pic4', 'Shop Image 4')}
                        {renderImageUploadCard('pic5', 'Shop Image 5')}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Update;
