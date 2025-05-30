const express = require('express');
const fs = require('fs');
const router = express.Router();
const session = require('express-session');
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const QRCode = require("qrcode");
const pgp = require("pg-promise")();
const { name } = require('ejs');
const bcrypt = require('bcrypt');

router.use('/images', express.static(path.join(__dirname, 'images')));
router.use(express.static(path.join(__dirname, 'public')));

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

router.use(session({
    name: 'admin-session',
    secret: '1234',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000, path:'/admin' }
}));

function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    } else {
        res.redirect('/admin');
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'images');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/', (req,res) => {
    res.render('admin');
});

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Oturum kapatma hatası:", err);
        }
        res.redirect('/admin');
    });
});
router.post('/login',async (req, res) => {
    const {username, password} = req.body;

    try{
        const result = await pool.query(
            'SELECT * FROM admins WHERE name = $1',
        [username]);
        const user = result.rows[0];

        if(!user){
            res.send('Kullanıcı adı veya şifre hatalı');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.send('Şifre hatalı');
        }
        req.session.isLoggedIn = true;
        res.redirect('/admin/mainPage');
    }catch(err){
        console.error(err);
        res.send('Giriş yaparken hata oluştu');
    }
});

router.post('/signup', async (req, res) => {
    const {username, email, password} = req.body;
    try{
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [username, email, hashedPassword]
        );
        req.session.isLoggedIn = true;
        res.redirect('/admin/mainPage');
    }catch(err){
        console.error(err);
        res.send('Hesap oluşturulurken hata oluştu');
    }
});

router.get('/mainPage', isAuthenticated, async (req, res) => {
    res.render('mainPage');
});

router.get('/menu-kontrol', isAuthenticated, async (req, res) => {
    try{
        const result = await pool.query('SELECT * FROM menu');
        res.render('menu-kontrol', { menu: result.rows });
    }catch(err){
        console.error(err);
    }
});

router.post('/menu-kontrol/update/:id', async(req, res) => {
    const itemId = req.params.id;
    const newName = req.body.name;
    const newPrice = req.body.price;
    const newCategory = req.body.category;
    const newDescription = req.body.description;
    
    try{
        const result = await pool.query(
            'UPDATE menu SET name = $1, price = $2, category = $3, description = $4 WHERE urun_id = $5 RETURNING *',
            [newName, newPrice, newCategory, newDescription, itemId]
        );
        req.session.isLoggedIn = true;
        res.json('success');
    }catch(err){
        console.error(err);
    }
});


