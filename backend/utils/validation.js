// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone validation
const isValidPhone = (phone) => {
  const phoneRegex = /^[0-9]{10,15}$/;
  return phoneRegex.test(phone.replace(/[^0-9]/g, ''));
};

// Password validation (min 6 characters)
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

// Pincode validation
const isValidPincode = (pincode) => {
  const pincodeRegex = /^[0-9]{5,10}$/;
  return pincodeRegex.test(pincode);
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidPincode
};
