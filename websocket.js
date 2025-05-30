const WebSocket = require('ws');

const orderServer = new WebSocket.Server({ port: 8080 });

const clients = [];

orderServer.on('connection', (ws) => {
    console.log('Bir istemci bağlandı.');

    let clientPage = ''; 

    ws.on('message', (message) => {
        const data = JSON.parse(message);
    
        if (data.type === 'set_page') {
            clientPage = data.page;
            const index = clients.findIndex(client => client.ws === ws);
            if (index !== -1) {
                clients[index].page = clientPage;
            }
        }
    });
    
    ws.on('close', () => {
        console.log('Bir istemci bağlantıyı kapattı.');
        const index = clients.findIndex(client => client.ws === ws);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });
    clients.push({ ws, page: clientPage || 'unknown' });

});

function broadcast(data) {
    clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            switch (client.page) {
                case 'mutfak':
                    if (data.type === 'new_order') {
                        client.ws.send(JSON.stringify(data));
                    }
                    break;
                case 'garson':
                    if (data.type === 'update_order') {
                        client.ws.send(JSON.stringify(data));
                    }
                    break;
                case 'kasiyer':
                    if (data.type === 'payment_received') {
                        client.ws.send(JSON.stringify(data));
                    }
                    break;
                default:
                    break;
            }
        }
    });
}

const callServer = new WebSocket.Server({ port: 8081 });
const callClients = new Set();

callServer.on('connection', (ws) => {
    console.log('Masa çağrı istemcisi bağlandı.');
    callClients.add(ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        callClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });

    ws.on('close', () => {
        console.log('Masa çağrı istemcisi bağlantıyı kapattı.');
        callClients.delete(ws);
    });
});

module.exports = { broadcast };