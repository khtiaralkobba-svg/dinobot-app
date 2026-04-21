const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      employeeId: user.employee_id,
      role: user.role,
      fullName: user.full_name,
      station: user.station
    },
    appConfig.jwt.secret,
    { expiresIn: appConfig.jwt.expiresIn }
  );
}

module.exports = { createAccessToken };