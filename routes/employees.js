// routes/employees.js (FULLY OPTIMIZED WITH SUPER ADMIN CONTROLS, DEBUGGERS & LIVE SESSION TRACKING)
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // 🔥 ID Validation ke liye import kiya hai
const Employee = require('../models/Employee');
const Admin = require('../models/Admin'); 
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

// 1. ADMIN APNE EMPLOYEE KI ID-PASSWORD GENERATE KAREGA (WITH STRICT LIMIT & BLOCK CHECKS)
router.post('/add', async (req, res) => {
    try {
        const { adminId, name, email, password } = req.body;

        // 📝 TERMINAL LOGS: Testing ke waqt VS Code me dekhne ke liye
        console.log("\n📥 --- Nayi Employee Creation Request Aayi Hai ---");
        console.log("Received AdminID:", adminId);
        console.log("Employee Name:", name);

        if (!adminId) {
            console.log("❌ Filter Block: Request me adminId missing hai!");
            return res.status(400).json({ message: 'Admin ID is missing from frontend request!' });
        }

        let formattedAdminId;
        try {
            formattedAdminId = new mongoose.Types.ObjectId(adminId);
        } catch (idErr) {
            console.log("❌ Filter Block: Admin ID ka format invalid hai!");
            return res.status(400).json({ message: 'Invalid Admin ID Format! Login again.' });
        }

        const adminInfo = await Admin.findById(formattedAdminId);
        if (!adminInfo) {
            console.log("❌ Filter Block: Database me is ID ka koi admin nahi mila.");
            return res.status(444).json({ message: 'Admin Profile Not Found in Database!' });
        }

        if (adminInfo.isBlocked) {
            console.log(`🛑 Filter Block: ${adminInfo.companyName} is Currently Banned/Blocked!`);
            return res.status(403).json({ 
                message: '❌ Your Admin Account is suspended! Please contact Super Admin to activate.' 
            });
        }

        const currentEmployeesCount = await Employee.countDocuments({ adminId: adminInfo._id });
        console.log(`📊 Stats for ${adminInfo.companyName} -> Current Employees: ${currentEmployeesCount} | Max Allowed Limit: ${adminInfo.employeeLimit}`);

        if (currentEmployeesCount >= adminInfo.employeeLimit) {
            console.log("❌ Filter Block: Admin ki employee limit cross ho gayi hai!");
            return res.status(400).json({ 
                message: `❌ Limit Reached! Your plan allows only ${adminInfo.employeeLimit} employees. Contact Super Admin to upgrade.` 
            });
        }

        let empExists = await Employee.findOne({ email });
        if (empExists) {
            console.log("❌ Filter Block: Email pehle se register hai.");
            return res.status(400).json({ message: 'Employee with this email already exists!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newEmployee = new Employee({
            adminId: adminInfo._id, 
            name,
            email,
            password: hashedPassword
        });

        await newEmployee.save();
        console.log("✅ SUCCESS: Employee Account Created Successfully!");
        
        res.status(201).json({ 
            message: '🚀 Employee Account Created Successfully!', 
            employee: { name, email } 
        });

    } catch (error) {
        console.error("💥 CATCH BLOCK SERVER ERROR:", error.message);
        res.status(500).json({ message: 'Backend Server Error: ' + error.message });
    }
});

// 2. ADMIN KO USKE SAARE EMPLOYEES KI LIST DIKHANE KE LIYE
router.get('/all/:adminId', async (req, res) => {
    try {
        const employees = await Employee.find({ adminId: req.params.adminId }).select('-password').sort({ createdAt: -1 });
        res.json(employees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error in fetching employees' });
    }
});

// 3. EMPLOYEE LOGIN ROUTE (UPDATED WITH DEVICE LOCK & ONLINE LOCK)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const employee = await Employee.findOne({ email });
        if (!employee) {
            return res.status(400).json({ message: 'Invalid Email or Password!' });
        }

        if (employee.status === 'Suspended') {
            return res.status(403).json({ message: 'Your account has been suspended by your Admin.' });
        }

        const isMatch = await bcrypt.compare(password, employee.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Email or Password!' });
        }

        // 🔑 Generate JWT Token
        const token = jwt.sign(
            { id: employee._id, role: 'Employee' },
            'MY_SUPER_SECRET_KEY_12345',
            { expiresIn: '1d' }
        );

        // 🔒 SECURITY UPDATE: Database me status Online set karna aur token lock lagana
        employee.isOnline = true;
        employee.currentSessionToken = token; 
        await employee.save();

        res.json({
            token,
            employee: { id: employee._id, name: employee.name, email: employee.email }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error in employee login' });
    }
});

// 🔒 NEW ROUTE: EMPLOYEE LOGOUT (STATUS CLEANUP FOR BACK-BUTTON & LIVE UPDATE)
router.post('/logout', async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (employeeId) {
            // Logout hote hi database me offline mark kar do aur session lock tod do
            await Employee.findByIdAndUpdate(employeeId, { 
                isOnline: false, 
                currentSessionToken: null 
            });
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error during logout' });
    }
});

// 4. ADMIN EMPLOYEE KA PASSWORD CHANGE KAREGA
router.put('/update-password/:empId', async (req, res) => {
    try {
        const { newPassword } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await Employee.findByIdAndUpdate(req.params.empId, { password: hashedPassword });
        res.json({ message: 'Employee password updated successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password' });
    }
});

// 5. ADMIN EMPLOYEE KA ACCESS CHANGE KAREGA (ACTIVE / SUSPEND)
router.put('/toggle-status/:empId', async (req, res) => {
    try {
        const { status } = req.body; 
        await Employee.findByIdAndUpdate(req.params.empId, { status });
        res.json({ message: `Employee status changed to ${status}!` });
    } catch (error) {
        res.status(500).json({ message: 'Error changing status' });
    }
});

// 6. ADMIN EMPLOYEE KO DELETE KAREGA
router.delete('/delete/:empId', async (req, res) => {
    try {
        await Employee.findByIdAndDelete(req.params.empId);
        res.json({ message: 'Employee account deleted permanently!' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting employee' });
    }
});

module.exports = router;