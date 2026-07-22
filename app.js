const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const flash = require('connect-flash');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

const uploadDir = path.join(__dirname, 'public', 'images');
fs.mkdirSync(uploadDir, { recursive: true });

// MySQL database connection
const db = mysql.createConnection({
    host: 'c237-annie-mysql.mysql.database.azure.com',
    user: 'c237_030',
    password: 'c237030@2026!',
    database: 'c237_030_ca2team3',
    ssl: {
        rejectUnauthorized: false
    }
});

// Set up multer for pet image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        const base = path.basename(file.originalname || 'image', ext).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${base}${ext}`.toLowerCase());
    }
});
const upload = multer({ storage: storage });

const deleteImageFile = (filename) => {
    if (!filename) return;
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};


db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

// Without this, an unexpected network hiccup (e.g. Azure dropping an idle
// connection) fires an unhandled 'error' event and crashes the entire server.
db.on('error', (err) => {
    console.error('Database connection error:', err.message);
});

// Store sessions as rows in MySQL (table: sessions) instead of the default
// in-memory store, so logins survive a server restart. express-mysql-session
// doesn't forward an `ssl` option to its internal pool, and Azure MySQL
// requires TLS - so we create our own pool (with SSL) and hand it over instead.
const sessionPool = mysql.createPool({
    host: 'c237-annie-mysql.mysql.database.azure.com',
    user: 'c237_030',
    password: 'c237030@2026!',
    database: 'c237_030_ca2team3',
    ssl: {
        rejectUnauthorized: false
    }
});
sessionPool.on('error', (err) => {
    console.error('Session store pool error:', err.message);
});
const sessionStore = new MySQLStore({}, sessionPool);

// View engine and middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use(flash());

// [Enhancement] Make the unread notification count available to every view
// (res.locals is auto-available in EJS templates without passing it manually),
// so the notification bell badge can show up in the navbar on any page.
app.use((req, res, next) => {
    if (!req.session.user) {
        res.locals.unreadCount = 0;
        return next();
    }
    db.query('SELECT COUNT(*) AS count FROM notifications WHERE userId = ? AND isRead = 0',
        [req.session.user.id], (err, results) => {
            res.locals.unreadCount = err ? 0 : results[0].count;
            next();
        });
});

// ==================== MIDDLEWARE ====================
// [Student A] Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// [Student A] Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/pets');
    }
};

// [Student A] Middleware for registration form validation
const validateRegistration = (req, res, next) => {
    // trim so " bob@x.com" and "bob@x.com" aren't treated as different accounts
    req.body.username = (req.body.username || '').trim();
    req.body.email = (req.body.email || '').trim().toLowerCase();
    req.body.phone = (req.body.phone || '').trim();
    req.body.address = (req.body.address || '').trim();

    const { username, email, password, confirmPassword, phone, address } = req.body;

    if (!username || !email || !password || !phone || !address) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    if (password !== confirmPassword) {
        req.flash('error', 'Passwords do not match.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// ==================== STUDENT A: REGISTRATION, LOGIN, LOGOUT ====================

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, phone, address, role } = req.body;
    // TESTING ONLY: role is picked from the form. Remove this dropdown / hardcode
    // role to 'user' before final submission so visitors can't self-promote to admin.
    const chosenRole = role === 'admin' ? 'admin' : 'user';

    const sql = 'INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, phone, address, chosenRole], (err, result) => {
        if (err) {
            // email is UNIQUE in the schema - handle that case gracefully instead
            // of crashing the whole server on a duplicate registration attempt
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'That email is already registered. Try logging in instead.');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }
            throw err;
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }
        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/pets');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// [Student A] Personalisation feature: users manage their own account info
