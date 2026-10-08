window.AureumLeadValidation = {
  required: ['full_name', 'phone', 'interested_in'],
  validate(values) {
    const errors = {};
    if (!String(values.full_name || '').trim()) errors.full_name = 'Customer name is required.';
    if (!String(values.phone || '').trim()) errors.phone = 'Phone number is required.';
    if (!String(values.interested_in || '').trim()) errors.interested_in = 'Property interest is required.';
    if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(values.email))) errors.email = 'Enter a valid email address.';
    return { valid: Object.keys(errors).length === 0, errors };
  }
};
