const express = require('express');
const app = express();
const path = require('path');
const pool = require('./db');

const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const mutfakRouter = require('./routes/mutfak');
const garsonRouter = require('./routes/garson');
const kasaRouter = require('./routes/kasa');

app.use(express.static(path.join(__dirname, 'public')));

app.set("view engine","ejs")
app.use(express.json());

app.use('/orders', ordersRouter);
app.use('/admin', adminRouter);
app.use('/mutfak', mutfakRouter);
app.use('/garson', garsonRouter);
app.use('/kasa', kasaRouter);

app.get('/', (req, res) => {
    res.render('index');
});

app.get("/admin", (req, res) => {
    res.render('admin');
});

app.get('/images/:id', async (req, res) => {
    const itemId = req.params.id;
    try {
        const result = await pool.query('SELECT image_path FROM menu WHERE image_path = $1', [`/images/${itemId}`]);
        const imagePath = result.rows[0].image_path;
        res.sendFile(path.join(__dirname, imagePath));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fotoğraf yüklenirken hata oluştu' });
    }
});

app.get("/menu/:masaid", async (req, res) => {
    const masaid = req.params.masaid;

    try {
        const masaCheck = await pool.query('SELECT * FROM masalar WHERE name = $1', [masaid]);

        if (masaCheck.rowCount === 0) {
            return res.status(404).send('Böyle bir masa bulunamadı.');
        }

        const result = await pool.query('SELECT * FROM menu ORDER BY category ASC, name ASC');
        const menu = result.rows;

        const groupedMenu = menu.reduce((acc, item) => {
            if (!acc[item.category]) {
                acc[item.category] = [];
            }
            acc[item.category].push(item);
            return acc;
        }, {});

        const categories = Object.keys(groupedMenu).sort(); 

        const firstCategory = categories[0];

        res.render('menu', { menu: groupedMenu, categories, masaid, firstCategory });
    } catch (error) {
        console.error('Hata:', error.message);
        res.status(500).send('Bir hata oluştu.');
    }
});


app.get("/menu-data/:category", async (req, res) => {
    const category = req.params.category;

    try {
        const result = await pool.query('SELECT * FROM menu WHERE category = $1', [category]);
        res.json(result.rows);
    } catch (error) {
        console.error('Hata:', error.message);
        res.status(500).send('Bir hata oluştu.');
    }
});

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});