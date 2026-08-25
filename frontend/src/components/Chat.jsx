import React, { useState, useEffect } from 'react';
import '../styles/Chat.css';

function Chat({ onClose, onVoiceOpen, onTextOpen }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    shopName: '',
    shopId: '',
    city: '',
    state: '',
    country: '',
    productType: '',
    globalChat: true,
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cities, setCities] = useState([]);
  const [states, setStates] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL;

        const [citiesRes, statesRes, countriesRes] = await Promise.all([
          fetch(`${backendUrl}/api/locations/cities`),
          fetch(`${backendUrl}/api/locations/states`),
          fetch(`${backendUrl}/api/locations/countries`)
        ]);

        const citiesData = await citiesRes.json();
        const statesData = await statesRes.json();
        const countriesData = await countriesRes.json();

        if (citiesData.success) setCities([...citiesData.data]);
        if (statesData.success) setStates([...statesData.data]);
        if (countriesData.success) setCountries([...countriesData.data]);
      } catch (error) {
        console.error('Error fetching dropdown options:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDropdownOptions();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async (portalType = 'chat') => {
    setIsSubmitted(true);

    try {
      let session_id = localStorage.getItem('session_id');
      if (!session_id) {
        session_id = crypto.randomUUID();
        localStorage.setItem('session_id', session_id);
      }

      const response = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/start-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': session_id,
        },
        body: JSON.stringify({
          session_id,
          formData: {
            ...formData,
            globalChat: true,
            mode: 'global',
          },
          portalType,
        }),
      });

      const data = await response.json();

      if (!data.message) {
        console.error('Failed to start a chat');
        return;
      }

      if (data.session_id) {
        localStorage.setItem('session_id', data.session_id);
      }

      if (portalType === 'voice' && onVoiceOpen) {
        onVoiceOpen();
      } else if (portalType === 'chat' && onTextOpen) {
        onTextOpen();
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Error starting chat:', err);
    }
  };

  const isStepValid = () => {
    return formData.city !== '' && formData.state !== '' && formData.country !== '';
  };

  const resetForm = () => {
    setFormData({
      shopName: '',
      shopId: '',
      city: '',
      state: '',
      country: '',
      productType: '',
      globalChat: true,
    });
    setCurrentStep(1);
    setIsSubmitted(false);
  };

  const renderProgressDots = () => (
    <div className="chat-progress">
      {[1, 2].map(step => (
        <div
          key={step}
          className={`chat-progress-dot ${step === currentStep ? 'active' : ''} ${step < currentStep ? 'completed' : ''}`}
        />
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 1 of 2</div>
      <h2 className="chat-question-title">Where are you looking from?</h2>
      {loading ? (
        <div className="chat-loading">Loading locations...</div>
      ) : (
        <div className="chat-location-inputs">
          <select
            className="chat-input chat-select"
            value={formData.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            autoFocus
          >
            <option value="">Select City</option>
            {cities.map((city, index) => (
              <option key={`${city}-${index}`} value={city}>{city}</option>
            ))}
          </select>

          <div className="chat-location-row">
            <select
              className="chat-input chat-select"
              value={formData.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
            >
              <option value="">Select State</option>
              {states.map((state, index) => (
                <option key={`${state}-${index}`} value={state}>{state}</option>
              ))}
            </select>

            <select
              className="chat-input chat-select"
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
            >
              <option value="">Select Country</option>
              {countries.map((country, index) => (
                <option key={`${country}-${index}`} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 2 of 2</div>
      <h2 className="chat-question-title">Open the global marketplace portal</h2>

      <div className="chat-summary">
        <div className="chat-summary-grid">
          <div className="chat-summary-item">
            <div className="chat-summary-label">City</div>
            <div className="chat-summary-value">{formData.city}</div>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">State</div>
            <div className="chat-summary-value">{formData.state}</div>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">Country</div>
            <div className="chat-summary-value">{formData.country}</div>
          </div>
        </div>

        <div className="chat-nav-buttons">
          <button className="chat-btn chat-btn-search" onClick={() => handleSubmit('chat')}>
            Open Chat
          </button>
          <button className="chat-btn chat-btn-next" onClick={() => handleSubmit('voice')}>
            Open Voice
          </button>
        </div>
      </div>
    </div>
  );

  const renderNavigation = () => {
    if (isSubmitted) {
      return (
        <div className="chat-nav-buttons">
          <button className="chat-btn chat-btn-back" onClick={resetForm}>
            🔄 New Search
          </button>
          <button className="chat-btn chat-btn-next" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      );
    }

    return (
      <div className="chat-nav-buttons">
        {currentStep > 1 ? (
          <button className="chat-btn chat-btn-back" onClick={handleBack}>
            ← Back
          </button>
        ) : (
          <div></div>
        )}
        <button
          className="chat-btn chat-btn-next"
          onClick={handleNext}
          disabled={!isStepValid()}
        >
          Next →
        </button>
      </div>
    );
  };

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <button className="chat-modal-close" onClick={onClose}>
          ×
        </button>

        {renderProgressDots()}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {!isSubmitted && renderNavigation()}
      </div>
    </div>
  );
}

export default Chat;

