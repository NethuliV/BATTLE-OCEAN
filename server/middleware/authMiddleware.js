
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please log in to access this page.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid or expired login session.",
      });
    }

    req.userId = userId;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired login session.",
    });
  }
}

module.exports = authMiddleware;
