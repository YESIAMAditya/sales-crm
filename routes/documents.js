const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');

const Document = require('../models/Document');
const LeadStatus = require('../models/LeadStatus');

// Multer Setup
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.xlsx', '.xls', '.csv'];
        if (allowed.some(ext => file.originalname.toLowerCase().endsWith(ext))) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel and CSV files are allowed'), false);
        }
    }
});

// =======================================================
// 1. UPLOAD + SMART SPLIT
// =======================================================
router.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        const { adminId, employeeId, selectedEmployees } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        if (!mongoose.Types.ObjectId.isValid(adminId)) return res.status(400).json({ success: false, message: 'Invalid Admin ID' });

        const workbook = xlsx.readFile(req.file.path);
        let sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        if (sheetData.length === 0) {
            return res.status(400).json({ success: false, message: 'File is empty' });
        }

        // Normalize Data
        sheetData = sheetData.map(row => ({
            customerName: row.Name || row.CustomerName || row['Full Name'] || row['Student Name'] || 'N/A',
            customerPhone: String(row.Phone || row.Mobile || row.Contact || row['Phone Number'] || '').trim()
        })).filter(row => row.customerPhone && row.customerPhone.length >= 8);

        let assignedLeads = [];

        // ==================== SPLIT MODE ====================
        if (employeeId === "SPLIT_EQUALLY" && selectedEmployees) {
            let employees = JSON.parse(selectedEmployees);

            if (!Array.isArray(employees) || employees.length === 0) {
                return res.status(400).json({ success: false, message: 'No employees selected' });
            }

            // Round-Robin Distribution
            for (let i = 0; i < sheetData.length; i++) {
                const empIndex = i % employees.length;
                assignedLeads.push({
                    documentId: null,
                    employeeId: new mongoose.Types.ObjectId(employees[empIndex]),
                    customerName: sheetData[i].customerName,
                    customerPhone: sheetData[i].customerPhone,
                    status: 'New',
                    remarks: ''
                });
            }

            const masterDoc = await Document.create({
                adminId,
                employeeId: null,
                fileName: req.file.originalname,
                filePath: `/uploads/${req.file.filename}`,
                isSplit: true,
                totalLeads: sheetData.length
            });

            assignedLeads = assignedLeads.map(lead => ({ ...lead, documentId: masterDoc._id }));

        } 
        // ==================== SINGLE EMPLOYEE ====================
        else {
            if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
                return res.status(400).json({ success: false, message: 'Valid Employee ID required' });
            }

            const newDoc = await Document.create({
                adminId,
                employeeId: new mongoose.Types.ObjectId(employeeId),
                fileName: req.file.originalname,
                filePath: `/uploads/${req.file.filename}`,
                isSplit: false
            });

            assignedLeads = sheetData.map(lead => ({
                documentId: newDoc._id,
                employeeId: new mongoose.Types.ObjectId(employeeId),
                customerName: lead.customerName,
                customerPhone: lead.customerPhone,
                status: 'New',
                remarks: ''
            }));
        }

        if (assignedLeads.length > 0) {
            await LeadStatus.insertMany(assignedLeads);
        }

        res.status(201).json({ 
            success: true, 
            message: `${assignedLeads.length} leads assigned successfully`,
            totalLeads: assignedLeads.length 
        });

    } catch (error) {
        console.error("UPLOAD ERROR:", error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
});

// =======================================================
// READ EXCEL (For Employee Dashboard)
// =======================================================
router.get('/read-excel/:documentId', async (req, res) => {
    try {
        const leads = await LeadStatus.find({ 
            documentId: req.params.documentId 
        }).populate('documentId', 'fileName');

        res.json({
            success: true,
            savedStatuses: leads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error reading document' });
    }
});

// =======================================================
// UPDATE LEAD STATUS
// =======================================================
router.post('/update-status', async (req, res) => {
    try {
        const { employeeId, documentId, customerPhone, status, remarks, customerName } = req.body;

        if (!employeeId || !documentId || !customerPhone) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const updated = await LeadStatus.findOneAndUpdate(
            { 
                employeeId: new mongoose.Types.ObjectId(employeeId),
                documentId: new mongoose.Types.ObjectId(documentId),
                customerPhone: customerPhone 
            },
            { 
                status, 
                remarks, 
                customerName,
                updatedAt: Date.now() 
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, lead: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});

// =======================================================
// MY LEADS (Employee Dashboard)
// =======================================================
router.get('/my-leads/:employeeId', async (req, res) => {
    try {
        const leads = await LeadStatus.find({ 
            employeeId: req.params.employeeId 
        }).populate('documentId', 'fileName isSplit');

        res.json(leads);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching leads' });
    }
});

// =======================================================
// ADMIN REPORTS
// =======================================================
router.get('/admin-reports/:adminId', async (req, res) => {
    try {
        const reports = await LeadStatus.find({})
            .populate('employeeId', 'name email')
            .populate('documentId', 'fileName isSplit')
            .sort({ updatedAt: -1 });

        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reports' });
    }
});

module.exports = router;