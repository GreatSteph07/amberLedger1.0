const { hash, calcolaMerkleRoot, validaBlocco, validaChain, validaChainParziale } = require('./functions')

let passati = 0
let falliti = 0

function test(descrizione, risultato, atteso) {
    const ok = risultato === atteso
    console.log(ok ? '✓' : '✗', descrizione)
    if (!ok) console.log('  atteso:', atteso, '| ottenuto:', risultato)
    ok ? passati++ : falliti++
}

// ─── hash ───────────────────────────────────────────────────────────────────
console.log('\n── hash ──')
test('stesso input stesso output',      hash('ciao') === hash('ciao'),  true)
test('input diversi output diversi',    hash('ciao') === hash('ciao!'), false)
test('lunghezza sempre 64',             hash('ciao').length,            64)
test('valore atteso di "ciao"',         hash('ciao'), 'b133a0c0e9bee3be20163d2ad31d6248db292aa6dcb1ee087a2aa50e0fc75ae2')

// ─── calcolaMerkleRoot ───────────────────────────────────────────────────────
console.log('\n── calcolaMerkleRoot ──')
test('array vuoto',     calcolaMerkleRoot([]),              'ec54ccf494f0102c3d1661d0641b8256c8064db859241a959d7e02d13c21d23c')
test('un elemento',     calcolaMerkleRoot(['ciao']),        'b133a0c0e9bee3be20163d2ad31d6248db292aa6dcb1ee087a2aa50e0fc75ae2')
test('due elementi',    calcolaMerkleRoot(['ciao','mondo']),'a23627986f4163993481ebe72e131b46978be3833693c7e452e9c6911a6a9650')
test('tre elementi',    calcolaMerkleRoot(['a','b','c']),   '0bdf27bf7ec894ca7cadfe491ec1a3ece840f117989e8c5e9bd7086467bf6c38')

// ─── validaBlocco ────────────────────────────────────────────────────────────
console.log('\n── validaBlocco ──')

const DIFFICOLTA = 4
const PREFISSO = '0'.repeat(DIFFICOLTA)

// blocco valido costruito a mano cercando un nonce
function costruisciBloccoValido() {
    const indice = 0
    const data = '2024-01-01T00:00:00.000Z'
    const merkleRootVal = calcolaMerkleRoot(['promessa di test'])
    const hashPrecedente = '0'.repeat(64)
    let nonce = 0
    while (true) {
        const h = hash(String(indice) + data + merkleRootVal + hashPrecedente + nonce)
        if (h.startsWith(PREFISSO)) {
            return { indice, data, promesse: ['promessa di test'], merkleRoot: merkleRootVal, hashPrecedente, nonce, hash: h }
        }
        nonce++
    }
}

console.log('  (cerco un nonce valido, potrebbe richiedere qualche secondo...)')
const bloccoValido = costruisciBloccoValido()
test('blocco valido',                   validaBlocco(bloccoValido),  true)
test('blocco con hash manomesso',       validaBlocco({ ...bloccoValido, hash: 'abc' }), false)
test('blocco con nonce sbagliato',      validaBlocco({ ...bloccoValido, nonce: bloccoValido.nonce + 1 }), false)

// ─── validaChain ─────────────────────────────────────────────────────────────
console.log('\n── validaChain ──')
test('chain vuota',     validaChain([]), true)
test('chain con un blocco valido', validaChain([bloccoValido]), true)

// secondo blocco collegato al primo
function costruisciSecondoBlocco(primo) {
    const indice = 1
    const data = '2024-01-02T00:00:00.000Z'
    const merkleRootVal = calcolaMerkleRoot(['seconda promessa'])
    const hashPrecedente = primo.hash
    let nonce = 0
    while (true) {
        const h = hash(String(indice) + data + merkleRootVal + hashPrecedente + nonce)
        if (h.startsWith(PREFISSO)) {
            return { indice, data, promesse: ['seconda promessa'], merkleRoot: merkleRootVal, hashPrecedente, nonce, hash: h }
        }
        nonce++
    }
}

console.log('  (cerco il secondo nonce valido...)')
const secondoBlocco = costruisciSecondoBlocco(bloccoValido)
test('chain con due blocchi validi',    validaChain([bloccoValido, secondoBlocco]), true)
test('chain con hashPrecedente rotto',  validaChain([bloccoValido, { ...secondoBlocco, hashPrecedente: 'abc' }]), false)

// ─── validaChainParziale ──────────────────────────────────────────────────────
console.log('\n── validaChainParziale ──')
test('parziale valida',   validaChainParziale([bloccoValido, secondoBlocco], 2), true)
test('parziale quantita maggiore della chain', validaChainParziale([bloccoValido], 5), true)

// ─── riepilogo ───────────────────────────────────────────────────────────────
console.log(`\n── riepilogo: ${passati} passati, ${falliti} falliti ──\n`)

