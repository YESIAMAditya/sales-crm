// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const JWT_SECRET = 'MY_SUPER_SECRET_KEY_12345'; // Token key same honi chahiye dono jagah

// Middleware: Browser Cache Control (Back button dabane par bhoot screen nahi dikhegi)
const preventCache = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
};

// 1. ADMIN REGISTRATION (SIGNUP) + AUTO LOGIN ROUTE
router.post('/register-admin', preventCache, async (req, res) => {
    try {
        const { companyName, email, password, secretKey } = req.body;

        let adminExists = await Admin.findOne({ email });
        if (adminExists) {
            return res.status(400).json({ message: 'Email already registered!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = new Admin({
            companyName,
            email,
            password: hashedPassword,
            secretKey: secretKey || "admin123"
        });

        const savedAdmin = await newAdmin.save();

        // 🔥 AUTO LOGIN LOGIC: Signup hote hi token generate karo
        const token = jwt.sign(
            { id: savedAdmin._id, role: 'admin' },
            JWT_SECRET, 
            { expiresIn: '1d' }
        );

        // Frontend ko token aur details dono bhej do
        res.status(201).json({ 
            message: '🎉 Registration & Login Successful!',
            token,
            admin: {
                id: savedAdmin._id,
                companyName: savedAdmin.companyName,
                email: savedAdmin.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error in registration' });
    }
});

// 2. ADMIN LOGIN ROUTE
router.post('/login-admin', preventCache, async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(400).json({ message: 'Invalid Email or Password!' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Email or Password!' });
        }

        const token = jwt.sign(
            { id: admin._id, role: 'admin' },
            JWT_SECRET, 
            { expiresIn: '1d' }
        );

        res.json({
            token,
            admin: {
                id: admin._id,
                companyName: admin.companyName,
                email: admin.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error in login' });
    }
});

// 🔒 NEW ROUTE: ADMIN LOGOUT ROUTE (Backend confirmation ke liye)
router.post('/logout-admin', (req, res) => {
    res.status(200).json({ message: 'Admin logged out successfully from server' });
});

// 3. 🔐 ADMIN PASSWORD RECOVERY ROUTE
router.post('/admin-forgot-password', async (req, res) => {
    try {
        const { email, secretKey, newPassword } = req.body;

        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(404).json({ message: 'Admin with this email not found!' });
        }

        if (admin.secretKey !== secretKey) {
            return res.status(401).json({ message: 'Incorrect Secret Recovery Key!' });
        }

        const salt = await bcrypt.genSalt(10);
        admin.password = await bcrypt.hash(newPassword, salt);
        await admin.save();

        res.status(200).json({ message: '🎉 Password reset successfully! You can now login.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error during password recovery' });
    }
});

module.exports = router;