
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const PUBLIC_DATA_FILE = path.join(__dirname, 'public', 'data.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage for uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Unique name: field-Date.ext
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Load data from file (for read-only serving in production)
let portfolioData = require(DATA_FILE);
// Keep a static copy for production (served as /data.json)
try {
    fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(portfolioData, null, 2));
} catch (e) {
    console.warn('Warning: Unable to write public/data.json at startup:', e?.message);
}


// 
// API for built-in admin/save in index.html 
//
// Get portfolio data: /api/data (used by index.html admin panel)
app.get('/api/data', (req, res) => {
    res.json({ ok: true, data: portfolioData });
});

// Save/update portfolio data: /api/save (JSON only, matches index.html adminSave)
if (process.env.NODE_ENV !== 'production') {
    app.post('/api/save', express.json({limit: '10mb'}), (req, res) => {
        try {
            portfolioData = req.body;
            fs.writeFileSync(DATA_FILE, JSON.stringify(portfolioData, null, 2));
            // Mirror to public for static production reads
            try { fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(portfolioData, null, 2)); } catch {}
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ ok: false, error: e.toString() });
        }
    });
}

// (legacy/image upload admin API kept for future custom html admin.html)


// Legacy: still allow /api/portfolio POST with uploads, if needed for external admin.html
if (process.env.NODE_ENV !== 'production') {
    app.post('/api/portfolio', upload.fields([
        { name: 'profileImage', maxCount: 1 },
        { name: 'cvFile', maxCount: 1 },
        { name: 'projectShots', maxCount: 20 }
    ]), (req, res) => {
        let data = req.body;
        try {
            // Parse textarea/json fields
            if (typeof data.skills === 'string') {
                data.skills = data.skills.split(',').map(x => x.trim()).filter(Boolean);
            }
            if (typeof data.experience === 'string') {
                data.experience = JSON.parse(data.experience);
            }
            if (typeof data.projects === 'string') {
                data.projects = JSON.parse(data.projects);
            }
        } catch (err) {
            return res.json({ success: false, error: 'Invalid JSON field' });
        }

        // Sections (checkboxes)
        data.sections = {
            hero: !!(data['sections.hero'] === 'on' || data['sections.hero'] === true),
            skills: !!(data['sections.skills'] === 'on' || data['sections.skills'] === true),
            experience: !!(data['sections.experience'] === 'on' || data['sections.experience'] === true),
            projects: !!(data['sections.projects'] === 'on' || data['sections.projects'] === true),
            contact: !!(data['sections.contact'] === 'on' || data['sections.contact'] === true),
        };

        // Profile image
        if (req.files && req.files.profileImage && req.files.profileImage[0]) {
            data.profileImage = '/uploads/' + req.files.profileImage[0].filename;
        } else if (!data.profileImage) {
            data.profileImage = portfolioData.profileImage || null;
        }

        // CV
        if (req.files && req.files.cvFile && req.files.cvFile[0]) {
            data.cvUrl = '/uploads/' + req.files.cvFile[0].filename;
        } else if (!data.cvUrl) {
            data.cvUrl = portfolioData.cvUrl || '';
        }

        // Project screenshots
        if (req.files && req.files.projectShots) {
            data.projectShots = req.files.projectShots.map(f => '/uploads/' + f.filename);
        } else {
            data.projectShots = portfolioData.projectShots || [];
        }

        portfolioData = data;
        fs.writeFileSync(DATA_FILE, JSON.stringify(portfolioData, null, 2));
        // Mirror to public for static production reads
        try { fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(portfolioData, null, 2)); } catch {}
        res.json({ success: true, data: portfolioData });
    });
}

app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
});