app.get('/profile', checkAuthenticated, (req, res) => {
    res.render('profile', {
        user: req.session.user,
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/profile', checkAuthenticated, (req, res) => {
    const username = (req.body.username || '').trim();
    const phone = (req.body.phone || '').trim();
    const address = (req.body.address || '').trim();

    if (!username || !phone || !address) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/profile');
    }

    const sql = 'UPDATE users SET username = ?, phone = ?, address = ? WHERE id = ?';
    db.query(sql, [username, phone, address, req.session.user.id], (err) => {
        if (err) throw err;
        // keep the session in sync so the navbar/welcome text reflects the change immediately
        req.session.user.username = username;
        req.session.user.phone = phone;
        req.session.user.address = address;
        req.flash('success', 'Profile updated successfully.');
        res.redirect('/profile');
    });
});

app.post('/profile/password', checkAuthenticated, (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        req.flash('error', 'All password fields are required.');
        return res.redirect('/profile');
    }
    if (newPassword.length < 6) {
        req.flash('error', 'New password should be at least 6 or more characters long.');
        return res.redirect('/profile');
    }
    if (newPassword !== confirmNewPassword) {
        req.flash('error', 'New passwords do not match.');
        return res.redirect('/profile');
    }

    // verify current password is correct before allowing the change
    const checkSql = 'SELECT id FROM users WHERE id = ? AND password = SHA1(?)';
    db.query(checkSql, [req.session.user.id, currentPassword], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/profile');
        }
        const updateSql = 'UPDATE users SET password = SHA1(?) WHERE id = ?';
        db.query(updateSql, [newPassword, req.session.user.id], (err) => {
            if (err) throw err;
            req.flash('success', 'Password changed successfully.');
            res.redirect('/profile');
        });
    });
});

// ==================== STUDENT C: VIEWING / DISPLAYING PETS ====================
// (Search & filter logic marked [Student F] lives inside the same route,
//  since the pet list and its filters share one query)

app.get('/pets', checkAuthenticated, (req, res) => {
    const { q, species, ageGroup, status, goodWithKids, sort } = req.query;

    let sql = 'SELECT * FROM pets WHERE 1=1';
    const params = [];

    // [Student F] Search by name or breed
    if (q) {
        sql += ' AND (name LIKE ? OR breed LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }
    // [Student F] Filter by species
    if (species) {
        sql += ' AND species = ?';
        params.push(species);
    }
    // [Student F] Filter by age group
    if (ageGroup) {
        sql += ' AND ageGroup = ?';
        params.push(ageGroup);
    }
    // [Student F] Filter by adoption status
    if (status) {
        sql += ' AND adoptionStatus = ?';
        params.push(status);
    } else {
        sql += " AND adoptionStatus != 'Archived'";
    }
    // [Student F] Filter by good with kids
    if (goodWithKids === 'true') {
        sql += ' AND friendlyWithKids = 1';
    }
    // [Student F] Sorting
    if (sort === 'name') {
        sql += ' ORDER BY name ASC';
    } else if (sort === 'age') {
        sql += ' ORDER BY ageMonths ASC';
    } else {
        sql += ' ORDER BY createdAt DESC';
    }

    db.query(sql, params, (err, results) => {
        if (err) throw err;
        res.render('pets', { pets: results, user: req.session.user, query: req.query });
    });
});

app.get('/pets/:id', checkAuthenticated, (req, res) => {
    const petId = req.params.id;

    db.query('SELECT * FROM pets WHERE id = ?', [petId], (err, petResults) => {
        if (err) throw err;
        if (petResults.length === 0) {
            return res.status(404).send('Pet not found');
        }

        db.query('SELECT * FROM favourites WHERE userId = ? AND petId = ?',
            [req.session.user.id, petId], (err, favResults) => {
                if (err) throw err;
                res.render('petDetail', {
                    pet: petResults[0],
                    user: req.session.user,
                    isFavourite: favResults.length > 0
                });
            });
    });
});

// ==================== STUDENT B: ADDING NEW PETS ====================

app.get('/addPet', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addPet', { user: req.session.user });
});

