// Local PeerJS signalling server for online tests: node tests/online/peer-server.cjs [port]
const http = require('http');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const port = Number(process.argv[2] ?? 9000);
const app = express();
const server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
server.listen(port, '127.0.0.1', () => console.log(`peer server on 127.0.0.1:${port}`));
