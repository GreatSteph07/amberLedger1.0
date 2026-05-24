const express = require('express')
const app = express()

// lista dei tre peer della rete
const PEERS = [
    'https://amberledger1-0-peer1.onrender.com',
    'https://amberledger1-0-peer2.onrender.com',
    'https://amberledger1-0-peer3.onrender.com'
]

// redirect su un peer casuale mantenendo il path originale
app.get('/{*path}', (req, res) => {
    const peer = PEERS[Math.floor(Math.random() * PEERS.length)]
    res.redirect(peer + req.path)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`redirect server avviato sulla porta ${PORT}`)
})

