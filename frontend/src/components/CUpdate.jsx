import React, {useState, useEffect} from 'react';
import '../styles/CUpdate.css';

function CUpdate({custData}){
    console.log('Customer Data received:', custData);
    
    const [formData, setFormData] = useState({
        customer_name: custData?.customer_name || '',
        customer_email: custData?.customer_email || '',
        customer_phone: custData?.customer_phone || '',
        customer_city: custData?.customer_city || '',
        customer_state: custData?.customer_state || '',
        customer_pincode: custData?.customer_pincode || '',
        customer_country: custData?.customer_country || ''
    });
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // If custData is provided directly, use it and skip API call
    useEffect(() => {
        if (custData) {
            setFormData({
                customer_name: custData.customer_name || '',
                customer_email: custData.customer_email || '',
                customer_phone: custData.customer_phone || '',
                customer_city: custData.customer_city || '',
                customer_state: custData.customer_state || '',
                customer_pincode: custData.customer_pincode || '',
                customer_country: custData.customer_country || ''
            });
            setLoading(false);
        } else {
            // Fallback to API call if no custData provided
            fetchProfileData();
        }
    }, [custData]);

    const fetchProfileData = async () => {
        const custId = custData?.customer_id;
        const token = localStorage.getItem("access_token");

        if (!custId || !token) {
            setError("Missing customer ID or authentication token");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/customers/profile`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ customer_id: custId }),
                }
            );

            const data = await res.json();
            console.log('Profile data fetched:', data);
            
            if (!res.ok) throw new Error(data.message);

            setFormData({
                customer_name: data.data.customer_name || '',
                customer_email: data.data.customer_email || '',
                customer_phone: data.data.customer_phone || '',
                customer_city: data.data.customer_city || '',
                customer_state: data.data.customer_state || '',
                customer_pincode: data.data.customer_pincode || '',
                customer_country: data.data.customer_country || ''
            });
        } catch (err) {
            console.error("Profile fetch failed:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        console.log(`Field "${name}" changed to:`, value);
        
        // Clear messages when user starts editing
        setError(null);
        setSuccess(null);
    };

    const handleSubmit = async (e) => {
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

        console.log('Submitting form data:', formData);

        try {
            const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/customers/updateProfile`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(formData),
                }
            );

            const data = await res.json();
            console.log('Update response:', data);

            if (!res.ok) {
                throw new Error(data.message || "Failed to update profile");
            }

            setSuccess(data.message);
            
            // Update local state with returned data
            if (data.data) {
                setFormData({
                    customer_name: data.data.customer_name || formData.customer_name,
                    customer_email: data.data.customer_email || formData.customer_email,
                    customer_phone: data.data.customer_phone || formData.customer_phone,
                    customer_city: data.data.customer_city || formData.customer_city,
                    customer_state: data.data.customer_state || formData.customer_state,
                    customer_pincode: data.data.customer_pincode || formData.customer_pincode,
                    customer_country: data.data.customer_country || formData.customer_country
                });
            }
        } catch (err) {
            console.error("Update failed:", err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="cupdate-container">
                <div className="cupdate-loading">Loading profile...</div>
            </div>
        );
    }

    if (error && !formData.customer_name) {
        return (
            <div className="cupdate-container">
                <div className="cupdate-error">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="cupdate-container">
            <h2 className="cupdate-title">Update Profile</h2>
            
            {error && <div className="cupdate-error-message">{error}</div>}
            {success && <div className="cupdate-success-message">{success}</div>}
            
            <form className="cupdate-form" onSubmit={handleSubmit}>
                <div className="cupdate-form-row">
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_name">Full Name *</label>
                        <input
                            type="text"
                            id="customer_name"
                            name="customer_name"
                            className="cupdate-input"
                            value={formData.customer_name}
                            onChange={handleChange}
                            placeholder="Enter your full name"
                            required
                        />
                    </div>
                    
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_email">Email *</label>
                        <input
                            type="email"
                            id="customer_email"
                            name="customer_email"
                            className="cupdate-input"
                            value={formData.customer_email}
                            onChange={handleChange}
                            placeholder="Enter your email"
                            required
                        />
                    </div>
                </div>
                
                <div className="cupdate-form-row">
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_phone">Phone Number *</label>
                        <input
                            type="tel"
                            id="customer_phone"
                            name="customer_phone"
                            className="cupdate-input"
                            value={formData.customer_phone}
                            onChange={handleChange}
                            placeholder="Enter your phone number"
                            required
                        />
                    </div>
                    
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_city">City *</label>
                        <input
                            type="text"
                            id="customer_city"
                            name="customer_city"
                            className="cupdate-input"
                            value={formData.customer_city}
                            onChange={handleChange}
                            placeholder="Enter your city"
                            required
                        />
                    </div>
                </div>
                
                <div className="cupdate-form-row">
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_state">State *</label>
                        <input
                            type="text"
                            id="customer_state"
                            name="customer_state"
                            className="cupdate-input"
                            value={formData.customer_state}
                            onChange={handleChange}
                            placeholder="Enter your state"
                            required
                        />
                    </div>
                    
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_pincode">Pincode *</label>
                        <input
                            type="text"
                            id="customer_pincode"
                            name="customer_pincode"
                            className="cupdate-input"
                            value={formData.customer_pincode}
                            onChange={handleChange}
                            placeholder="Enter your pincode"
                            required
                        />
                    </div>
                </div>
                
                <div className="cupdate-form-row">
                    <div className="cupdate-field">
                        <label className="cupdate-label" htmlFor="customer_country">Country *</label>
                        <input
                            type="text"
                            id="customer_country"
                            name="customer_country"
                            className="cupdate-input"
                            value={formData.customer_country}
                            onChange={handleChange}
                            placeholder="Enter your country"
                            required
                        />
                    </div>
                    <div className="cupdate-field empty-field"></div>
                </div>
                
                <button 
                    type="submit" 
                    className="cupdate-button"
                    disabled={submitting}
                >
                    {submitting ? 'Saving...' : 'Save Changes'}
                </button>
            </form>
        </div>
    );
}

export default CUpdate;