router.delete('/menu-kontrol/delete/:id', async (req, res) => {
    const itemId = req.params.id;

    try {
        const result = await pool.query('SELECT image_path FROM menu WHERE urun_id = $1', [itemId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Öğe bulunamadı!" });
        }

        const imagePath = result.rows[0].image_path;
        const fullImagePath = path.join(__dirname, '..', imagePath);

        fs.unlink(fullImagePath, (err) => {
            if (err) {
                console.error("Dosya silinemedi:", err);
            } else {
                console.log("Dosya başarıyla silindi:", fullImagePath);
            }
        });

        await pool.query('DELETE FROM menu WHERE urun_id = $1', [itemId]);

        req.session.isLoggedIn = true;
        res.json({ message: "Öğe ve dosyası başarıyla silindi!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Bir hata oluştu!" });
    }
});

router.post('/menu-kontrol/add', upload.single('image'), async (req, res) => {
    const { name, price, category, description } = req.body;
    try {
        const imagePath = `/images/${req.file.filename}`;

        const result = await pool.query(
            'INSERT INTO menu (name, price, category, description, image_path) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, price, category, description, imagePath]
        );
        req.session.isLoggedIn = true;
        res.redirect('/admin/menu-kontrol');
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ürün eklenirken hata oluştu' });
    }
});

router.get("/table", async (req, res) => {
    try {
        const masalar = await pool.query("SELECT * FROM masalar ORDER BY id ASC");
        res.render("table", { masalar: masalar.rows });
    } catch (error) {
        console.error("Masaları çekerken hata oluştu:", error);
        res.send("Bir hata oluştu.");
    }
});

router.post("/table/add", async (req, res) => {
    const masaName = req.body.name;

    try {
        const qrData = `http://localhost:3000/menu/${masaName}`;
        const qrPath = `./qrcodes/${masaName}.png`;
        await QRCode.toFile(qrPath, qrData);

        await pool.query(
            "INSERT INTO masalar (name, qr_path) VALUES ($1, $2)",
            [masaName, `/${qrPath}`]
        );

        res.redirect("/admin/table");
    } catch (error) {
        console.error("Masa eklerken hata oluştu:", error);
        res.send("Bir hata oluştu.");
    }
});

router.post("/table/delete/:id", async (req, res) => {
    const masaId = req.params.id;

    try {
        const masa = await pool.query("SELECT * FROM masalar WHERE id = $1", [masaId]);

        if (masa.rows.length > 0) {
            const qrFilePath = path.join(__dirname, "../", masa.rows[0].qr_path);

            if (fs.existsSync(qrFilePath)) {
                fs.unlinkSync(qrFilePath);
            } else {
                console.log(`Dosya bulunamadı: ${qrFilePath}`);
            }

            await pool.query("DELETE FROM masalar WHERE id = $1", [masaId]);
        } else {
            console.log("Masa bulunamadı!");
        }

        res.redirect("/admin/table");
    } catch (error) {
        console.error("Masa silinirken hata oluştu:", error);
        res.send("Bir hata oluştu.");
    }
});

router.get("/table/:id", async (req, res) => {
    const masaId = req.params.id;

    try {
        const masa = await pool.query("SELECT * FROM masalar WHERE id = $1", [masaId]);
        const qrPath = masa.rows[0].qr_path;
        res.sendFile(path.join(__dirname, "..", qrPath));
    } catch (error) {
        console.error("Masa bilgilerini çekerken hata oluştu:", error);
        res.send("Bir hata oluştu.");
    }
});

router.get('/report', async (req, res) => {
    const tableName = req.query.tableName ? req.query.tableName.toString() : null;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    try {
        const tablesResult = await pool.query('SELECT id, name FROM masalar');
        const tables = tablesResult.rows;

        let ordersQuery = `
            SELECT o.id, o.table_id, o.date, o.items, o.total, o.status, t.name AS table_name
            FROM orders o
            INNER JOIN masalar t ON o.table_id = t.name
        `;
        const queryParams = [];
        const filters = [];

        if (tableName) {
            filters.push('t.name = $' + (filters.length + 1));
            queryParams.push(tableName);
        }

        if (startDate) {
            filters.push('o.date >= $' + (filters.length + 1));
            queryParams.push(`${startDate} 00:00:00`);
        }

        if (endDate) {
            filters.push('o.date <= $' + (filters.length + 1));
            queryParams.push(`${endDate} 23:59:59`);
        }

        if (filters.length > 0) {
            ordersQuery += ' WHERE ' + filters.join(' AND ');
        }

        ordersQuery += ' ORDER BY o.date DESC';
        const ordersResult = await pool.query(ordersQuery, queryParams);

        res.render('reports', {
            tables: tables,
            orders: ordersResult.rows,
            selectedTable: tableName || null,
            startDate: startDate || '',
            endDate: endDate || '',
        });
    } catch (error) {
        console.error('Siparişler alınırken hata oluştu:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

router.delete('/report/:id', function(req, res) {
    const orderId = req.params.id;

    pool.query('DELETE FROM orders WHERE id = $1', [orderId], function(err, result) {
        if (err) {
            console.error('Sipariş silinirken hata oluştu:', err);
            res.status(500).send('Bir hata oluştu.');
        } else {
            res.send('Sipariş başarıyla silindi.');
        }
    });
});

module.exports = router;