// routes/documents.js

const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');

const Document = require('../models/Document');
const LeadStatus = require('../models/LeadStatus');

// =======================================================
// MULTER STORAGE
// =======================================================

const storage = multer.diskStorage({
    destination: './public/uploads/',

    filename: function (req, file, cb) {

        const uniqueName =
            file.fieldname +
            '-' +
            Date.now() +
            '-' +
            Math.random().toString(36).substring(2, 8) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// =======================================================
// 1. UPLOAD + SPLIT + ASSIGN
// =======================================================

router.post('/upload', upload.single('myFile'), async (req, res) => {

    try {

        const { adminId, employeeId } = req.body;

        // -----------------------------------------------
        // VALIDATE FILE
        // -----------------------------------------------

        if (!req.file) {
            return res.status(400).json({
                message: 'Please upload an excel file'
            });
        }

        // -----------------------------------------------
        // VALIDATE ADMIN
        // -----------------------------------------------

        if (!mongoose.Types.ObjectId.isValid(adminId)) {

            return res.status(400).json({
                message: 'Invalid Admin ID'
            });
        }

        const validAdminId =
            new mongoose.Types.ObjectId(adminId);

        // -----------------------------------------------
        // PARSE SELECTED EMPLOYEES
        // -----------------------------------------------

        let selectedEmployees = [];

        if (req.body.selectedEmployees) {

            try {

                selectedEmployees =
                    JSON.parse(req.body.selectedEmployees);

            } catch (err) {

                selectedEmployees =
                    req.body.selectedEmployees;
            }
        }

        const originalFilePath = req.file.path;

        const ext =
            path.extname(req.file.originalname);

        // ===================================================
        // SPLIT EQUALLY MODE
        // ===================================================

        if (
            employeeId === "SPLIT_EQUALLY" &&
            Array.isArray(selectedEmployees) &&
            selectedEmployees.length > 0
        ) {

            // -----------------------------------------------
            // READ EXCEL FILE
            // -----------------------------------------------

            const workbook =
                xlsx.readFile(originalFilePath);

            const sheetName =
                workbook.SheetNames[0];

            const worksheet =
                workbook.Sheets[sheetName];

            const sheetData =
                xlsx.utils.sheet_to_json(worksheet);

            // -----------------------------------------------
            // EMPTY FILE CHECK
            // -----------------------------------------------

            if (!sheetData || sheetData.length === 0) {

                return res.status(400).json({
                    message: 'Excel file is empty'
                });
            }

            // -----------------------------------------------
            // SPLIT LOGIC
            // -----------------------------------------------

            const totalRows =
                sheetData.length;

            const totalEmployees =
                selectedEmployees.length;

            const baseChunkSize =
                Math.floor(totalRows / totalEmployees);

            const extraRows =
                totalRows % totalEmployees;

            let currentIndex = 0;

            const createdDocs = [];

            // -----------------------------------------------
            // LOOP THROUGH EMPLOYEES
            // -----------------------------------------------

            for (let i = 0; i < totalEmployees; i++) {

                const empId =
                    selectedEmployees[i];

                // INVALID ID SKIP
                if (!mongoose.Types.ObjectId.isValid(empId)) {
                    continue;
                }

                // PERFECT BALANCED SPLIT
                const currentChunkSize =
                    baseChunkSize +
                    (i < extraRows ? 1 : 0);

                const empChunkData =
                    sheetData.slice(
                        currentIndex,
                        currentIndex + currentChunkSize
                    );

                currentIndex += currentChunkSize;

                // SKIP EMPTY
                if (empChunkData.length === 0) {
                    continue;
                }

                // -------------------------------------------
                // CREATE NEW EXCEL FILE
                // -------------------------------------------

                const newWorksheet =
                    xlsx.utils.json_to_sheet(empChunkData);

                const newWorkbook =
                    xlsx.utils.book_new();

                xlsx.utils.book_append_sheet(
                    newWorkbook,
                    newWorksheet,
                    sheetName
                );

                // -------------------------------------------
                // UNIQUE FILE NAME
                // -------------------------------------------

                const uniqueChunkName =
                    `split-${i}-${Date.now()}-${Math.random()
                        .toString(36)
                        .substring(2, 8)}${ext}`;

                const chunkFilePath =
                    path.join(
                        './public/uploads/',
                        uniqueChunkName
                    );

                // SAVE PHYSICAL FILE
                xlsx.writeFile(
                    newWorkbook,
                    chunkFilePath
                );

                // -------------------------------------------
                // SAVE DOCUMENT ENTRY
                // -------------------------------------------

                const splitDoc =
                    new Document({

                        adminId: validAdminId,

                        employeeId:
                            new mongoose.Types.ObjectId(empId),

                        fileName:
                            `${i + 1}_Part_${req.file.originalname}`,

                        filePath:
                            `/uploads/${uniqueChunkName}`
                    });

                const savedDoc =
                    await splitDoc.save();

                createdDocs.push(savedDoc);
            }

            // -----------------------------------------------
            // DELETE ORIGINAL FILE
            // -----------------------------------------------

            try {

                if (fs.existsSync(originalFilePath)) {

                    fs.unlinkSync(originalFilePath);
                }

            } catch (deleteError) {

                console.log(
                    "Original file delete error:",
                    deleteError
                );
            }

            // -----------------------------------------------
            // SUCCESS RESPONSE
            // -----------------------------------------------

            return res.status(201).json({

                success: true,

                message:
                    `Excel split successfully among ${createdDocs.length} employees`,

                totalRows,

                totalEmployees,

                filesCreated:
                    createdDocs.length
            });
        }

        // ===================================================
        // SINGLE EMPLOYEE MODE
        // ===================================================

        else {

            if (!mongoose.Types.ObjectId.isValid(employeeId)) {

                return res.status(400).json({
                    message: 'Invalid Employee ID'
                });
            }

            const validEmployeeId =
                new mongoose.Types.ObjectId(employeeId);

            const newDoc =
                new Document({

                    adminId: validAdminId,

                    employeeId:
                        validEmployeeId,

                    fileName:
                        req.file.originalname,

                    filePath:
                        `/uploads/${req.file.filename}`
                });

            await newDoc.save();

            return res.status(201).json({

                success: true,

                message:
                    'Document uploaded successfully'
            });
        }

    } catch (error) {

        console.error(
            "UPLOAD ROUTE ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                'Server Error in upload route'
        });
    }
});

// =======================================================
// 2. ADMIN FILES
// =======================================================

router.get('/admin-files/:adminId', async (req, res) => {

    try {

        let adminQueryId =
            req.params.adminId;

        if (
            mongoose.Types.ObjectId.isValid(adminQueryId)
        ) {

            adminQueryId =
                new mongoose.Types.ObjectId(adminQueryId);
        }

        const docs =
            await Document.find({
                adminId: adminQueryId
            })
                .populate(
                    'employeeId',
                    'name email'
                )
                .sort({ uploadedAt: -1 });

        res.json(docs);

    } catch (error) {

        res.status(500).json({
            message: 'Error fetching files'
        });
    }
});

// =======================================================
// 3. EMPLOYEE FILES
// =======================================================

router.get('/my-files/:employeeId', async (req, res) => {

    try {

        const empId =
            req.params.employeeId;

        if (
            !mongoose.Types.ObjectId.isValid(empId)
        ) {

            return res.status(400).json({
                message: 'Invalid Employee ID'
            });
        }

        const queryId =
            new mongoose.Types.ObjectId(empId);

        const docs =
            await Document.find({
                employeeId: queryId
            }).sort({ uploadedAt: -1 });

        res.json(docs);

    } catch (error) {

        console.error(
            "MY FILES ERROR:",
            error
        );

        res.status(500).json({
            message:
                'Error fetching employee files'
        });
    }
});

// =======================================================
// 4. UPDATE LEAD STATUS
// =======================================================

router.post('/update-status', async (req, res) => {

    try {

        const {
            employeeId,
            documentId,
            customerName,
            customerPhone,
            status,
            remarks
        } = req.body;

        if (
            !mongoose.Types.ObjectId.isValid(employeeId)
        ) {

            return res.status(400).json({
                message: 'Invalid Employee ID'
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(documentId)
        ) {

            return res.status(400).json({
                message: 'Invalid Document ID'
            });
        }

        const updatedLead =
            await LeadStatus.findOneAndUpdate(

                {
                    employeeId:
                        new mongoose.Types.ObjectId(employeeId),

                    documentId:
                        new mongoose.Types.ObjectId(documentId),

                    customerPhone:
                        String(customerPhone).trim()
                },

                {
                    customerName,
                    status,
                    remarks,
                    updatedAt: Date.now()
                },

                {
                    new: true,
                    upsert: true
                }
            );

        res.json({

            success: true,

            message:
                'Lead status updated successfully',

            lead: updatedLead
        });

    } catch (error) {

        console.error(
            "STATUS UPDATE ERROR:",
            error
        );

        res.status(500).json({
            message:
                'Server error while updating status'
        });
    }
});

// =======================================================
// 5. EMPLOYEE ANALYTICS
// =======================================================

router.get('/emp-analytics/:employeeId', async (req, res) => {

    try {

        const employeeId =
            req.params.employeeId;

        if (
            !mongoose.Types.ObjectId.isValid(employeeId)
        ) {

            return res.status(400).json({
                message: 'Invalid Employee ID'
            });
        }

        const stats =
            await LeadStatus.aggregate([

                {
                    $match: {
                        employeeId:
                            new mongoose.Types.ObjectId(employeeId)
                    }
                },

                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);

        const result = {

            New: 0,
            Ringing: 0,
            Interested: 0,
            "Follow-up": 0,
            Rejected: 0
        };

        stats.forEach(item => {

            if (item._id) {

                result[item._id] =
                    item.count;
            }
        });

        res.json(result);

    } catch (error) {

        res.status(500).json({
            message:
                'Error fetching analytics'
        });
    }
});

// =======================================================
// 6. EMPLOYEE HISTORY
// =======================================================

router.get('/my-history/:employeeId', async (req, res) => {

    try {

        const employeeId =
            req.params.employeeId;

        if (
            !mongoose.Types.ObjectId.isValid(employeeId)
        ) {

            return res.status(400).json({
                message: 'Invalid Employee ID'
            });
        }

        const history =
            await LeadStatus.find({

                employeeId:
                    new mongoose.Types.ObjectId(employeeId)

            }).sort({ updatedAt: -1 });

        res.json(history);

    } catch (error) {

        res.status(500).json({
            message:
                'Error fetching history'
        });
    }
});

// =======================================================
// 7. READ EXCEL FILE
// =======================================================

router.get('/read-excel/:documentId', async (req, res) => {

    try {

        const documentId =
            req.params.documentId;

        if (
            !mongoose.Types.ObjectId.isValid(documentId)
        ) {

            return res.status(400).json({
                message: 'Invalid Document ID'
            });
        }

        const doc =
            await Document.findById(documentId);

        if (!doc) {

            return res.status(404).json({
                message: 'File not found'
            });
        }

        let filePath =
            path.join(
                __dirname,
                '../public',
                doc.filePath
            );

        if (!fs.existsSync(filePath)) {

            filePath =
                path.join(
                    process.cwd(),
                    'public',
                    doc.filePath
                );
        }

        if (!fs.existsSync(filePath)) {

            return res.status(404).json({
                message:
                    'Physical excel file missing'
            });
        }

        const workbook =
            xlsx.readFile(filePath);

        const sheetName =
            workbook.SheetNames[0];

        const sheetData =
            xlsx.utils.sheet_to_json(
                workbook.Sheets[sheetName]
            );

        const savedStatuses =
            await LeadStatus.find({

                documentId:
                    new mongoose.Types.ObjectId(documentId)
            });

        res.json({

            success: true,

            totalRows:
                sheetData.length,

            fileData:
                sheetData,

            savedStatuses
        });

    } catch (error) {

        console.error(
            "READ EXCEL ERROR:",
            error
        );

        res.status(500).json({
            message:
                'Error reading excel file'
        });
    }
});

// =======================================================
// 8. ADMIN REPORTS
// =======================================================

router.get('/admin-reports/:adminId', async (req, res) => {

    try {

        const adminId =
            req.params.adminId;

        let queryConditions = [
            { adminId }
        ];

        if (
            mongoose.Types.ObjectId.isValid(adminId)
        ) {

            queryConditions.push({
                adminId:
                    new mongoose.Types.ObjectId(adminId)
            });
        }

        const adminDocs =
            await Document.find({
                $or: queryConditions
            }).select('_id');

        const docIds =
            adminDocs.map(d => d._id);

        if (docIds.length === 0) {

            return res.json([]);
        }

        const reports =
            await LeadStatus.find({

                documentId:
                    { $in: docIds }

            })

                .populate(
                    'employeeId',
                    'name email'
                )

                .populate(
                    'documentId',
                    'fileName'
                )

                .sort({ updatedAt: -1 });

        res.json(reports);

    } catch (error) {

        console.error(
            "ADMIN REPORT ERROR:",
            error
        );

        res.status(500).json({
            message:
                'Error fetching reports'
        });
    }
});

module.exports = router;