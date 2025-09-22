// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

exports.verifyToken = (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = jwt.verify(token, JWT_SECRET); // { id, email, role, ... }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

exports.allowRoles = (...roles) => (req, res, next) => {
  const role = req.user?.role;
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};
