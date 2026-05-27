const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin'); // 👈 Double check kijiye ki aapka model isi folder me hai
const bcrypt = require('bcryptjs');

// 1. SARE ADMINS KI LIST DEKHNA (With Auto-Migration)
router.get('/all-admins', async (req, res) => {
    try {
        console.log("🔄 Fetching all admins request received...");
        
        // Purane admins me missing fields auto-insert karne ke liye
        await Admin.updateMany(
            { employeeLimit: { $exists: false } }, 
            { $set: { employeeLimit: 5, isBlocked: false } }
        );

        // Fresh data query
        const admins = await Admin.find().select('-password');
        console.log(`✅ Total ${admins.length} admins found and sending to frontend.`);
        
        res.json({ totalAdmins: admins.length, admins });
    } catch (err) {
        console.error("❌ ERROR IN ALL-ADMINS ROUTE:", err.message);
        res.status(500).json({ message: 'Server Error: ' + err.message });
    }
});

// 2. EMPLOYEE LIMIT UPDATE KARNA
router.post('/update-limit', async (req, res) => {
    const { adminId, newLimit } = req.body;
    try {
        await Admin.findByIdAndUpdate(adminId, { employeeLimit: newLimit });
        res.json({ message: '🚀 Employee limit updated successfully!' });
    } catch (err) {
        res.status(500).json({ message: 'Limit update failed' });
    }
});

// 3. ACCOUNT BAND / CHALU KARNA
router.post('/toggle-block', async (req, res) => {
    const { adminId, isBlocked } = req.body;
    try {
        await Admin.findByIdAndUpdate(adminId, { isBlocked });
        const msg = isBlocked ? '❌ Admin account Blocked!' : '✅ Admin account Unblocked!';
        res.json({ message: msg });
    } catch (err) {
        res.status(500).json({ message: 'Status change failed' });
    }
});

// 4. DIRECT PASSWORD RESET
router.post('/reset-admin-password', async (req, res) => {
    const { adminId, newPassword } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        await Admin.findByIdAndUpdate(adminId, { password: hashedPassword });
        res.json({ message: '🔑 Admin password reset successfully by Master!' });
    } catch (err) {
        res.status(500).json({ message: 'Password reset failed' });
    }
});

// routes/superAdmin.js ke andar ye naya route add karein (module.exports ke upar)

// 5. SUPER ADMIN: DYNAMICALLY CREATE NEW ADMIN ACCOUNT
router.post('/create-admin', async (req, res) => {
    const { companyName, email, password, employeeLimit } = req.body;
    try {
        console.log("➕ Super Admin: Creating new admin for:", companyName);

        // 1. Check karo ki email pehle se exist toh nahi karta
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ message: '❌ This email is already registered as an Admin!' });
        }

        // 2. Password ko secure/hash karo
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Naya Admin model create karo (secretKey default 'admin123' de rahe hain)
        const newAdmin = new Admin({
            companyName,
            email,
            password: hashedPassword,
            secretKey: "admin123", 
            employeeLimit: employeeLimit ? Number(employeeLimit) : 5,
            isBlocked: false
        });

        await newAdmin.save();
        res.json({ message: `🚀 Admin account for "${companyName}" created successfully!` });

    } catch (err) {
        console.error("❌ Error creating admin by Super Admin:", err.message);
        res.status(500).json({ message: 'Server Error: ' + err.message });
    }
});

module.exports = router;