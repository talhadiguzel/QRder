const express = require('express');
const fs = require('fs');
const router = express.Router();
const path = require('path');
const pool = require('../db');
const session = require('express-session');
const bodyParser = require('body-parser');
const { broadcast  } = require('../websocket');

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());
router.use(express.static(path.join(__dirname, 'public')));

router.use(session({
    name: 'garson-session',
    secret: '9101',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000, path:'/garson' }
}));

function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    } else {
        res.redirect('/garson');
    }
}

router.get('/', (req, res) => {
    res.render('garson');
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try{
        const result = await pool.query('SELECT * FROM garson WHERE username = $1 and password = $2',
        [username, password]);

        if (result.rows.length > 0) {
            req.session.isLoggedIn = true;
            res.redirect('/garson/orders');
        }else{
            res.send('Kullanıcı adı veya şifre hatalı');
        }
    } catch (err) {
        console.error(err);
        res.send('Giriş yaparken hata oluştu');
    }
});

router.post('/signup', async (req, res) => {
    const {username, email, password} = req.body;
    try{
        const result = await pool.query(
            'INSERT INTO garson (username, email, password) VALUES ($1, $2, $3) RETURNING *',
            [username, email, password]
        );
        req.session.isLoggedIn = true;
        res.redirect('/garson/orders');
    }catch(err){
        console.error(err);
        res.send('Hesap oluşturulurken hata oluştu');
    }
});

router.get('/orders', isAuthenticated, async (req, res) => {
    pool.query('SELECT * FROM orders WHERE status = $1', ['Hazır'], (err, result) => {
        if (err) {
            console.error(err);
            res.send('Bir hata oluştu');
        } else {
            res.render('garson_orders', { orders: result.rows });
        }
    });
});

router.post('/orders/:id/status', isAuthenticated, async (req, res) => {
    const orderId = req.params.id;
    const newStatus = req.body;
    const date = newStatus.date;
    const status = newStatus.status;
    pool.query('UPDATE orders SET status = $1, date = $2 WHERE id = $3 RETURNING *', [status, date, orderId], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Bir hata oluştu');
        } else {
            const updatedOrder = result.rows[0];

            broadcast ({ type: 'payment_received', order: updatedOrder });
            res.redirect('/garson/orders');
        }
    });
});

module.exports = router;