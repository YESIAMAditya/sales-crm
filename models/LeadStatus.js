// models/LeadStatus.js
const mongoose = require('mongoose');

const LeadStatusSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['New', 'Ringing', 'Interested', 'Follow-up', 'Rejected'], 
        default: 'New' 
    },
    remarks: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LeadStatus', LeadStatusSchema);