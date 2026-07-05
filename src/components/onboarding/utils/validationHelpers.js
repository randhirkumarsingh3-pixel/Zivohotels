export const validateBasicInfo = (formData) => {
  const errors = [];
  if (!formData.name?.trim()) errors.push("Property Name is required.");
  if (!formData.type?.trim()) errors.push("Property Type is required.");
  if (!formData.rating?.trim()) errors.push("Star Rating is required.");
  if (!(formData.guestEmail || formData.receptionEmail)?.trim()) errors.push("Email ID is required.");
  if (!(formData.guestMobile || formData.receptionPhone)?.trim()) errors.push("Mobile number is required.");
  return errors;
};

export const validateLocation = (formData) => {
  const errors = [];
  if (!formData.houseNo?.trim()) errors.push("House/Building/Apartment No. is required.");
  if (!formData.area?.trim()) errors.push("Locality/Area/Street/Sector is required.");
  if (!formData.pincode?.trim()) errors.push("Pincode is required.");
  if (!formData.country?.trim()) errors.push("Country is required.");
  if (!formData.state?.trim()) errors.push("State is required.");
  if (!formData.city?.trim()) errors.push("City is required.");
  if (!formData.latitude || isNaN(parseFloat(formData.latitude))) errors.push("Latitude is required and must be a valid number.");
  if (!formData.longitude || isNaN(parseFloat(formData.longitude))) errors.push("Longitude is required and must be a valid number.");
  if (formData.agreeAddress !== true) errors.push("You must agree to the terms and confirm the address.");
  return errors;
};

export const validateRooms = (formData) => {
  const errors = [];
  if (!formData.rooms || formData.rooms.length === 0) {
    errors.push("At least one room type configuration must be added.");
  }
  return errors;
};

export const validatePhotos = (formData) => {
  const errors = [];
  if (!formData.images || formData.images.length === 0) {
    errors.push("Please upload at least one photo of your property.");
  }
  return errors;
};

export const validatePolicies = (formData) => {
  const errors = [];
  if (!formData.checkInTime) errors.push("Check-in time is required.");
  if (!formData.checkOutTime) errors.push("Check-out time is required.");
  return errors;
};

export const validateFinance = (formData) => {
  const errors = [];
  if (!formData.legalName?.trim()) errors.push("Legal Entity Name is required.");
  if (!formData.pan?.trim()) errors.push("PAN Number is required.");
  if (!formData.accountName?.trim()) errors.push("Account Holder Name is required.");
  if (!formData.bankName?.trim()) errors.push("Bank Name is required.");
  if (!formData.accountNumber?.trim()) errors.push("Account Number is required.");
  if (!formData.ifscCode?.trim()) errors.push("IFSC Code is required.");
  if (!formData.commission) errors.push("Platform Commission is required.");
  if (formData.acceptTerms !== true) errors.push("You must accept the terms and conditions to proceed.");
  return errors;
};

export const validateStep = (stepIndex, formData) => {
  let errors = [];
  switch (stepIndex) {
    case 1: errors = validateBasicInfo(formData); break;
    case 2: errors = validateLocation(formData); break;
    case 4: errors = validateRooms(formData); break;
    case 5: errors = validatePhotos(formData); break;
    case 6: errors = validatePolicies(formData); break;
    case 7: errors = validateFinance(formData); break;
    default: break;
  }
  return {
    valid: errors.length === 0,
    errors,
    firstError: errors.length > 0 ? errors[0] : null
  };
};
