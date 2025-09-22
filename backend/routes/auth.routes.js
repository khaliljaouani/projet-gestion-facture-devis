const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');

// ⚠️ PAS de /api/auth ici
router.post('/register', authController.register);
router.post('/login', authController.login);

router.get('/me', verifyToken, (req, res) => res.json({ user: req.user }));
router.get('/users', verifyToken, allowRoles('admin'), authController.getAll);

module.exports = router;
