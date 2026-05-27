// models/LeadStatus.js
const mongoose = require('mongoose');

const LeadStatusSchema = new mongoose.Schema({
    employeeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Employee', 
        required: true 
    },
    documentId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Document', 
        required: true 
    },
    customerName: { 
        type: String, 
        required: true,
        trim: true
    },
    customerPhone: { 
        type: String, 
        required: true,
        trim: true
    },
    status: { 
        type: String, 
        enum: ['New', 'Ringing', 'Interested', 'Follow-up', 'Rejected'], 
        default: 'New' 
    },
    remarks: { 
        type: String, 
        default: '',
        trim: true
    }
}, {
    timestamps: true   // Automatically adds createdAt & updatedAt
});

// ==================== IMPORTANT INDEXES ====================
// For fast querying in employee dashboard and admin reports
LeadStatusSchema.index({ employeeId: 1, documentId: 1 });
LeadStatusSchema.index({ employeeId: 1, status: 1 });
LeadStatusSchema.index({ customerPhone: 1, documentId: 1 });

// Compound unique index to prevent duplicate leads for same employee + document + phone
LeadStatusSchema.index(
    { employeeId: 1, documentId: 1, customerPhone: 1 }, 
    { unique: true }
);

module.exports = mongoose.model('LeadStatus', LeadStatusSchema);