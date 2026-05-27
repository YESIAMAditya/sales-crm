const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');

const Document = require('../models/Document');
const LeadStatus = require('../models/LeadStatus');

// Multer Storage Configuration
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// =======================================================
// 1. UPLOAD + SPLIT + ASSIGN (REFACTORED)
// =======================================================
router.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        const { adminId, employeeId, selectedEmployees } = req.body;
        const employees = selectedEmployees ? JSON.parse(selectedEmployees) : [];

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        if (!mongoose.Types.ObjectId.isValid(adminId)) return res.status(400).json({ success: false, message: 'Invalid Admin ID' });

        const workbook = xlsx.readFile(req.file.path);
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        // SPLIT MODE
        if (employeeId === "SPLIT_EQUALLY" && employees.length > 0) {
            const chunkSize = Math.ceil(sheetData.length / employees.length);

            for (let i = 0; i < employees.length; i++) {
                const empId = new mongoose.Types.ObjectId(employees[i]);
                const chunk = sheetData.slice(i * chunkSize, (i + 1) * chunkSize);

                if (chunk.length === 0) continue;

                const newDoc = await Document.create({
                    adminId,
                    employeeId: empId,
                    fileName: `Part_${i + 1}_${req.file.originalname}`,
                    filePath: `/uploads/${req.file.filename}`
                });

                const leads = chunk.map(lead => ({
                    documentId: newDoc._id,
                    employeeId: empId,
                    customerName: lead.Name || lead.CustomerName || "N/A",
                    customerPhone: String(lead.Phone || lead.Mobile || ""),
                    status: 'New'
                }));
                await LeadStatus.insertMany(leads);
            }
        } 
        // SINGLE MODE
        else {
            const newDoc = await Document.create({ adminId, employeeId, fileName: req.file.originalname, filePath: `/uploads/${req.file.filename}` });
            const leads = sheetData.map(lead => ({
                documentId: newDoc._id,
                employeeId: new mongoose.Types.ObjectId(employeeId),
                customerName: lead.Name || "N/A",
                customerPhone: String(lead.Phone || ""),
                status: 'New'
            }));
            await LeadStatus.insertMany(leads);
        }

        // Cleanup: Delete master file after processing
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.status(201).json({ success: true, message: 'File processed and assigned successfully' });
    } catch (error) {
        console.error("UPLOAD ERROR:", error);
        res.status(500).json({ success: false, message: 'Server error during upload' });
    }
});

// =======================================================
// OTHER ENDPOINTS (CLEANED)
// =======================================================

router.get('/admin-files/:adminId', async (req, res) => {
    try {
        const docs = await Document.find({ adminId: req.params.adminId }).populate('employeeId', 'name email').sort({ createdAt: -1 });
        res.json(docs);
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

router.get('/my-leads/:employeeId', async (req, res) => {
    try {
        const leads = await LeadStatus.find({ employeeId: req.params.employeeId }).populate('documentId', 'fileName');
        res.json(leads);
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

router.post('/update-status', async (req, res) => {
    try {
        const { employeeId, documentId, customerPhone, status, remarks, customerName } = req.body;
        const updated = await LeadStatus.findOneAndUpdate(
            { employeeId, documentId, customerPhone },
            { status, remarks, customerName, updatedAt: Date.now() },
            { new: true, upsert: true }
        );
        res.json({ success: true, lead: updated });
    } catch (err) { res.status(500).json({ message: 'Update failed' }); }
});


// =======================================================
// 5. EMPLOYEE ANALYTICS (OPTIMIZED)
// =======================================================
router.get('/emp-analytics/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid Employee ID' });
        }

        const stats = await LeadStatus.aggregate([
            { $match: { employeeId: new mongoose.Types.ObjectId(employeeId) } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        // Default structure
        const result = {
            "New": 0,
            "Ringing": 0,
            "Interested": 0,
            "Follow-up": 0,
            "Rejected": 0
        };

        // Map results to the default structure
        stats.forEach(item => {
            if (item._id && result.hasOwnProperty(item._id)) {
                result[item._id] = item.count;
            }
        });

        res.json(result);
    } catch (error) {
        console.error("ANALYTICS ERROR:", error);
        res.status(500).json({ message: 'Error fetching analytics' });
    }
});

// =======================================================
// 6. EMPLOYEE HISTORY
// =======================================================
router.get('/my-history/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid Employee ID' });
        }

        // Sirf wahi leads dikhayenge jinka status change hua hai
        const history = await LeadStatus.find({ 
            employeeId: new mongoose.Types.ObjectId(employeeId) 
        })
        .sort({ updatedAt: -1 }); // Naye updates sabse upar

        res.json(history);
    } catch (error) {
        console.error("HISTORY ERROR:", error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// =======================================================
// 7. READ EXCEL FILE (For viewing contents in UI)
// =======================================================
router.get('/read-excel/:documentId', async (req, res) => {
    try {
        const doc = await Document.findById(req.params.documentId);
        if (!doc) return res.status(404).json({ message: 'File not found' });

        // Database se leads uthao
        const savedStatuses = await LeadStatus.find({ documentId: req.params.documentId });

        res.json({
            success: true,
            fileName: doc.fileName,
            savedStatuses
        });
    } catch (error) {
        res.status(500).json({ message: 'Error reading file' });
    }
});

// =======================================================
// 8. ADMIN REPORTS (For complete tracking)
// =======================================================
router.get('/admin-reports/:adminId', async (req, res) => {
    try {
        // Admin ke saare documents nikalo
        const adminDocs = await Document.find({ adminId: req.params.adminId }).select('_id');
        const docIds = adminDocs.map(d => d._id);

        if (docIds.length === 0) return res.json([]);

        // Saare leads nikalo jo in documents se linked hain
        const reports = await LeadStatus.find({ documentId: { $in: docIds } })
            .populate('employeeId', 'name email')
            .populate('documentId', 'fileName')
            .sort({ updatedAt: -1 });

        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reports' });
    }
});
module.exports = router;