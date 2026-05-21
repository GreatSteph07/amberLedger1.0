const express = require('express')
const app = express()
const { hash, calcolaMerkleRoot, validaBlocco, validaChain, validaChainParziale, leggiChain, salvaChain, PREFISSO, DIFFICOLTA, sincronizzazione, propagaBlocco, propagaPromessa } = require('./functions')

let isMining = false

app.use(express.json()) // permette di leggere il body delle richieste POST
app.use(express.static('public')) // serve i file statici della cartella public

app.get('/chain', (req, res) => { //endpoint che restituisce la chain
    let chain = leggiChain()
    res.json(chain)
})

app.get('/status', (req, res) => { //endpoint che restituisce lo stato del server e della chain
    let chain = leggiChain()
    res.json({
        altezza: chain.blocchi.length,
        mempool: chain.mempool.length,
        mining: isMining
    })
})

app.post("/promessa", (req, res) => { //endpoint che riceve una promessa e la salva
    const chain = leggiChain()
    const mempool = chain.mempool
    const promessa = req.body.testo
    if (!promessa || promessa.trim() === '') {
        return res.status(400).json({ errore: 'la promessa non può essere vuota' })
    }
    if (chain.mempool.includes(promessa)) {
        return res.status(400).json({ errore: 'promessa già nel mempool' })
    }
    mempool.push(promessa)
    propagaPromessa(promessa) //manda la promessa agli altri peer
    salvaChain(chain)
    avviaMining()
    res.json({})
})

app.post("/blocco", async (req, res) => {
    let chain = leggiChain()
    const blocco = req.body
    // scarta se abbiamo già un blocco con questo indice
    if (chain.blocchi.find(b => b.indice === blocco.indice)) {
        return res.status(409).json({ errore: 'blocco già presente' })
    }

    const ultimoBlocco = chain.blocchi[chain.blocchi.length - 1]

    if (!validaBlocco(blocco)){
        return res.status(400).json({ errore: 'blocco non valido' })
    }
    if (ultimoBlocco && blocco.hashPrecedente !== ultimoBlocco.hash) {
        chain = await sincronizzazione(chain)
    }

    chain.blocchi.push(blocco)
    chain.mempool = chain.mempool.filter(p => !blocco.promesse.includes(p))
    salvaChain(chain)
    avviaMining()


    res.json({})
})

app.get('/verifica', (req, res) => {
    const chain = leggiChain()
    const integra = validaChain(chain.blocchi)
    res.json({ integra })
})

app.get('/sfoglia', (req, res) => {
    res.sendFile(__dirname + '/public/sfoglia.html')
})

app.get('/reset', (req, res) => {
    salvaChain({ blocchi: [], mempool: [] })
    res.json({ ok: true })
})

async function avviaMining(){

    const chain = leggiChain()
    let mempool = chain.mempool        // array delle promesse in attesa
    let blocchi = chain.blocchi        // array dei blocchi
    if (mempool.length === 0) {
        isMining = false
        setTimeout(avviaMining, 1000)
        return
    }

    let mempoolCongelato = [...mempool] //copia il contenuto del mempool in quello congelato
    const merkleRootCorrente = calcolaMerkleRoot(mempoolCongelato)

    const hashPrecedente = //crea una variabile che contenga l'hash precedente
        blocchi.length > 0 //se ci sono dei blocchi
            ? blocchi[blocchi.length - 1].hash //prende l'hash del blocco prima
            : '0'.repeat(64) //se non ce ne sono vuol dire che è il genesi

    let nonce = 0 ;
    const data = new Date().toISOString()


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
            blocchi.push(blocco) //aggiunge il blocco alla chain

            chain.mempool = chain.mempool.filter(p => !mempoolCongelato.includes(p))  // rimuovi dal mempool le promesse già incluse

            chain.blocchi = blocchi // salva
            salvaChain(chain)

            propagaBlocco(blocco)

            avviaMining() // riavvia il mining
            return
        }
        nonce++
        if (nonce % 1000 === 0) {
            await new Promise(r => setImmediate(r)) //ogni tanto permette al server di accettare le richieste arrivate nel frattempo
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