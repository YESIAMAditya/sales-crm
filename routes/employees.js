// routes/employees.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Employee = require('../models/Employee');
const Admin = require('../models/Admin');

// ====================== CONFIG ======================
const JWT_SECRET = process.env.JWT_SECRET || 'MY_SUPER_SECRET_KEY_12345'; // .env mein daal do

// ====================== CREATE EMPLOYEE ======================
router.post('/add', async (req, res) => {
    try {
        const { adminId, name, email, password } = req.body;

        if (!adminId || !name || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!mongoose.Types.ObjectId.isValid(adminId)) {
            return res.status(400).json({ success: false, message: 'Invalid Admin ID' });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        if (admin.isBlocked) {
            return res.status(403).json({ success: false, message: 'Your admin account is suspended' });
        }

        // Employee Limit Check
        const currentCount = await Employee.countDocuments({ adminId });
        if (currentCount >= admin.employeeLimit) {
            return res.status(400).json({ 
                success: false, 
                message: `Employee limit reached (${admin.employeeLimit}). Contact Super Admin.` 
            });
        }

        // Email uniqueness
        const existingEmp = await Employee.findOne({ email: email.toLowerCase() });
        if (existingEmp) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newEmployee = await Employee.create({
            adminId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            status: 'Active'
        });

        res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: { id: newEmployee._id, name: newEmployee.name, email: newEmployee.email }
        });

    } catch (error) {
        console.error("Employee Add Error:", error);
        res.status(500).json({ success: false, message: 'Server error while creating employee' });
    }
});

// ====================== GET ALL EMPLOYEES (ADMIN) ======================
router.get('/all/:adminId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.adminId)) {
            return res.status(400).json({ success: false, message: 'Invalid Admin ID' });
        }

        const employees = await Employee.find({ adminId: req.params.adminId })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json(employees);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching employees' });
    }
});

// ====================== EMPLOYEE LOGIN ======================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const employee = await Employee.findOne({ email: email.toLowerCase() });
        if (!employee) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        if (employee.status === 'Suspended') {
            return res.status(403).json({ success: false, message: 'Account suspended by admin' });
        }

        const isMatch = await bcrypt.compare(password, employee.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: employee._id, role: 'Employee' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Update session
        employee.isOnline = true;
        employee.currentSessionToken = token;
        await employee.save();

        res.json({
            success: true,
            token,
            employee: {
                id: employee._id,
                name: employee.name,
                email: employee.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ====================== EMPLOYEE LOGOUT ======================
router.post('/logout', async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
            await Employee.findByIdAndUpdate(employeeId, {
                isOnline: false,
                currentSessionToken: null
            });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Logout error' });
    }
});

// ====================== UPDATE PASSWORD ======================
router.put('/update-password/:empId', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await Employee.findByIdAndUpdate(req.params.empId, { password: hashedPassword });

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating password' });
    }
});

// ====================== TOGGLE STATUS ======================
router.put('/toggle-status/:empId', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Active', 'Suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        await Employee.findByIdAndUpdate(req.params.empId, { status });
        res.json({ success: true, message: `Employee status changed to ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating status' });
    }
});

// ====================== DELETE EMPLOYEE ======================
router.delete('/delete/:empId', async (req, res) => {
    try {
        await Employee.findByIdAndDelete(req.params.empId);
        res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting employee' });
    }
});

module.exports = router;