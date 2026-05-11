const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "layover-secret-123";
const users = []; // Simulated database

async function signup(email, password) {
  if (users.find(u => u.email === email)) {
    throw new Error("User already exists.");
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: users.length + 1, email, password: hashedPassword, savedPlans: [] };
  users.push(user);
  return generateToken(user);
}

async function login(email, password) {
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error("Invalid credentials.");
  }
  return generateToken(user);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { signup, login, verifyToken, users };
