// models/Document.js
const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },

    // For single employee assignment
    // For split documents, this will be null
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },

    fileName: {
        type: String,
        required: true,
        trim: true
    },

    filePath: {
        type: String,
        required: true
    },

    isSplit: {
        type: Boolean,
        default: false
    },

    totalLeads: {
        type: Number,
        default: 0
    },

    // Optional: To track if document is archived or active
    status: {
        type: String,
        enum: ['Active', 'Archived'],
        default: 'Active'
    }

}, {
    timestamps: true   // Automatically adds createdAt & updatedAt
});

// Indexes for better performance
DocumentSchema.index({ adminId: 1 });
DocumentSchema.index({ employeeId: 1 });
DocumentSchema.index({ isSplit: 1 });

module.exports = mongoose.model('Document', DocumentSchema);