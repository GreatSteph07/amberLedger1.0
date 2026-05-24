const crypto = require('crypto')
const fs = require('fs')

const DIFFICOLTA = 4
const PREFISSO = '0'.repeat(DIFFICOLTA)
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : []

// calcola sha256 di un testo e restituisce la stringa hex
function hash(testo) {
    return crypto.createHash('sha256').update(testo).digest('hex')
}

// calcola il merkle root di un array di promesse
function calcolaMerkleRoot(promesse) {
    if (promesse.length === 0) return hash('blocco_vuoto')
    return merkleRoot(promesse.map(p => hash(JSON.stringify(p))))
}

// calcola ricorsivamente il merkle root di un array di hash
function merkleRoot(array) {
    if (array.length === 1) return array[0]
    if (array.length % 2 === 1) array.push(array[array.length - 1])
    const arrayNuovo = []
    for (let i = 0; i < array.length; i += 2) {
        arrayNuovo[i / 2] = hash(array[i] + array[i + 1])
    }
    return merkleRoot(arrayNuovo)
}

// verifica che il proof-of-work e l'hash di un blocco siano corretti
function validaBlocco(blocco) {
    if (!blocco.hash.startsWith(PREFISSO)) return false
    const hashAtteso = hash(blocco.indice + blocco.data + blocco.merkleRoot + blocco.hashPrecedente + blocco.nonce)
    return blocco.hash === hashAtteso
}

// verifica l'intera chain controllando ogni blocco e il collegamento tra essi
function validaChain(blocchi) {
    if (blocchi.length === 0) return true
    if (!validaBlocco(blocchi[0])) return false
    for (let i = 1; i < blocchi.length; i++) {
        if (!validaBlocco(blocchi[i])) return false
        if (blocchi[i].hashPrecedente !== blocchi[i - 1].hash) return false
    }
    return true
}

// valida solo gli ultimi n blocchi
function validaChainParziale(blocchi, quantita) {
    return validaChain(blocchi.slice(-quantita))
}

// legge la chain dal file, la crea se non esiste
function leggiChain() {
    if (!fs.existsSync('chain.json')) {
        fs.writeFileSync('chain.json', JSON.stringify({ blocchi: [], mempool: [] }))
    }
    return JSON.parse(fs.readFileSync('chain.json', 'utf8'))
}

// salva la chain sul file
function salvaChain(chain) {
    fs.writeFileSync('chain.json', JSON.stringify(chain, null, 2))
}

// sincronizza la chain locale con quella dei peer, tenendo la più lunga valida
async function sincronizzazione(chainAttuale) {
    for (const peer of PEERS) {
        try {
            const risposta = await fetch(peer + '/chain')
            const dati = await risposta.json()

            // trova il punto di divergenza tra le due chain
            let puntoComune = -1
            for (let i = 0; i < Math.min(chainAttuale.blocchi.length, dati.blocchi.length); i++) {
                if (chainAttuale.blocchi[i].hash === dati.blocchi[i].hash) {
                    puntoComune = i
                } else {
                    break
                }
            }

            // accetta la chain del peer solo se è più lunga dopo il punto comune
            const lunghezzaPeer = dati.blocchi.length - puntoComune
            const lunghezzaMia = chainAttuale.blocchi.length - puntoComune
            if (lunghezzaPeer > lunghezzaMia && validaChainParziale(dati.blocchi, 5)) {
                chainAttuale = dati
                // rimuove dal mempool le promesse già incluse nei nuovi blocchi
                const giàValidate = dati.blocchi.flatMap(b => b.promesse)
                chainAttuale.mempool = chainAttuale.mempool.filter(p => !giàValidate.includes(p))
            }
        } catch (e) {
            console.log(`peer non raggiungibile: ${peer}`)
        }
    }
    return chainAttuale
}

// propaga un blocco trovato a tutti i peer
async function propagaBlocco(blocco) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Peer': 'true'
    }
    for (const peer of PEERS) {
        try {
            await fetch(peer + '/blocco', {
                method: 'POST',
                headers,
                body: JSON.stringify(blocco)
            })
        } catch (e) {
            console.log(`peer non raggiungibile: ${peer}`)
        }
    }
}

module.exports = { hash, calcolaMerkleRoot, merkleRoot, validaBlocco, validaChain, validaChainParziale, leggiChain, salvaChain, PREFISSO, DIFFICOLTA, sincronizzazione, propagaBlocco }