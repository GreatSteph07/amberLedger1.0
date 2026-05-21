const crypto = require('crypto')
const fs = require('fs')

const DIFFICOLTA = 4 //zeri necessari dal proof of work
const PREFISSO = "0".repeat(DIFFICOLTA)
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : [] //se esistono i peers li splitta, altrimenti mette un array vuoto

function hash(testo) {
    return crypto.createHash('sha256').update(testo).digest('hex')
}

function calcolaMerkleRoot(promesse) {
    if (promesse.length === 0) {
        return hash('blocco_vuoto')
    }else{
        return merkleRoot(promesse.map(p => hash(p))) //restituisce un array di lunghezza uguale che contiene gli hash
    }
}

function merkleRoot(array) {
    if (array.length === 1) {
        return array[0]
    }
    if (array.length % 2 === 1) {
        array.push(array[array.length - 1])
    }
    let arrayNuovo = []
    for (let i = 0; i < array.length; i+= 2) {
        arrayNuovo[i/2] = hash(array[i] + array[i+1])
    }
    return merkleRoot(arrayNuovo)
}

function validaBlocco(blocco) {
    if (!blocco.hash.startsWith(PREFISSO)) {
        return false
    }
    const hashAtteso = hash(blocco.indice + blocco.data + blocco.merkleRoot + blocco.hashPrecedente + blocco.nonce)
    return blocco.hash === hashAtteso
}

function validaChain(blocchi) {
    if (blocchi.length === 0) return true //se la chain è vuota è valida
    if (!validaBlocco(blocchi[0])) return false //valida il blocco genesi separatamente
    for (let i = 1; i < blocchi.length; i++) { //i = 1 perchè salta il blocco genesi
        if (!validaBlocco(blocchi[i])) return false //valida i blocchi
        if (blocchi[i].hashPrecedente !== blocchi[i-1].hash) return false //si assicura che gli hash siano quelli attesi
    }
    return true
}

function validaChainParziale(blocchi, quantita) {
    return validaChain(blocchi.slice(- quantita)) //valida solo gli ultimi n blocchi dell'array e ritorna true o false
}

function leggiChain(){
    if (!fs.existsSync("chain.json")){ //se il file non esiste
        fs.writeFileSync("chain.json", JSON.stringify({ blocchi: [], mempool: []})) //lo crea
    }
    return JSON.parse(fs.readFileSync("chain.json", "utf8")) //legge il contenuto del file json
}

function salvaChain(chain){
    fs.writeFileSync("chain.json", JSON.stringify(chain, null, 2)) //scrive il contenuto della chain sul file json indentato
}

async function sincronizzazione(chainAttuale) {
    for (const peer of PEERS) {
        try {
            let chainPeer = await fetch(peer + "/chain", {
                method: 'GET',
                headers: {'Content-Type': 'application/json'},
            })
            const dati = await chainPeer.json()
            // trova l'ultimo blocco in comune
            let puntoComune = -1
            for (let i = 0; i < Math.min(chainAttuale.blocchi.length, dati.blocchi.length); i++) {
                if (chainAttuale.blocchi[i].hash === dati.blocchi[i].hash) {
                    puntoComune = i
                } else {
                    break
                }
            }
            // accetta solo se il peer ha più blocchi dopo il punto comune
            const lunghezzaPeer = dati.blocchi.length - puntoComune
            const lunghezzaMia = chainAttuale.blocchi.length - puntoComune
            if (lunghezzaPeer > lunghezzaMia) {
                if (validaChainParziale(dati.blocchi, 5)) {
                    chainAttuale = dati
                    // pulisci il mempool dalle promesse già nei nuovi blocchi
                    const promesseGiaValidate = dati.blocchi.flatMap(b => b.promesse)
                    chainAttuale.mempool = chainAttuale.mempool.filter(p => !promesseGiaValidate.includes(p))
                }
            }
        } catch (e) {
            console.log(`peer non raggiungibile: `, peer)
        }
    }

    return chainAttuale
}

async function propagaBlocco(blocco){
    for (const peer of PEERS) {
        try {
            let propagazione = await fetch(peer + "/blocco", {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(blocco)
            })
        }catch (e) {
            console.log(`peer non raggiungibile: `, peer)
        }
    }
}

async function propagaPromessa(promessa){
    for (const peer of PEERS) {
        try {
            let propagazione = await fetch(peer + "/promessa", {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ testo: promessa })
            })
        }catch (e) {
            console.log(`peer non raggiungibile: `, peer)
        }
    }
}




module.exports = { hash, calcolaMerkleRoot, merkleRoot, validaBlocco, validaChain, validaChainParziale, leggiChain, salvaChain, PREFISSO, DIFFICOLTA, sincronizzazione, propagaBlocco, propagaPromessa}