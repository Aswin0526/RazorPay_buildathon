import React, { useState, useRef } from 'react';
import './Register.css';

const Register = () => {
  const [userType, setUserType] = useState('customer'); // 'customer' or 'owner'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Refs for file inputs to allow clearing
  const logoInputRef = useRef(null);
  const imageInputRefs = useRef({
    pic1: null,
    pic2: null,
    pic3: null,
    pic4: null,
    pic5: null
  });

  const [customerForm, setCustomerForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_state: '',
    customer_country: '',
    customer_city: '',
    customer_pincode: '',
    customer_password: '',
    confirmPassword: ''
  });

  const [ownerForm, setOwnerForm] = useState({
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    owner_location: '',
    shop_name: '',
    shop_phone: '',
    shop_email: '',
    shop_website: '',
    shop_country: '',
    shop_state: '',
    shop_city: '',
    shop_pincode: '',
    shop_type: '',
    shop_gmap_link: '',
    shop_password: '',
    confirmPassword: ''
  });

  // Image upload state
  const [logo, setLogo] = useState(null);
  const [images, setImages] = useState({
    pic1: null,
    pic2: null,
    pic3: null,
    pic4: null,
    pic5: null
  });
  const [logoPreview, setLogoPreview] = useState(null);
  const [imagePreviews, setImagePreviews] = useState({
    pic1: null,
    pic2: null,
    pic3: null,
    pic4: null,
    pic5: null
  });

  // Helper function to convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle logo upload
  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file for logo');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Logo file size must be less than 5MB');
        return;
      }
      
      try {
        const base64 = await fileToBase64(file);
        setLogo(base64);
        setLogoPreview(URL.createObjectURL(file));
        setError('');
      } catch (err) {
        setError('Error reading logo file');
        console.error('Logo read error:', err);
      }
    }
  };

  // Handle image upload
  const handleImageChange = async (e, imageKey) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError(`Please select a valid image file for ${imageKey}`);
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${imageKey} file size must be less than 5MB`);
        return;
      }
      
      try {
        const base64 = await fileToBase64(file);
        setImages(prev => ({
          ...prev,
          [imageKey]: base64
        }));
        setImagePreviews(prev => ({
          ...prev,
          [imageKey]: URL.createObjectURL(file)
        }));
        setError('');
      } catch (err) {
        setError(`Error reading ${imageKey} file`);
        console.error('Image read error:', err);
      }
    }
  };

  const removeLogo = () => {
    setLogo(null);
    setLogoPreview(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const removeImage = (imageKey) => {
    setImages(prev => ({
      ...prev,
      [imageKey]: null
    }));
    setImagePreviews(prev => ({
      ...prev,
      [imageKey]: null
    }));
    if (imageInputRefs.current[imageKey]) {
      imageInputRefs.current[imageKey].value = '';
    }
  };

  const hasAtLeastOneImage = () => {
    return images.pic1 || images.pic2 || images.pic3 || images.pic4 || images.pic5;
  };

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setCustomerForm({
      ...customerForm,
      [name]: value
    });
    setError('');
  };

  const handleOwnerChange = (e) => {
    const { name, value } = e.target;
    setOwnerForm({
      ...ownerForm,
      [name]: value
    });
    setError('');
  };

  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (customerForm.customer_password !== customerForm.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_name: customerForm.customer_name,
          customer_email: customerForm.customer_email,
          customer_phone: customerForm.customer_phone,
          customer_state: customerForm.customer_state,
          customer_country: customerForm.customer_country,
          customer_city: customerForm.customer_city,
          customer_pincode: customerForm.customer_pincode,
          customer_password: customerForm.customer_password
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Registration successful! Redirecting to login...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setError(data.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (ownerForm.shop_password !== ownerForm.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate logo (mandatory)
    if (!logo) {
      setError('Shop logo is mandatory. Please upload a logo.');
      setLoading(false);
      return;
    }

    // Validate at least one image
    if (!hasAtLeastOneImage()) {
      setError('At least one shop image is required. Please upload at least one image.');
      setLoading(false);
      return;
    }

    try {
      // Step 1: Register shop with basic data (no images)
      console.log(
        "data from register form",
              {owner_name: ownerForm.owner_name,
          owner_email: ownerForm.owner_email,
          owner_phone: ownerForm.owner_phone,
          owner_location: ownerForm.owner_location,
          shop_name: ownerForm.shop_name,
          shop_phone: ownerForm.shop_phone,
          shop_email: ownerForm.shop_email,
          shop_website: ownerForm.shop_website,
          shop_country: ownerForm.shop_country,
          shop_state: ownerForm.shop_state,
          shop_city: ownerForm.shop_city,
          shop_pincode: ownerForm.shop_pincode,
          shop_type: ownerForm.shop_type,
          shop_gmap_link: ownerForm.shop_gmap_link,
          shop_password: ownerForm.shop_password}
      )
      const basicResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/register-basic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          owner_name: ownerForm.owner_name,
          owner_email: ownerForm.owner_email,
          owner_phone: ownerForm.owner_phone,
          owner_location: ownerForm.owner_location,
          shop_name: ownerForm.shop_name,
          shop_phone: ownerForm.shop_phone,
          shop_email: ownerForm.shop_email,
          shop_website: ownerForm.shop_website,
          shop_country: ownerForm.shop_country,
          shop_state: ownerForm.shop_state,
          shop_city: ownerForm.shop_city,
          shop_pincode: ownerForm.shop_pincode,
          shop_type: ownerForm.shop_type,
          shop_gmap_link: ownerForm.shop_gmap_link,
          shop_password: ownerForm.shop_password
        }),
      });
      
      const basicData = await basicResponse.json();

      if (!basicData.success) {
        setError(basicData.message || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      const shopId = basicData.data.shop.shop_id;
      setSuccess('Basic registration successful! Uploading images...');

      // Step 2: Upload all images in one request
      try {
        const completeResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/complete-registration`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shop_id: shopId,
            logo: logo,
            images: {
              pic1: images.pic1,
              pic2: images.pic2,
              pic3: images.pic3,
              pic4: images.pic4,
              pic5: images.pic5
            }
          }),
        });

        const completeData = await completeResponse.json();
        console.log('Complete registration response:', completeData);

        if (completeData.success) {
          setSuccess('Registration successful! Redirecting to login...');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        } else {
          setError(completeData.message || 'Image upload failed. Please try again.');
        }
      } catch (imageError) {
        console.error('Image upload error:', imageError);
        setError('Registration completed but images failed to upload. Please try uploading images later.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserType = () => {
    setUserType(userType === 'customer' ? 'owner' : 'customer');
    setError('');
    setSuccess('');
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <h1>ShopMate</h1>
          <p>Create your {userType === 'customer' ? 'customer' : 'shop owner'} account</p>
        </div>

        <div className="toggle-container">
          <button
            className={`toggle-btn ${userType === 'customer' ? 'active' : ''}`}
            onClick={() => setUserType('customer')}
          >
            Customer
          </button>
          <button
            className={`toggle-btn ${userType === 'owner' ? 'active' : ''}`}
            onClick={() => setUserType('owner')}
          >
            Shop Owner
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Customer Registration Form */}
        {userType === 'customer' && (
          <form onSubmit={handleCustomerSubmit} className="register-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="customer_name">Full Name</label>
                <input
                  type="text"
                  id="customer_name"
                  name="customer_name"
                  value={customerForm.customer_name}
                  onChange={handleCustomerChange}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="customer_email">Email</label>
                <input
                  type="email"
                  id="customer_email"
                  name="customer_email"
                  value={customerForm.customer_email}
                  onChange={handleCustomerChange}
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="customer_phone">Phone</label>
                <input
                  type="tel"
                  id="customer_phone"
                  name="customer_phone"
                  value={customerForm.customer_phone}
                  onChange={handleCustomerChange}
                  placeholder="Enter your phone number"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="customer_pincode">Pincode</label>
                <input
                  type="text"
                  id="customer_pincode"
                  name="customer_pincode"
                  value={customerForm.customer_pincode}
                  onChange={handleCustomerChange}
                  placeholder="Enter pincode"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="customer_country">Country</label>
                <input
                  type="text"
                  id="customer_country"
                  name="customer_country"
                  value={customerForm.customer_country}
                  onChange={handleCustomerChange}
                  placeholder="Country"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="customer_state">State</label>
                <input
                  type="text"
                  id="customer_state"
                  name="customer_state"
                  value={customerForm.customer_state}
                  onChange={handleCustomerChange}
                  placeholder="State"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="customer_city">City</label>
                <input
                  type="text"
                  id="customer_city"
                  name="customer_city"
                  value={customerForm.customer_city}
                  onChange={handleCustomerChange}
                  placeholder="City"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="customer_password">Password</label>
                <input
                  type="password"
                  id="customer_password"
                  name="customer_password"
                  value={customerForm.customer_password}
                  onChange={handleCustomerChange}
                  placeholder="Create password"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={customerForm.confirmPassword}
                onChange={handleCustomerChange}
                placeholder="Confirm your password"
                required
              />
            </div>

            <button type="submit" className="register-btn" disabled={loading}>
              {loading ? 'Registering...' : 'Register as Customer'}
            </button>
          </form>
        )}

        {/* Owner Registration Form */}
        {userType === 'owner' && (
          <form onSubmit={handleOwnerSubmit} className="register-form">
            <h3>Owner Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="owner_name">Owner Name</label>
                <input
                  type="text"
                  id="owner_name"
                  name="owner_name"
                  value={ownerForm.owner_name}
                  onChange={handleOwnerChange}
                  placeholder="Full name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="owner_email">Owner Email</label>
                <input
                  type="email"
                  id="owner_email"
                  name="owner_email"
                  value={ownerForm.owner_email}
                  onChange={handleOwnerChange}
                  placeholder="Email"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="owner_phone">Phone</label>
                <input
                  type="tel"
                  id="owner_phone"
                  name="owner_phone"
                  value={ownerForm.owner_phone}
                  onChange={handleOwnerChange}
                  placeholder="Phone number"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="owner_location">Location</label>
                <input
                  type="text"
                  id="owner_location"
                  name="owner_location"
                  value={ownerForm.owner_location}
                  onChange={handleOwnerChange}
                  placeholder="Business location"
                  required
                />
              </div>
            </div>

            <h3>Shop Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_name">Shop Name</label>
                <input
                  type="text"
                  id="shop_name"
                  name="shop_name"
                  value={ownerForm.shop_name}
                  onChange={handleOwnerChange}
                  placeholder="Shop name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="shop_phone">Shop Phone</label>
                <input
                  type="tel"
                  id="shop_phone"
                  name="shop_phone"
                  value={ownerForm.shop_phone}
                  onChange={handleOwnerChange}
                  placeholder="Shop phone"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_email">Shop Email</label>
                <input
                  type="email"
                  id="shop_email"
                  name="shop_email"
                  value={ownerForm.shop_email}
                  onChange={handleOwnerChange}
                  placeholder="Shop email"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="shop_website">Website (Optional)</label>
                <input
                  type="url"
                  id="shop_website"
                  name="shop_website"
                  value={ownerForm.shop_website}
                  onChange={handleOwnerChange}
                  placeholder="https://"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_country">Country</label>
                <input
                  type="text"
                  id="shop_country"
                  name="shop_country"
                  value={ownerForm.shop_country}
                  onChange={handleOwnerChange}
                  placeholder="Country"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="shop_state">State</label>
                <input
                  type="text"
                  id="shop_state"
                  name="shop_state"
                  value={ownerForm.shop_state}
                  onChange={handleOwnerChange}
                  placeholder="State"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_city">City</label>
                <input
                  type="text"
                  id="shop_city"
                  name="shop_city"
                  value={ownerForm.shop_city}
                  onChange={handleOwnerChange}
                  placeholder="City"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="shop_pincode">Pincode</label>
                <input
                  type="text"
                  id="shop_pincode"
                  name="shop_pincode"
                  value={ownerForm.shop_pincode}
                  onChange={handleOwnerChange}
                  placeholder="Pincode"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_gmap_link">Google Maps Link (Optional)</label>
                <input
                  type="url"
                  id="shop_gmap_link"
                  name="shop_gmap_link"
                  value={ownerForm.shop_gmap_link}
                  onChange={handleOwnerChange}
                  placeholder="https://maps.google.com/..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="shop_type">Shop type</label>
                <select 
                  name="shop_type" 
                  value={ownerForm.shop_type} 
                  onChange={handleOwnerChange} 
                  required
                >
                  <option value="">Select shop type</option>
                  <option value="electronics">Electronics</option>
                  <option value="grocery">Grocery</option>
                  <option value="cosmetics">Cosmetics</option>
                  <option value="bookstore">Bookstore</option>
                  <option value="clothing">Clothing</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shop_password">Password</label>
                <input
                  type="password"
                  id="shop_password"
                  name="shop_password"
                  value={ownerForm.shop_password}
                  onChange={handleOwnerChange}
                  placeholder="Create password"
                  required
                  minLength={6}
                />
                </div>
                <div className='form-group'>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={ownerForm.confirmPassword}
                  onChange={handleOwnerChange}
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>

            {/* Image Upload Section */}
            <h3>Shop Images</h3>
            
            {/* Logo Upload - Mandatory */}
            <div className="image-upload-section">
              <div className="form-group logo-upload">
                <label htmlFor="logo" className="required">Shop Logo</label>
                <div className="file-upload-container">
                  {!logoPreview ? (
                    <div className="upload-placeholder">
                      <span className="upload-icon">📷</span>
                      <span>Click to upload logo</span>
                      <span className="upload-hint">(Max 5MB, image files only)</span>
                    </div>
                  ) : (
                    <div className="image-preview">
                      <img src={logoPreview} alt="Logo preview" />
                      <button type="button" className="remove-image" onClick={removeLogo}>
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    id="logo"
                    ref={logoInputRef}
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="file-input"
                  />
                </div>
              </div>
            </div>

            {/* Shop Images - At least one required */}
            <div className="images-upload-section">
              <div className="form-group">
                <label>Shop Images (Upload at least 1, up to 5)</label>
                <div className="images-grid">
                  {['pic1', 'pic2', 'pic3', 'pic4', 'pic5'].map((picKey) => (
                    <div key={picKey} className="image-upload-box">
                      <div className="file-upload-container small">
                        {!imagePreviews[picKey] ? (
                          <div className="upload-placeholder small">
                            <span className="upload-icon">+</span>
                            <span>{picKey.toUpperCase()}</span>
                          </div>
                        ) : (
                          <div className="image-preview small">
                            <img src={imagePreviews[picKey]} alt={`${picKey} preview`} />
                            <button 
                              type="button" 
                              className="remove-image small" 
                              onClick={() => removeImage(picKey)}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        <input
                          type="file"
                          id={picKey}
                          ref={(el) => imageInputRefs.current[picKey] = el}
                          accept="image/*"
                          onChange={(e) => handleImageChange(e, picKey)}
                          className="file-input"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" className="register-btn" disabled={loading}>
              {loading ? 'Registering...' : 'Register Shop'}
            </button>
          </form>
        )}

        <div className="register-footer">
          <p>
            Already have an account?
            <a href="/login"> Login here</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
