// models/Document.js
const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    adminId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Admin', 
        required: true 
    },
    // FIXED: Ab isme ObjectId aur Split Equally string dono bina crash hue store honge
    employeeId: { 
        type: mongoose.Schema.Types.Mixed, 
        ref: 'Employee', 
        required: true 
    }, 
    fileName: { 
        type: String, 
        required: true 
    }, 
    filePath: { 
        type: String, 
        required: true 
    }, 
    uploadedAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Document', DocumentSchema);