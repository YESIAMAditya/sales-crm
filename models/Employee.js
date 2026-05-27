// models/Employee.js
const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' }, // Access control
    
    // 🔒 SECURITY & LIVE STATUS UPDATES
    isOnline: { type: Boolean, default: false }, // Live dashboard par green/red dot ke liye
    currentSessionToken: { type: String, default: null }, // Anti-cheat device device lock ke liye
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Employee', EmployeeSchema);