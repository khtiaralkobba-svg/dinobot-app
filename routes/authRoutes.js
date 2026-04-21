const express = require('express');
const router = express.Router();

const { login, logout, me, registerStaff, getStaff, updateStaffStatus, deleteStaff } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const { validateLogin } = require('../middleware/validate');

router.post('/login', validateLogin, login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, me);

// Staff management — manager only
router.post('/register',          authenticateToken, authorizeRoles('manager'), registerStaff);
router.get('/staff',              authenticateToken, authorizeRoles('manager'), getStaff);
router.patch('/staff/:id/status', authenticateToken, authorizeRoles('manager'), updateStaffStatus);
router.delete('/staff/:id',       authenticateToken, authorizeRoles('manager'), deleteStaff);

module.exports = router;