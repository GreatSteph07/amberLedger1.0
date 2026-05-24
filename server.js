const express = require('express')
const app = express()
const { hash, calcolaMerkleRoot, validaBlocco, validaChain, validaChainParziale, leggiChain, salvaChain, PREFISSO, sincronizzazione, propagaBlocco } = require('./functions')

let isMining = false
let bloccato = false

app.use(express.json())
app.use(express.static('public'))
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
    next()
})

// restituisce la chain completa
app.get('/chain', (req, res) => {
    res.json(leggiChain())
})

// restituisce lo stato del nodo
app.get('/status', (req, res) => {
    const chain = leggiChain()
    res.json({
        altezza: chain.blocchi.length,
        mempool: chain.mempool.length,
        mining: isMining
    })
})

// verifica l'integrità della chain
app.get('/verifica', (req, res) => {
    const chain = leggiChain()
    res.json({ integra: validaChain(chain.blocchi) })
})

// restituisce tutte le promesse di una chiave pubblica scorrendo la chain
app.get('/mie-promesse/:chiavePubblica', (req, res) => {
    const chain = leggiChain()
    const chiave = req.params.chiavePubblica
    const promesse = chain.blocchi
        .flatMap(b => b.promesse)
        .filter(p => p.autore === chiave)
    res.json({ promesse })
})

// serve la pagina di esplorazione
app.get('/sfoglia', (req, res) => {
    res.sendFile(__dirname + '/public/sfoglia.html')
})

// svuota la chain e blocca il mining
app.get('/reset', (req, res) => {
    bloccato = true
    salvaChain({ blocchi: [], mempool: [] })
    res.json({ ok: true })
})

// riavvia il mining
app.get('/start', (req, res) => {
    bloccato = false
    avviaMining()
    res.json({ ok: true })
})

// riceve una promessa (oggetto con testo, autore, firma) e avvia il mining
app.post('/promessa', (req, res) => {
    const chain = leggiChain()
    const promessa = req.body // { testo, autore, firma }

    if (!promessa.testo || promessa.testo.trim() === '') {
        return res.status(400).json({ errore: 'la promessa non può essere vuota' })
    }
    if (!promessa.autore || !promessa.firma) {
        return res.status(400).json({ errore: 'promessa non firmata' })
    }
    if (chain.mempool.find(p => p.testo === promessa.testo && p.autore === promessa.autore)) {
        return res.status(400).json({ errore: 'promessa già nel mempool' })
    }

    chain.mempool.push(promessa)
    salvaChain(chain)
    avviaMining()
    res.json({})
})

// riceve un blocco da un peer e lo aggiunge alla chain
app.post('/blocco', async (req, res) => {
    let chain = leggiChain()
    const blocco = req.body

    if (chain.blocchi.find(b => b.indice === blocco.indice)) {
        return res.status(409).json({ errore: 'blocco già presente' })
    }
    if (!validaBlocco(blocco)) {
        return res.status(400).json({ errore: 'blocco non valido' })
    }

    const ultimoBlocco = chain.blocchi[chain.blocchi.length - 1]
    if (ultimoBlocco && blocco.hashPrecedente !== ultimoBlocco.hash) {
        chain = await sincronizzazione(chain)
    }

    chain.blocchi.push(blocco)
    // rimuove dal mempool le promesse già incluse nel blocco confrontando testo e autore
    chain.mempool = chain.mempool.filter(mp =>
        !blocco.promesse.find(bp => bp.testo === mp.testo && bp.autore === mp.autore)
    )
    salvaChain(chain)
    avviaMining()
    res.json({})
})

async function avviaMining() {
    if (bloccato) return
    const chain = leggiChain()
    const mempool = chain.mempool
    const blocchi = chain.blocchi

    if (mempool.length === 0) {
        isMining = false
        setTimeout(avviaMining, 1000)
        return
    }

    const mempoolCongelato = [...mempool]
    const merkleRootCorrente = calcolaMerkleRoot(mempoolCongelato)
    const hashPrecedente = blocchi.length > 0
        ? blocchi[blocchi.length - 1].hash
        : '0'.repeat(64)
    const data = new Date().toISOString()
    let nonce = 0

    isMining = true
    while (true) {
        const tentativo = hash(String(blocchi.length) + data + merkleRootCorrente + hashPrecedente + nonce)
        if (tentativo.startsWith(PREFISSO)) {
            const blocco = {
                indice: blocchi.length,
                data: data,
                promesse: mempoolCongelato,
                merkleRoot: merkleRootCorrente,
                hashPrecedente: hashPrecedente,
                nonce: nonce,
                hash: tentativo
            }
            blocchi.push(blocco)
            chain.mempool = chain.mempool.filter(mp =>
                !mempoolCongelato.find(bp => bp.testo === mp.testo && bp.autore === mp.autore)
            )
            chain.blocchi = blocchi
            salvaChain(chain)
            propagaBlocco(blocco)
            avviaMining()
            return
        }
        nonce++
        if (nonce % 1000 === 0) {
            await new Promise(r => setImmediate(r))
        }
    }
}

app.listen(3000, async () => {
    console.log('server avviato sulla porta 3000')
    let chain = leggiChain()
    chain = await sincronizzazione(chain)
    salvaChain(chain)
    avviaMining()
})
