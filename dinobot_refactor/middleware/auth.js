const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization token'
    });
  }

  try {
    const decoded = jwt.verify(token, appConfig.jwt.secret);
    req.user = {
      id: decoded.sub,
      employeeId: decoded.employeeId,
      role: decoded.role,
      fullName: decoded.fullName,
      station: decoded.station
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Token expired or invalid'
    });
  }
}

function authenticateTokenOrRobot(req, res, next) {
  // Check robot secret header first
  const robotSecret = req.headers['x-robot-secret'];
  if (robotSecret && robotSecret === appConfig.robot.secret) {
    req.user = { role: 'robot', employeeId: 'UNIT-01' };
    return next();
  }

  // Fall back to normal JWT
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization token'
    });
  }

  try {
    const decoded = jwt.verify(token, appConfig.jwt.secret);
    req.user = {
      id: decoded.sub,
      employeeId: decoded.employeeId,
      role: decoded.role,
      fullName: decoded.fullName,
      station: decoded.station
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Token expired or invalid'
    });
  }
}

module.exports = { authenticateToken, authenticateTokenOrRobot };