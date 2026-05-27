// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Frontend static files ke liye
app.use('/api/super-admin', require('./routes/superAdmin'));

// LOCAL DATABASE CONNECTION (No Internet, No Router Block, No IP Whitelist required!)
// Aise likho taaki Render ka variable use ho
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sales_crm";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ DATABASE CONNECTED!'))
  .catch((err) => console.error('❌ Database connection error:', err));
  
// Routes Link
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/documents', require('./routes/documents'));
app.get('/', (req, res) => {
  res.send('CRM Backend Server is Running Perfectly!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});