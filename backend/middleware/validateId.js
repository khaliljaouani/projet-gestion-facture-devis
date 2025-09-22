// backend/middleware/validateId.js
module.exports = function validateIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Paramètre id invalide' });
  }
  req.params.id = id;
  next();
};
