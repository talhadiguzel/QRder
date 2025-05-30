const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const router = express.Router();
const { broadcast  } = require('../websocket'); 

router.use(express.static(path.join(__dirname, 'public')));


const getOrders = async () => {
    try {
        const data = await pool.query('SELECT * FROM orders');
        return data.rows;
    } catch (error) {
        return [];
    }
};

const saveOrder = async (newOrder) => {
    const { table_id, date, items, total, status } = newOrder;

    const result = await pool.query(
        `INSERT INTO orders (table_id, date, items, total, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
        [table_id, date, items, total, status]
    );

    return result.rows[0];
};

router.post('/', async (req, res) => {
    try {
        const newOrder = req.body;


        const savedOrder = await saveOrder({
            table_id: newOrder.table_id,
            date: newOrder.date,
            items: JSON.stringify(newOrder.items),
            total: newOrder.total,
            status: newOrder.status,
        });
        broadcast ({ type: 'new_order', order: savedOrder });

        res.status(201).json({ message: 'Sipariş Alındı!', order: savedOrder });
    } catch (error) {
        console.error('Sipariş kaydedilirken hata:', error);
        res.status(500).json({ message: 'Bir hata oluştu', error: error.message });
    }
});


router.get('/', (req, res) => {
    const orders = getOrders();
    res.json(orders);
});

router.get('/history/:table_id', async (req, res) => {
    const tableId = req.params.table_id;

    try {
        const result = await pool.query(
            "SELECT * FROM orders WHERE table_id = $1 AND status != 'Ödendi' ORDER BY date DESC;",
            [tableId]
        );
        broadcast({ type: 'history_order', order: result.rows[0] });
        res.json(result.rows);
    } catch (err) {
        console.error('Sipariş geçmişi alınırken hata oluştu:', err);
        res.status(500).send('Bir hata oluştu.');
    }
});


module.exports = router;