app.post('/addPet', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const {
        name, species, breed, ageMonths, ageGroup, gender, weightLbs,
        personality, description, medicalHistory, vaccinationStatus,
        rescueDate, shelterLocation, kennelCode, adoptionStatus
    } = req.body;

    const friendlyWithPeople = req.body.friendlyWithPeople ? 1 : 0;
    const friendlyWithKids = req.body.friendlyWithKids ? 1 : 0;
    const friendlyWithDogs = req.body.friendlyWithDogs ? 1 : 0;
    const friendlyWithCats = req.body.friendlyWithCats ? 1 : 0;
    const friendlyWithOtherPets = req.body.friendlyWithOtherPets ? 1 : 0;
    const specialNeeds = req.body.specialNeeds ? 1 : 0;
    const healthy = req.body.healthy ? 1 : 0;
    const image = req.file ? req.file.filename : null;

    const sql = `INSERT INTO pets
        (name, species, breed, ageMonths, ageGroup, gender, weightLbs, personality, description,
         medicalHistory, vaccinationStatus, rescueDate, shelterLocation, kennelCode, adoptionStatus,
         friendlyWithPeople, friendlyWithKids, friendlyWithDogs, friendlyWithCats, friendlyWithOtherPets, specialNeeds, healthy, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [
        name, species, breed, ageMonths, ageGroup, gender, weightLbs, personality, description,
        medicalHistory, vaccinationStatus, rescueDate, shelterLocation, kennelCode, adoptionStatus || 'Available',
        friendlyWithPeople, friendlyWithKids, friendlyWithDogs, friendlyWithCats, friendlyWithOtherPets, specialNeeds, healthy, image
    ], (err, result) => {
        if (err) {
            console.error('Error adding pet:', err);
            return res.status(500).send('Error adding pet');
        }
        req.flash('success', 'Pet added successfully!');
        res.redirect('/pets');
    });
});

// ==================== STUDENT D: EDITING EXISTING PETS ====================

app.get('/editPet/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const petId = req.params.id;
    db.query('SELECT * FROM pets WHERE id = ?', [petId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.status(404).send('Pet not found');
        }
        res.render('editPet', { pet: results[0], user: req.session.user });
    });
});

app.post('/editPet/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const petId = req.params.id;
    const {
        name, species, breed, ageMonths, ageGroup, gender, weightLbs,
        personality, description, medicalHistory, vaccinationStatus,
        rescueDate, shelterLocation, kennelCode, adoptionStatus, currentImage
    } = req.body;

    const friendlyWithPeople = req.body.friendlyWithPeople ? 1 : 0;
    const friendlyWithKids = req.body.friendlyWithKids ? 1 : 0;
    const friendlyWithDogs = req.body.friendlyWithDogs ? 1 : 0;
    const friendlyWithCats = req.body.friendlyWithCats ? 1 : 0;
    const friendlyWithOtherPets = req.body.friendlyWithOtherPets ? 1 : 0;
    const specialNeeds = req.body.specialNeeds ? 1 : 0;
    const healthy = req.body.healthy ? 1 : 0;

    // retain existing image unless a new one is uploaded
    const image = req.file ? req.file.filename : currentImage;

    const sql = `UPDATE pets SET
        name=?, species=?, breed=?, ageMonths=?, ageGroup=?, gender=?, weightLbs=?, personality=?, description=?,
        medicalHistory=?, vaccinationStatus=?, rescueDate=?, shelterLocation=?, kennelCode=?, adoptionStatus=?,
        friendlyWithPeople=?, friendlyWithKids=?, friendlyWithDogs=?, friendlyWithCats=?, friendlyWithOtherPets=?, specialNeeds=?, healthy=?, image=?
        WHERE id=?`;

    db.query(sql, [
        name, species, breed, ageMonths, ageGroup, gender, weightLbs, personality, description,
        medicalHistory, vaccinationStatus, rescueDate, shelterLocation, kennelCode, adoptionStatus,
        friendlyWithPeople, friendlyWithKids, friendlyWithDogs, friendlyWithCats, friendlyWithOtherPets, specialNeeds, healthy, image,
        petId
    ], (err, result) => {
        if (err) {
            console.error('Error updating pet:', err);
            return res.status(500).send('Error updating pet');
        }
        if (req.file && currentImage && currentImage !== image) {
            deleteImageFile(currentImage);
        }
        req.flash('success', 'Pet updated successfully!');
        res.redirect('/pets/' + petId);
    });
});

// ==================== STUDENT E: REMOVING PETS + FAVOURITES ====================

app.get('/deletePet/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const petId = req.params.id;
    db.query('SELECT image FROM pets WHERE id = ?', [petId], (err, results) => {
        if (err) {
            console.error('Error deleting pet:', err);
            return res.status(500).send('Error deleting pet');
        }

        const currentImage = results[0] && results[0].image ? results[0].image : null;
        db.query('DELETE FROM pets WHERE id = ?', [petId], (err, result) => {
            if (err) {
                console.error('Error deleting pet:', err);
                return res.status(500).send('Error deleting pet');
            }
            deleteImageFile(currentImage);
            req.flash('success', 'Pet removed.');
            res.redirect('/pets');
        });
    });
});

// [Student E] Personalisation feature: users favourite/unfavourite pets
app.post('/pets/:id/favourite', checkAuthenticated, (req, res) => {
    const petId = req.params.id;
    const userId = req.session.user.id;

    db.query('SELECT * FROM favourites WHERE userId = ? AND petId = ?', [userId, petId], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            db.query('DELETE FROM favourites WHERE userId = ? AND petId = ?', [userId, petId], (err) => {
                if (err) throw err;
                res.redirect('/pets/' + petId);
            });
        } else {
            db.query('INSERT INTO favourites (userId, petId) VALUES (?, ?)', [userId, petId], (err) => {
                if (err) throw err;
                res.redirect('/pets/' + petId);
            });
        }
    });
});

app.get('/favourites', checkAuthenticated, (req, res) => {
    const sql = `SELECT pets.* FROM favourites
                 JOIN pets ON favourites.petId = pets.id
                 WHERE favourites.userId = ?
                 ORDER BY favourites.createdAt DESC`;
    db.query(sql, [req.session.user.id], (err, results) => {
        if (err) throw err;
        res.render('favourites', { pets: results, user: req.session.user });
    });
});

// ==================== STUDENT F: ADOPTION APPLICATIONS ====================

app.get('/apply/:petId', checkAuthenticated, (req, res) => {
    const petId = req.params.petId;
    db.query('SELECT * FROM pets WHERE id = ?', [petId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.status(404).send('Pet not found');
        }
        res.render('apply', { pet: results[0], user: req.session.user });
    });
});

app.post('/apply/:petId', checkAuthenticated, (req, res) => {
    const petId = req.params.petId;
    const userId = req.session.user.id;
    const { livingSpace, workingHours, familyMembers, existingPets, activityLevel, experience, motivation } = req.body;
    const hasChildren = req.body.hasChildren ? 1 : 0;

    const sql = `INSERT INTO applications
        (petId, userId, livingSpace, workingHours, familyMembers, hasChildren, existingPets, activityLevel, experience, motivation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [petId, userId, livingSpace, workingHours, familyMembers, hasChildren, existingPets || 'None', activityLevel, experience, motivation],
        (err, result) => {
            if (err) throw err;
            req.flash('success', 'Application submitted!');
            res.redirect('/my-applications');
        });
});

