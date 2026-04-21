function sendValidationError(res, message) {
  return res.status(400).json({
    success: false,
    error: message
  });
}

function validateLogin(req, res, next) {
  const { employeeId, employee_id, id, password } = req.body;
  const userId = employeeId || employee_id || id;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return sendValidationError(res, 'employeeId is required');
  }

  if (!password || typeof password !== 'string' || password.length < 3) {
    return sendValidationError(res, 'password is required');
  }

  next();
}

function validateCreateOrder(req, res, next) {
  const { tableNumber, items, notes } = req.body;

  if (!Number.isInteger(Number(tableNumber)) || Number(tableNumber) <= 0) {
    return sendValidationError(res, 'tableNumber must be a positive number');
  }

  if (!Array.isArray(items) || items.length === 0) {
    return sendValidationError(res, 'items must be a non-empty array');
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return sendValidationError(res, 'each item must be an object');
    }

    if (!item.id || !item.name) {
      return sendValidationError(res, 'each item must include id and name');
    }

    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) {
      return sendValidationError(res, 'each item qty must be greater than 0');
    }

    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
      return sendValidationError(res, 'each item unitPrice must be 0 or greater');
    }
  }

  if (notes !== undefined && typeof notes !== 'string') {
    return sendValidationError(res, 'notes must be a string');
  }

  next();
}

function validateOrderStatus(req, res, next) {
  const allowedStatuses = [
    'new',
    'prep',
    'ready',
    'dispatched',
    'delivering',
    'delivered',
    'cancelled'
  ];

  if (!allowedStatuses.includes(req.body.status)) {
    return sendValidationError(res, 'Invalid status');
  }

  next();
}

module.exports = {
  validateLogin,
  validateCreateOrder,
  validateOrderStatus
};