const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    secretKey: { type: String, default: 'admin123' }, // Recovery ke liye
    
    // 🔥 SUPER ADMIN CONTROLS FIELDS
    employeeLimit: { type: Number, default: 5 }, // Default limit 5 employees
    isBlocked: { type: Boolean, default: false }, // Account band/chalu karne ke liye
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Admin', adminSchema);