app.get('/my-applications', checkAuthenticated, (req, res) => {
    const sql = `SELECT applications.*, pets.name AS petName, pets.species AS petSpecies, pets.image AS petImage
                 FROM applications
                 JOIN pets ON applications.petId = pets.id
                 WHERE applications.userId = ?
                 ORDER BY applications.updatedAt DESC`;
    db.query(sql, [req.session.user.id], (err, results) => {
        if (err) throw err;
        res.render('myApplications', { applications: results, user: req.session.user });
    });
});

// [Student F / Admin] View and manage all applications
app.get('/applications', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = `SELECT applications.*, pets.name AS petName, users.username AS applicantName, users.email AS applicantEmail
                 FROM applications
                 JOIN pets ON applications.petId = pets.id
                 JOIN users ON applications.userId = users.id
                 ORDER BY applications.updatedAt DESC`;
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render('applications', { applications: results, user: req.session.user });
    });
});

app.post('/applications/:id/stage', checkAuthenticated, checkAdmin, (req, res) => {
    const applicationId = req.params.id;
    const { stage, decisionNotes } = req.body;

    db.query('UPDATE applications SET stage = ?, decisionNotes = ? WHERE id = ?',
        [stage, decisionNotes, applicationId], (err, result) => {
            if (err) throw err;

            const infoSql = `SELECT applications.userId, pets.id AS petId, pets.name AS petName
                              FROM applications JOIN pets ON applications.petId = pets.id
                              WHERE applications.id = ?`;
            db.query(infoSql, [applicationId], (err, infoResults) => {
                if (err) throw err;
                const { userId, petId, petName } = infoResults[0];

                // Keep pet adoptionStatus in sync with an approved/completed application
                if (stage === 'Approved' || stage === 'Completed') {
                    db.query('UPDATE pets SET adoptionStatus = ? WHERE id = ?',
                        [stage === 'Completed' ? 'Adopted' : 'Pending', petId]);
                }

                // [Enhancement] Notify the applicant that their application stage changed
                const message = `Your application for ${petName} has been updated to "${stage}".`;
                db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', [userId, message]);

                req.flash('success', 'Application updated.');
                res.redirect('/applications');
            });
        });
});

// [Enhancement] View my notifications - opening the page marks them all as read
app.get('/notifications', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC', [req.session.user.id], (err, results) => {
        if (err) throw err;
        db.query('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0', [req.session.user.id], (err) => {
            if (err) throw err;
            res.render('notifications', { notifications: results, user: req.session.user });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
